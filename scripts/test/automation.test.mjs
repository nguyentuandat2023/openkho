// Kiểm thử hệ thống tự động. Chạy trong thư mục tạm (OPENKHO_DATA_DIR/OPENKHO_CACHE_DIR) — không đụng dữ liệu thật.
// Không gọi GitHub API hay Claude API thật: dùng fetch/client giả lập.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'openkho-test-'));
process.env.OPENKHO_DATA_DIR = path.join(TMP, 'data');
process.env.OPENKHO_CACHE_DIR = path.join(TMP, 'cache');
delete process.env.GITHUB_TOKEN;
delete process.env.GH_TOKEN;
delete process.env.ANTHROPIC_API_KEY;
fs.mkdirSync(process.env.OPENKHO_DATA_DIR, { recursive: true });
fs.copyFileSync(new URL('../../data/areas.yaml', import.meta.url), path.join(process.env.OPENKHO_DATA_DIR, 'areas.yaml'));

// Nạp module SAU khi đặt biến môi trường (import động)
const { normalizeSettings, normalizedWeights, DEFAULTS } = await import('../lib/settings.mjs');
const { openSnapshots, windowGrowth, growthAll, WINDOWS } = await import('../lib/snapshots.mjs');
const { computeTrending } = await import('../lib/trending.mjs');
const { classify } = await import('../lib/classify.mjs');
const { detectClusters } = await import('../lib/rank.mjs');
const { classifyLicense } = await import('../lib/license.mjs');
const { upsertRadar, markMissing, enforceRadarLimit, isExcluded, loadModeration } = await import('../lib/radar.mjs');
const { dueInfo, acquireLock, releaseLock, lockStatus, loadState, saveState, LOCK_FILE } = await import('../lib/scheduler/state.mjs');
const { runJob, recoverInterrupted } = await import('../lib/scheduler/runner.mjs');
const { RateLimitError } = await import('../lib/http.mjs');
const { verifyAnalysis, analyzeRepo, aiAvailable } = await import('../lib/ai.mjs');
const { createAuth } = await import('../admin/auth.mjs');
const { buildQueries } = await import('../lib/jobs/discover.mjs');
const { resolveMissing, searchRepos } = await import('../lib/github.mjs');

const H = 3600000;
const D = 86400000;
const NOW = Date.parse('2026-11-16T12:00:00Z');
const settings = normalizeSettings({}).settings;

// ------------------------------------------------------------------ Cấu hình
test('cấu hình: giá trị sai bị thay bằng mặc định kèm cảnh báo; trọng số quy về tổng 100', () => {
  const { settings: s, warnings } = normalizeSettings({ scheduler: { jobs: { discover: { interval_hours: -1 } }, unknown: 1 }, trending: { weights: { star_growth: 70, activity: 20, community: 15, momentum: 15, docs: 10, maintenance: 5 } } });
  assert.equal(s.scheduler.jobs.discover.interval_hours, 3);
  assert.ok(warnings.some((w) => w.includes('interval_hours')));
  assert.ok(warnings.some((w) => w.includes('không được hỗ trợ')));
  const w = normalizedWeights(s);
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(Math.abs(w.star_growth - (70 / 135) * 100) < 1e-9);
  assert.deepEqual(DEFAULTS.trending.weights, { star_growth: 35, activity: 20, community: 15, momentum: 15, docs: 10, maintenance: 5 });
});

// ------------------------------------------------------------------ Tăng trưởng (chỉ số liệu thật)
const W1 = WINDOWS.find((w) => w.key === 'd1');
const W7 = WINDOWS.find((w) => w.key === 'd7');

test('tăng trưởng 24 giờ = hiệu hai lần đo thật cách nhau ~24 giờ', () => {
  const pts = [[NOW - 25 * H, 1000, 100], [NOW - 12 * H, 1100, 105], [NOW - H, 1300, 110]];
  const g = windowGrowth(pts, W1, { now: NOW, created_at: '2025-01-01T00:00:00Z', stars: 1300 });
  assert.equal(g.method, 'snapshots');
  assert.equal(g.delta, 300);
  assert.equal(g.forks_delta, 10);
  assert.equal(g.base_stars, 1000);
  assert.equal(g.span_hours, 24);
});

