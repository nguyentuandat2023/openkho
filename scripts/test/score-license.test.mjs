import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLicense } from '../lib/license.mjs';
import { scoreRepo, starAnomaly, computeTrend, detectAssetPlatforms } from '../lib/score.mjs';

const NOW = Date.parse('2026-11-16T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

function repo(over = {}) {
  const { meta: metaOver, ...rest } = over;
  return {
    status: 'ok',
    full_name: 'acme/tool',
    meta: {
      stars: 20000, forks: 2000, open_issues: 120, has_issues: true, has_discussions: true, archived: false, disabled: false,
      created_at: daysAgo(1500), pushed_at: daysAgo(2), description: 'x', topics: ['a', 'b', 'c'], homepage: 'https://acme.dev', license: { spdx: 'MIT' },
      ...(metaOver || {}),
    },
    activity: { last_commit_at: daysAgo(2), commits_90d: 80 },
    release_checked: true,
    release: { tag: 'v1', published_at: daysAgo(10) },
    contributors: { count: 150, anon: true },
    readme: { length: 16000, sections: { install: { html: 'x' }, usage: { html: 'y' }, features: null } },
    ...rest,
  };
}
const entry = (over = {}) => ({ applicability: 4, deploy: ['desktop'], ...over });

test('phân loại giấy phép từ SPDX và ghi đè biên tập', () => {
  assert.equal(classifyLicense('MIT', 'MIT License').class, 'permissive');
  assert.equal(classifyLicense('GPL-3.0', null).class, 'copyleft');
  assert.equal(classifyLicense('AGPL-3.0-or-later', null).spdx, 'AGPL-3.0');
  assert.equal(classifyLicense('LGPL-2.1', null).class, 'weak-copyleft');
  assert.equal(classifyLicense('NOASSERTION', 'Other').class, 'custom');
  assert.equal(classifyLicense(null, null).class, 'none');
  assert.equal(classifyLicense('CC-BY-NC-SA-4.0', null).commercial, 'no');
  const o = classifyLicense('NOASSERTION', 'Other', { class: 'source-available', name: 'Sustainable Use License' });
  assert.equal(o.class, 'source-available');
  assert.equal(o.display, 'Sustainable Use License');
  assert.equal(o.overridden, true);
  assert.equal(o.spdx, 'NOASSERTION', 'giữ nguyên giá trị gốc GitHub để hiển thị song song');
});

test('dự án tốt toàn diện đạt Xuất sắc; tổng điểm ≤ 100', () => {
  const s = scoreRepo(repo(), entry({ applicability: 5 }), classifyLicense('MIT'), NOW);
  assert.ok(s.total <= 100 && s.total >= 85, `total ${s.total}`);
  assert.equal(s.tier, 'excellent');
  assert.equal(s.flags.length, 0);
});

test('nhiều sao nhưng ngừng cập nhật và đã lưu trữ → Cần kiểm tra thêm', () => {
  const s = scoreRepo(repo({ meta: { archived: true, stars: 150000, pushed_at: daysAgo(800) }, activity: { last_commit_at: daysAgo(800), commits_90d: 0 } }), entry(), classifyLicense('MIT'), NOW);
  assert.equal(s.tier, 'review');
  assert.ok(s.flags.some((f) => f.key === 'archived'));
});

test('số sao chỉ chiếm tối đa 15 điểm', () => {
  const a = scoreRepo(repo({ meta: { stars: 500000 } }), entry(), classifyLicense('MIT'), NOW);
  const b = scoreRepo(repo({ meta: { stars: 1000 } }), entry(), classifyLicense('MIT'), NOW);
  const diff = a.breakdown.popularity.items[0].pts - b.breakdown.popularity.items[0].pts;
  assert.ok(diff <= 15 && a.breakdown.popularity.items[0].pts <= 15);
});

test('thiếu dữ liệu không được tính như dữ liệu thật: loại khỏi mẫu số, công bố độ phủ', () => {
  const full = scoreRepo(repo(), entry(), classifyLicense('MIT'), NOW);
  assert.equal(full.coverage, 1);
  const s = scoreRepo(repo({ contributors: null }), entry(), classifyLicense('MIT'), NOW);
  const c = s.breakdown.community;
  assert.equal(c.partial, true);
  assert.equal(c.items.find((i) => i.name === 'contributors').pts, null);
  assert.ok(s.partial.includes('community.contributors'));
  // Còn 4/10 điểm có dữ liệu (< 50%) → cả nhóm Cộng đồng bị loại khỏi tổng, không đoán 50%
  assert.equal(c.score, null);
  assert.equal(c.excluded, true);
  assert.equal(s.coverage, 0.9);
  // Tổng quy về thang 100 trên 90 điểm còn lại
  const others = ['popularity', 'quality', 'applicability', 'freshness', 'docs'].reduce((t, k) => t + s.breakdown[k].score, 0);
  assert.equal(s.total, Math.round((others / 90) * 1000) / 10);
});

test('nhóm thiếu một phần (≥ 50%) tính trên phần có dữ liệu; repo chưa biên tập: tiêu chí ứng dụng không áp dụng', () => {
  const s = scoreRepo(repo({ activity: { last_commit_at: daysAgo(2), commits_90d: null } }), entry(), classifyLicense('MIT'), NOW);
  const fr = s.breakdown.freshness;
  assert.equal(fr.excluded, false);
  assert.equal(fr.score, 15, 'commit 2 ngày trước: 11/11 điểm có dữ liệu → 15/15');
  const radar = scoreRepo(repo(), {}, classifyLicense('MIT'), NOW);
  assert.equal(radar.breakdown.applicability.na, true);
  assert.equal(radar.breakdown.applicability.score, null);
  assert.equal(radar.applicability_rated, false);
});

test('độ phủ dữ liệu dưới 70% thì không được xếp Xuất sắc', () => {
  const thin = repo({ contributors: null, readme: null, activity: null, release_checked: false });
  const s = scoreRepo(thin, entry({ applicability: 5 }), classifyLicense('MIT'), NOW);
  assert.ok(s.coverage < 0.7, `độ phủ ${s.coverage}`);
  assert.notEqual(s.tier, 'excellent');
});

test('tiêu chí không áp dụng (bản phát hành của tài liệu) không bị trừ điểm', () => {
  const s = scoreRepo(repo({ release: null }), entry({ deploy: ['content'] }), classifyLicense('CC0-1.0'), NOW);
  assert.ok(!s.breakdown.quality.items.some((i) => i.name === 'releases'));
});

test('cờ tăng sao bất thường: chỉ khi đã biết số người đóng góp', () => {
  const young = { meta: { stars: 100000, created_at: daysAgo(200), has_issues: true, open_issues: 10 } };
  assert.equal(starAnomaly({ ...repo(young), contributors: null }, false, NOW), null, 'thiếu dữ liệu → không suy đoán');
  assert.ok(starAnomaly({ ...repo(young), contributors: { count: 3, anon: true } }, false, NOW));
  assert.equal(starAnomaly({ ...repo(young), contributors: { count: 300, anon: true } }, false, NOW), null);
  assert.equal(starAnomaly({ ...repo(young), contributors: { count: 3, anon: true } }, true, NOW), null, 'bỏ qua tài liệu/skill');
  const s = scoreRepo({ ...repo(young), contributors: { count: 3, anon: true } }, entry({ applicability: 5 }), classifyLicense('MIT'), NOW);
  assert.notEqual(s.tier, 'excellent');
  assert.notEqual(s.tier, 'good');
});

test('tốc độ tăng sao: ưu tiên lịch sử ≥ 7 ngày', () => {
  const hist = [['2026-11-01', 1000, 10], ['2026-11-08', 1700, 10], ['2026-11-15', 2400, 11]];
  const t = computeTrend(repo(), hist, NOW);
  assert.equal(t.method, 'history');
  assert.equal(t.per_day, 100);
  const t2 = computeTrend({ ...repo(), stars_recent: null }, [['2026-11-15', 2400, 1]], NOW);
  assert.equal(t2, null, 'repo > 3 năm tuổi và không có lịch sử → không ước tính');
});

test('nhận diện hệ điều hành từ tên file trong bản phát hành', () => {
  const os = detectAssetPlatforms([
    { name: 'App-Setup-1.2.exe', download_count: 5 }, { name: 'App-1.2.dmg', download_count: 3 }, { name: 'app_1.2_amd64.deb', download_count: 2 },
    { name: 'App-1.2.AppImage', download_count: 9 }, { name: 'checksums.sha256', download_count: 1 }, { name: 'app-win-x64.zip.sig' },
  ]);
  assert.deepEqual(Object.keys(os).sort(), ['linux', 'macos', 'windows']);
  assert.equal(os.linux.name, 'App-1.2.AppImage', 'chọn file được tải nhiều nhất');
});