test('không có lần đo phù hợp và repo không mới → null (không tự tạo lịch sử)', () => {
  assert.equal(windowGrowth([[NOW - H, 5000, 10]], W7, { now: NOW, created_at: '2020-01-01T00:00:00Z', stars: 5000 }), null);
  // Lần đo cũ nằm ngoài biên dung sai (7 ngày ± 1 ngày) → không dùng
  assert.equal(windowGrowth([[NOW - 12 * D, 4000, 10], [NOW - H, 5000, 10]], W7, { now: NOW, created_at: '2020-01-01T00:00:00Z' }), null);
  // Lần đo mới nhất quá cũ → không tính "24 giờ qua"
  assert.equal(windowGrowth([[NOW - 50 * H, 4000, 10], [NOW - 26 * H, 5000, 10]], W1, { now: NOW, created_at: '2020-01-01T00:00:00Z' }), null);
});

test('repo tạo trong kỳ: toàn bộ số sao phát sinh trong kỳ (chính xác)', () => {
  const g = windowGrowth([[NOW - H, 800, 40]], W7, { now: NOW, created_at: new Date(NOW - 3 * D).toISOString(), stars: 800, forks: 40, measured_at: new Date(NOW - H).toISOString() });
  assert.equal(g.method, 'created_in_window');
  assert.equal(g.delta, 800);
  assert.equal(g.base_stars, 0);
});

test('mẫu stargazer chỉ dùng khi bao trùm cả kỳ', () => {
  const sg = { sampled_at: new Date(NOW - H).toISOString(), d1: { stars: 37, exact: true }, d7: { stars: 120, exact: false }, d30: { stars: 120, exact: false } };
  const all = growthAll([], { now: NOW, created_at: '2020-01-01T00:00:00Z', stars: 9000, stargazers: sg });
  assert.equal(all.d1.method, 'stargazer_sample');
  assert.equal(all.d1.delta, 37);
  assert.equal(all.d7, null, 'mẫu không đủ dài → không đoán');
});

test('kho snapshot: gộp lần đo trùng, mỗi ngày giữ lần đo cuối, từ chối thời điểm tương lai, lưu/đọc lại', () => {
  const s = openSnapshots({ now: NOW });
  assert.equal(s.record('42', { stars: 10, forks: 1, at: NOW - 3 * H }), true);
  assert.equal(s.record('42', { stars: 11, forks: 1, at: NOW - 3 * H + 5 * 60000 }), true); // < 20 phút → thay thế
  assert.equal(s.record('42', { stars: 15, forks: 2, at: NOW - H }), true);
  assert.equal(s.record('42', { stars: 99, forks: 2, at: NOW + 2 * H }), false, 'không nhận điểm ở tương lai');
  assert.equal(s.record('42', { stars: NaN, at: NOW }), false);
  assert.deepEqual(s.series('42').map((p) => p[1]), [11, 15]);
  assert.equal(s.dailySeries('42').length, 1, 'một điểm mỗi ngày');
  s.save({ recentHours: 60 });
  const again = openSnapshots({ now: NOW });
  assert.deepEqual(again.series('42').map((p) => p[1]), [11, 15]);
  again.forget(['42']);
  assert.equal(again.has('42'), false);
});

// ------------------------------------------------------------------ Trending Score
function rec(over = {}) {
  const { meta, ...rest } = over;
  return {
    status: 'ok',
    meta: { stars: 5000, forks: 500, open_issues: 20, has_issues: true, has_discussions: false, archived: false, created_at: '2024-01-01T00:00:00Z', pushed_at: new Date(NOW - 2 * H).toISOString(), description: 'x', topics: ['a', 'b', 'c'], homepage: null, ...(meta || {}) },
    activity: { last_commit_at: new Date(NOW - 2 * H).toISOString(), commits_90d: 60, source: 'atom' },
    readme: { length: 6000, sections: { install: true, usage: true } },
    contributors: { count: 40 },
    release_checked: true,
    release: { tag: 'v1', published_at: new Date(NOW - 10 * D).toISOString() },
    lic: classifyLicense('MIT'),
    growth: { d1: null, d7: null, d30: null },
    ...rest,
  };
}
const snapG = (gained, base, forks = Math.round(gained * 0.05)) => ({ method: 'snapshots', delta: gained, gained, forks_gained: forks, span_hours: 168, base_stars: base, from: new Date(NOW - 7 * D).toISOString(), to: new Date(NOW).toISOString() });

test('trending: không có số liệu tăng trưởng → không có điểm; repo archived → không xếp hạng', () => {
  const t = computeTrending(rec(), settings, NOW);
  assert.equal(t.d7, null);
  const a = computeTrending(rec({ meta: { archived: true }, growth: { d1: null, d7: snapG(500, 5000), d30: null } }), settings, NOW);
  assert.equal(a.d7, null);
});

test('trending: điểm 0–100 có lý do bằng số liệu thật và độ phủ', () => {
  const t = computeTrending(rec({ growth: { d1: null, d7: snapG(700, 5000), d30: null } }), settings, NOW).d7;
  assert.ok(t.score > 0 && t.score <= 100);
  assert.ok(t.coverage >= 0.9);
  assert.ok(t.reasons.some((r) => r.includes('+700 sao')));
  assert.ok(t.reasons.some((r) => r.includes('60 commit')));
});

test('trending: repo nhỏ tăng mạnh tương đối không bị repo lớn tăng ít tương đối áp đảo', () => {
  const big = computeTrending(rec({ meta: { stars: 300000, forks: 30000 }, growth: { d1: null, d7: snapG(1400, 298600), d30: null } }), settings, NOW).d7;
  const small = computeTrending(rec({ meta: { stars: 1200, forks: 120 }, growth: { d1: null, d7: snapG(700, 500), d30: null } }), settings, NOW).d7;
  assert.ok(small.components.star_growth.value >= big.components.star_growth.value, `${small.components.star_growth.value} vs ${big.components.star_growth.value}`);
});

test('trending: thiếu dữ liệu → loại khỏi phép tính, độ phủ thấp hơn ngưỡng → không xếp hạng', () => {
  const thin = rec({ activity: null, readme: null, contributors: null, release_checked: false, meta: { pushed_at: null, has_issues: false }, lic: classifyLicense(null), growth: { d1: null, d7: snapG(300, 1000, null), d30: null } });
  const t = computeTrending(thin, settings, NOW).d7;
  assert.ok(t.coverage < settings.trending.min_coverage);
  assert.equal(t.score, null);
  assert.equal(t.insufficient, true);
});

test('trending: tín hiệu bất thường (nhiều sao, gần như không fork) bị giảm trọng số và cảnh báo', () => {
  const normal = computeTrending(rec({ growth: { d1: null, d7: snapG(2000, 3000, 150), d30: null } }), settings, NOW).d7;
  const odd = computeTrending(rec({ growth: { d1: null, d7: snapG(2000, 3000, 1), d30: null } }), settings, NOW).d7;
  assert.ok(odd.anomaly && odd.warnings.length);
  assert.ok(odd.score < normal.score);
});

test('trending: repo tạo trong kỳ không được cộng thêm "tăng tương đối" và không có "tăng tốc" giả', () => {
  const created = { method: 'created_in_window', delta: 900, gained: 900, forks_gained: 60, span_hours: 72, base_stars: 0, from: new Date(NOW - 3 * D).toISOString(), to: new Date(NOW).toISOString() };
  const t = computeTrending(rec({ meta: { stars: 900, forks: 60, created_at: new Date(NOW - 3 * D).toISOString() }, growth: { d1: null, d7: created, d30: { ...created } } }), settings, NOW).d7;
  assert.equal(t.components.star_growth.share, 1);
  assert.ok(!t.reasons.some((r) => r.includes('Đang tăng tốc')));
});

test('trending: đổi trọng số làm thay đổi điểm (cấu hình được)', () => {
  const r = rec({ readme: null, growth: { d1: null, d7: snapG(700, 5000), d30: null } });
  const a = computeTrending(r, settings, NOW).d7.score;
  const s2 = normalizeSettings({ trending: { weights: { star_growth: 80, activity: 5, community: 5, momentum: 5, docs: 0, maintenance: 5 } } }).settings;
  const b = computeTrending(r, s2, NOW).d7.score;
  assert.notEqual(a, b);
});

// ------------------------------------------------------------------ Phân loại & spam
test('phân loại đa nhãn theo topic/mô tả, có độ tin cậy và tín hiệu; suy ra lĩnh vực cha', () => {
  const labels = classify({ topics: ['ai-agents', 'llm', 'mcp'], description: 'An agent framework for building autonomous AI agents', name: 'agentkit', readme_text: '', language: 'Python' });
  const slugs = labels.map((l) => l.slug);
  assert.ok(slugs.includes('ai-agents') && slugs.includes('llm'));
  assert.ok(slugs.includes('ai'), 'suy ra lĩnh vực cha AI');
  for (const l of labels) { assert.ok(l.confidence > 0 && l.confidence <= 0.99); assert.ok(l.signals.length > 0); }
  assert.deepEqual(classify({ topics: [], description: 'A tool', name: 'x', readme_text: 'database', language: 'Go' }), [], 'một lần nhắc trong README không đủ để gán nhãn');
});

test('phát hiện cụm repo nhân bản (spam/sao ảo); repo trùng tên bình thường không bị gắn', () => {
  const mk = (owner, name, stars, created) => ({ origin: 'radar', full_name: `${owner}/${name}`, raw: { meta: { stars, created_at: created, description: 'Free tool', size_kb: 181 } } });
  const t0 = '2026-11-15T16:46:04Z';
  const spam = [mk('a1', 'Cool-Checker-', 473, t0), mk('b2', 'Cool-Checker-', 473, t0), mk('c3', 'Cool-Checker-', 473, t0)];
  const legit = [mk('x', 'awesome-list', 900, '2020-01-01T00:00:00Z'), mk('y', 'awesome-list', 50, '2022-05-01T00:00:00Z'), mk('z', 'awesome-list', 4000, '2024-03-01T00:00:00Z')];
  const clusters = detectClusters([...spam, ...legit]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 3);
  assert.match(clusters[0].reason, /spam|sao ảo/);
});

test('phát hiện chiến dịch sao ảo phối hợp (repo khác tên, cùng ngày tạo, cùng số sao, không fork/issue)', () => {
  const day = new Date(Date.now() - 9 * D);
  const mk = (owner, name, stars, forks = 0, hoursOffset = 0, issues = 0) => ({ origin: 'radar', full_name: `${owner}/${name}`, raw: { meta: { stars, forks, open_issues: issues, created_at: new Date(day.getTime() + hoursOffset * H).toISOString(), description: name, size_kb: 400 } } });
  const campaign = ['photo-editor-pro', 'video-suite-setup', 'cad-standalone', 'audio-studio-desktop', 'office-installer', 'pdf-tool-crack'].map((n, i) => mk(`acc${i}`, n, 1100 + i * 5, i % 2, i * 3));
  const organic = [mk('real1', 'cool-lib', 1150, 120, 2, 14), mk('real2', 'new-agent', 1120, 80, 5, 9)];
  const out = detectClusters([...campaign, ...organic]);
  assert.equal(out.length, 1);
  assert.equal(out[0].members.length, 6);
  assert.ok(out[0].members.every((r) => r.full_name.startsWith('acc')), 'repo có fork/issue thật không bị gắn');
  assert.match(out[0].reason, /chiến dịch sao ảo/);
  assert.equal(detectClusters(campaign.slice(0, 4)).length, 0, 'dưới 5 repo → không kết luận');
});

// ------------------------------------------------------------------ Radar
test('radar: khóa GitHub ID — cập nhật, đổi tên không tạo trùng; repo mất được đánh dấu; giới hạn giữ repo đã xuất bản', () => {
  const radar = { repos: {} };
  const item = (id, full, stars) => ({ id, node_id: `N${id}`, full_name: full, name: full.split('/')[1], owner: { login: full.split('/')[0], type: 'User' }, stargazers_count: stars, forks_count: 1, topics: [], created_at: '2026-11-01T00:00:00Z', pushed_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z', html_url: `https://github.com/${full}`, default_branch: 'main' });
  assert.equal(upsertRadar(radar, item(1, 'a/one', 10), 'new7'), 'new');
  assert.equal(upsertRadar(radar, item(1, 'a/one', 12), 'popular'), 'updated');
  assert.equal(upsertRadar(radar, item(1, 'b/renamed', 13), null), 'renamed');
  assert.equal(Object.keys(radar.repos).length, 1);
  assert.equal(radar.repos['1'].renamed_from, 'a/one');
  assert.deepEqual(Object.keys(radar.repos['1'].seen_in).sort(), ['new7', 'popular']);
  markMissing(radar, 1, 'not_found');
  assert.equal(radar.repos['1'].status, 'not_found');
  for (let i = 2; i <= 6; i++) upsertRadar(radar, item(i, `o/r${i}`, i), 'x');
  const dropped = enforceRadarLimit(radar, 3, new Set(['2']));
  assert.equal(Object.keys(radar.repos).length, 3);
  assert.ok(!dropped.includes('2'), 'repo đã xuất bản/được ghim được giữ');
  const mod = { ...loadModeration(), excluded_owners: { spammer: { at: 'x' } } };
  assert.equal(isExcluded(mod, 99, 'Spammer/tool'), true);
});

test('khám phá: chỉ dùng truy vấn Search API chính thức, có giới hạn, xoay vòng topic', () => {
  const { queries, nextCursor, rotatingTotal } = buildQueries(settings, NOW, { topic: 0 });
  assert.equal(queries.length, settings.discovery.max_queries_per_run);
  assert.ok(queries.some((q) => q.group === 'new7' && q.q.includes('created:>=2026-11-09')));
  assert.ok(queries.every((q) => !/trending/i.test(q.q)));
  const second = buildQueries(settings, NOW, nextCursor);
  assert.notEqual(second.queries.at(-1).group, queries.at(-1).group);
  assert.equal(rotatingTotal, settings.discovery.topics.length * 2);
});

// ------------------------------------------------------------------ Bộ lập lịch
const testSettings = () => {
  const s = structuredClone(settings);
  s.scheduler.rank_after_data_jobs = false;
  s.scheduler.retry = { attempts: 3, base_delay_seconds: 0.01 };
  return s;
};

test('lập lịch: chưa chạy → đến hạn; sau khi thành công → chờ đủ chu kỳ; tắt → không chạy; hoãn khi hết hạn mức', () => {
  const s = testSettings();
  const st = { jobs: { discover: {} } };
  assert.equal(dueInfo('discover', s, st, NOW).due, true);
  st.jobs.discover = { last_status: 'success', last_success_at: new Date(NOW - H).toISOString(), last_started_success_at: new Date(NOW - H).toISOString(), next_due_at: new Date(NOW + 2 * H).toISOString() };
  assert.equal(dueInfo('discover', s, st, NOW).due, false);
  assert.equal(dueInfo('discover', s, st, NOW + 2.1 * H).due, true);
  s.scheduler.jobs.discover.enabled = false;
  assert.equal(dueInfo('discover', s, st, NOW + 5 * H).due, false);
  s.scheduler.jobs.discover.enabled = true;
  st.jobs.discover.deferred_until = new Date(NOW + 9 * H).toISOString();
  assert.equal(dueInfo('discover', s, st, NOW + 5 * H).due, false);
});

test('khóa: không chạy trùng; khóa của tiến trình đã chết được thu hồi', () => {
  const a = acquireLock({ job: 'discover', run_id: 'r-a' }, 45);
  assert.equal(a.ok, true);
  const b = acquireLock({ job: 'refresh', run_id: 'r-b' }, 45);
  assert.equal(b.ok, false, 'job thứ hai bị từ chối khi khóa đang giữ');
  releaseLock(a.lock);
  assert.equal(lockStatus(45).held, false);
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ job: 'discover', run_id: 'dead', pid: 999999, host: os.hostname(), started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() }));
  assert.equal(lockStatus(45).stale, true);
  const c = acquireLock({ job: 'refresh', run_id: 'r-c' }, 45);
  assert.equal(c.ok, true);
  assert.equal(c.takeover.run_id, 'dead');
  releaseLock(c.lock);
});

test('chạy job: thành công ghi trạng thái/lịch sử và lần chạy tới', async () => {
  const s = testSettings();
  const e = await runJob('cleanup', { settings: s, trigger: 'test', log: () => {}, jobFn: async () => ({ stats: { x: 1 }, changed: true, summary: 'ok' }) });
  assert.equal(e.status, 'success');
  const st = loadState().jobs.cleanup;
  assert.equal(st.last_status, 'success');
  assert.equal(st.consecutive_failures, 0);
  assert.ok(Date.parse(st.next_due_at) > Date.now() + 700 * H);
  assert.equal(lockStatus(45).held, false, 'khóa được trả sau khi chạy');
});

test('chạy job: lỗi tạm thời được thử lại với backoff rồi thành công', async () => {
  let n = 0;
  const e = await runJob('reevaluate', { settings: testSettings(), log: () => {}, jobFn: async () => { n++; if (n < 3) throw new Error('Lỗi mạng khi gọi https://api.github.com: ECONNRESET'); return { stats: {}, changed: false, summary: 'xong' }; } });
  assert.equal(e.status, 'success');
  assert.equal(e.attempts, 3);
});

test('chạy job: hết hạn mức → hoãn tới lúc reset; token hết hạn (401) → thất bại, không thử lại, dữ liệu cũ giữ nguyên', async () => {
  const reset = Date.now() + 30 * 60000;
  const d = await runJob('discover', { settings: testSettings(), log: () => {}, jobFn: async () => { throw new RateLimitError('search', reset); } });
  assert.equal(d.status, 'deferred');
  assert.ok(Date.parse(loadState().jobs.discover.deferred_until) >= reset);
  let calls = 0;
  const f = await runJob('refresh', { settings: testSettings(), log: () => {}, jobFn: async () => { calls++; throw new Error('Search 401: {"message":"Bad credentials"}'); } });
  assert.equal(f.status, 'failed');
  assert.equal(calls, 1);
  assert.match(f.error, /GITHUB_TOKEN/);
  const st = loadState().jobs.refresh;
  assert.equal(st.consecutive_failures, 1);
  assert.ok(Date.parse(st.next_due_at) - Date.now() <= 16 * 60000, 'thất bại → thử lại sớm theo backoff, không đợi cả chu kỳ');
});

test('chạy job: đang có job khác giữ khóa → bỏ qua (không chạy trùng)', async () => {
  const held = acquireLock({ job: 'refresh', run_id: 'other' }, 45);
  let ran = false;
  const e = await runJob('rank', { settings: testSettings(), log: () => {}, jobFn: async () => { ran = true; return {}; } });
  assert.equal(e.status, 'skipped');
  assert.equal(ran, false);
  releaseLock(held.lock);
});

test('khôi phục sau khởi động lại: lượt chạy dở được đánh dấu gián đoạn và lên lịch lại', () => {
  const st = loadState();
  st.jobs.rank.running = { run_id: 'crashed-1', started_at: new Date(Date.now() - 10 * 60000).toISOString(), pid: 999999, host: os.hostname() };
  saveState(st);
  const rec = recoverInterrupted(testSettings(), () => {});
  assert.deepEqual(rec, ['rank']);
  const after = loadState().jobs.rank;
  assert.equal(after.running, null);
  assert.equal(after.last_status, 'interrupted');
  assert.ok(Date.parse(after.next_due_at) <= Date.now());
});

// ------------------------------------------------------------------ AI (client giả lập — không gọi API thật)
const README = 'FastNote is a note-taking app. It syncs notes across devices using end-to-end encryption. Install with npm install fastnote. Great for students who take lecture notes.';
const parsedOk = {
  summary_vi: 'FastNote là ứng dụng ghi chú đồng bộ giữa các thiết bị.',
  summary_en: 'FastNote is a note-taking app that syncs across devices.',
  problem: 'Ghi chú phân tán trên nhiều thiết bị.',
  audiences: ['Sinh viên'],
  benefits: [{ text: 'Đồng bộ ghi chú giữa các thiết bị', evidence: 'syncs notes across devices using end-to-end encryption' }],
  highlights: [{ text: 'Có AI viết hộ', evidence: 'uses GPT to write your notes for you' }, { text: 'Hoàn toàn an toàn tuyệt đối', evidence: 'end-to-end encryption' }],
  use_cases: [{ text: 'Ghi bài giảng', evidence: 'Great for students who take lecture notes' }],
  docs_accessibility: { level: 'basic', note: 'Có lệnh cài đặt' },
  caveats: [],
};

test('AI: loại nhận định không có trích dẫn nguyên văn và nhận định về an toàn', () => {
  const v = verifyAnalysis(parsedOk, README, 0.5);
  assert.equal(v.status, 'ok');
  assert.equal(v.result.highlights.length, 0);
  assert.equal(v.verification.claims, 4);
  assert.equal(v.verification.kept, 2);
  assert.ok(v.verification.dropped.some((d) => d.why.includes('không có trong README')));
  assert.ok(v.verification.dropped.some((d) => d.why.includes('an toàn')));
  const bad = verifyAnalysis({ ...parsedOk, benefits: [{ text: 'x', evidence: 'invented feature not in readme at all' }], use_cases: [] }, README, 0.8);
  assert.equal(bad.status, 'rejected');
});

test('AI: mặc định tắt; gọi Claude qua SDK với structured output, adaptive thinking, fallback; xử lý từ chối', async () => {
  assert.equal(aiAvailable(settings).ok, false);
  const calls = [];
  const client = { beta: { messages: { parse: async (p) => { calls.push(p); return { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 300 }, parsed_output: parsedOk }; } } } };
  const s = structuredClone(settings);
  const r = await analyzeRepo(client, { gid: '7', full_name: 'acme/fastnote', description: 'Notes app', readme: README, readme_path: 'README.md', truncated: false }, s);
  const p = calls[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.deepEqual(p.thinking, { type: 'adaptive' });
  assert.ok(p.output_config.format && p.output_config.effort === 'medium');
  assert.ok(p.betas.includes('server-side-fallback-2026-07-01'));
  assert.equal(p.fallbacks, 'default');
  assert.ok(p.messages[0].content.includes(README));
  assert.equal(r.status, 'ok');
  assert.equal(r.usage.input_tokens, 900);
  const refusing = { beta: { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } } };
  const rr = await analyzeRepo(refusing, { gid: '8', full_name: 'x/y', description: '', readme: README }, s);
  assert.equal(rr.status, 'refused');
  assert.equal(rr.result, null);
});

// ------------------------------------------------------------------ Đăng nhập quản trị
test('quản trị: mật khẩu sai/đúng, cookie ký HMAC, cookie giả/hết hạn bị từ chối, chặn dò mật khẩu', () => {
  let t = Date.now();
  const auth = createAuth({ password: 'mat-khau-dai', secret: 's', now: () => t });
  const req = (cookie) => ({ headers: { cookie }, socket: { remoteAddress: '10.0.0.9' } });
  assert.equal(auth.required, true);
  assert.equal(auth.ok(req('')), false);
  assert.equal(auth.login(req(''), 'sai').status, 401);
  const ok = auth.login(req(''), 'mat-khau-dai');
  assert.equal(ok.status, 200);
  const cookie = ok.cookie.split(';')[0];
  assert.equal(auth.ok(req(cookie)), true);
  assert.equal(auth.ok(req(`${cookie}x`)), false);
  assert.equal(auth.ok(req('okadmin=eyJleHAiOjk5OTk5OTk5OTk5OTl9.giả')), false);
  t += 13 * H;
  assert.equal(auth.ok(req(cookie)), false, 'hết hạn sau 12 giờ');
  for (let i = 0; i < 5; i++) auth.login(req(''), `sai${i}`);
  assert.equal(auth.login(req(''), 'mat-khau-dai').status, 429);
  assert.equal(createAuth({ password: '' }).required, false);
});

// ------------------------------------------------------------------ GitHub API giả lập: 404, 401, 422
test('GitHub API: repo đã xóa (404) được nhận diện; lỗi 401 được báo rõ; truy vấn tìm kiếm không hợp lệ (422) không làm sập job', async () => {
  const real = globalThis.fetch;
  const mk = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': '50', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600), ...headers } });
  try {
    globalThis.fetch = async () => mk(404, { message: 'Not Found' });
    assert.deepEqual(await resolveMissing('ghost/deleted-repo'), { status: 'not_found' });
    globalThis.fetch = async () => mk(451, { message: 'Unavailable For Legal Reasons' });
    assert.deepEqual(await resolveMissing('x/blocked'), { status: 'blocked' });
    globalThis.fetch = async () => mk(401, { message: 'Bad credentials' }, { 'x-ratelimit-resource': 'search' });
    await assert.rejects(searchRepos('stars:>1'), /401/);
    globalThis.fetch = async () => mk(422, { message: 'Validation Failed' }, { 'x-ratelimit-resource': 'search' });
    const r = await searchRepos('bad::query');
    assert.equal(r.items.length, 0);
    assert.ok(r.error);
  } finally {
    globalThis.fetch = real;
  }
});

test.after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
