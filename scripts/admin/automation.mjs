// Dữ liệu cho phần "Tự động hóa" của trang Quản trị: bảng điều khiển, radar, kiểm duyệt, kiểm tra trước xuất bản.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, GENERATED_DIR, PUBLIC_DATA_DIR, readJson, githubToken, SYNC_REPORT_FILE, daysSince } from '../lib/config.mjs';
import { loadCatalog, validate } from '../lib/catalog.mjs';
import { loadSettingsWithWarnings, JOB_NAMES, JOB_LABELS, DEFAULTS, TRENDING_COMPONENTS } from '../lib/settings.mjs';
import { loadState, loadHistory, dueInfo, lockStatus, daemonStatus, JOBS_DIR } from '../lib/scheduler/state.mjs';
import { loadRadar, loadModeration, saveModeration, loadPublished, logAdminAction, readAdminLog, modHas } from '../lib/radar.mjs';
import { listMonths, SNAPSHOT_DIR } from '../lib/snapshots.mjs';
import { rankAll } from '../lib/rank.mjs';
import { aiAvailable } from '../lib/ai.mjs';

const fileInfo = (f) => {
  try {
    const st = fs.statSync(f);
    let parsed = true;
    if (f.endsWith('.json')) { try { JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { parsed = false; } }
    return { path: path.relative(ROOT, f), bytes: st.size, modified: st.mtime.toISOString(), valid_json: parsed };
  } catch {
    return { path: path.relative(ROOT, f), missing: true };
  }
};

export function dashboard(rate) {
  const { settings, warnings } = loadSettingsWithWarnings();
  const state = loadState();
  const hist = loadHistory().runs;
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const lib = readJson(path.join(GENERATED_DIR, 'library.json'), null);
  const dq = readJson(path.join(JOBS_DIR, 'data-quality.json'), null);
  const now = Date.now();
  const radarList = Object.values(radar.repos);
  const seenWithin = (h) => radarList.filter((r) => now - Date.parse(r.first_seen_at || 0) <= h * 3600_000).length;
  const recent = readJson(path.join(SNAPSHOT_DIR, 'recent.json'), { repos: {} });
  const recentPoints = Object.values(recent.repos || {}).reduce((s, a) => s + a.length, 0);
  const jobs = JOB_NAMES.map((name) => {
    const st = state.jobs[name] || {};
    const d = dueInfo(name, settings, state, now);
    return {
      name, label: JOB_LABELS[name], enabled: settings.scheduler.jobs[name].enabled, interval_hours: settings.scheduler.jobs[name].interval_hours,
      running: st.running || null, last_status: st.last_status || null, last_started_at: st.last_started_at || null, last_finished_at: st.last_finished_at || null,
      last_success_at: st.last_success_at || null, last_error: st.last_error || null, last_summary: st.last_summary || null, last_duration_ms: st.last_duration_ms || null,
      consecutive_failures: st.consecutive_failures || 0, deferred_until: st.deferred_until || null, next_at: d.next_at || null, due: d.due, note: d.reason,
    };
  });
  const report = readJson(SYNC_REPORT_FILE, null);
  const apiErrors = [
    ...hist.filter((r) => r.error && r.status !== 'success').slice(-20).map((r) => ({ at: r.finished_at || r.started_at, source: `job ${r.job}`, status: r.status, error: r.error })),
    ...((report?.errors || []).slice(0, 20).map((e) => ({ at: report.finished_at, source: e.id, status: 'repo', error: (e.errors || []).join('; ') }))),
    ...((report?.unverified || []).slice(0, 20).map((e) => ({ at: report.finished_at, source: e.id, status: 'unverified', error: e.error || 'chưa kiểm tra lại được' }))),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return {
    now: new Date(now).toISOString(),
    token: Boolean(githubToken()),
    ai: aiAvailable(settings),
    rate,
    settings_warnings: warnings,
    scheduler: { enabled: settings.scheduler.enabled, site_rebuild: settings.scheduler.site_rebuild, max_job_minutes: settings.scheduler.max_job_minutes, lock: lockStatus(settings.scheduler.max_job_minutes, now), daemon: daemonStatus(now) },
    jobs,
    history: hist.slice(-60).reverse().map(({ log_tail, stats, ...r }) => ({ ...r, has_log: Boolean(log_tail?.length) })),
    failures: hist.filter((r) => ['failed', 'timeout', 'interrupted'].includes(r.status)).slice(-20).reverse().map(({ log_tail, stats, ...r }) => r),
    totals: {
      curated: loadCatalog().length,
      radar: radarList.length,
      published: Object.keys(published.repos).length,
      hidden: Object.keys(mod.hidden).length,
      excluded: Object.keys(mod.excluded).length + Object.keys(mod.excluded_owners).length,
      pinned: Object.keys(mod.pinned).length,
      suppressed: (dq?.suppressed_clusters || []).reduce((s, c) => s + c.repos.length, 0),
      new_24h: seenWithin(24),
      new_7d: seenWithin(24 * 7),
    },
    trending: lib?.hub?.windows || null,
    areas: (lib?.areas || []).map((a) => ({ slug: a.slug, name: a.name, count: a.count })),
    categories: (lib?.categories || []).map((c) => ({ slug: c.slug, name: c.name, count: c.count })),
    last_sync: { data: lib?.automation?.last_data_sync_at || null, ranking: lib?.automation?.ranking_computed_at || null, library_generated: lib?.generated_at || null, stale: lib?.automation?.stale ?? null },
    data_quality: dq,
    api_errors: apiErrors.slice(0, 40),
    db_health: {
      files: [
        path.join(DATA_DIR, 'settings.json'), path.join(DATA_DIR, 'moderation.json'), path.join(DATA_DIR, 'radar', 'repos.json'), path.join(DATA_DIR, 'radar', 'published.json'),
        path.join(SNAPSHOT_DIR, 'recent.json'), path.join(DATA_DIR, 'scores', 'history.json'), path.join(JOBS_DIR, 'state.json'), path.join(JOBS_DIR, 'history.json'),
        path.join(GENERATED_DIR, 'library.json'), path.join(PUBLIC_DATA_DIR, 'index.json'), path.join(PUBLIC_DATA_DIR, 'radar.json'),
      ].map(fileInfo),
      snapshot_months: listMonths(),
      recent_points: recentPoints,
      catalog: (() => { const v = validate(); return { count: v.count, errors: v.errors.length, warnings: v.warnings.length }; })(),
    },
  };
}

// ------------------------------------------------------------------ Radar (danh sách + bộ lọc) — có bộ nhớ đệm ngắn
let rankCache = { at: 0, key: '', result: null };
function rankCached() {
  const key = ['radar/repos.json', 'moderation.json', 'settings.json', 'radar/published.json'].map((f) => { try { return fs.statSync(path.join(DATA_DIR, f)).mtimeMs; } catch { return 0; } }).join('|');
  if (rankCache.result && rankCache.key === key && Date.now() - rankCache.at < 120_000) return rankCache.result;
  const result = rankAll({});
  rankCache = { at: Date.now(), key, result };
  return result;
}

export function radarList({ q = '', filter = 'all', sort = 't7', page = 1, size = 50 } = {}) {
  const { records, moderation } = rankCached();
  const now = Date.now();
  let list = records.filter((r) => r.origin === 'radar' || modHas(moderation.pinned, r.gid, r.full_name) || modHas(moderation.hidden, r.gid, r.full_name));
  if (filter === 'curated') list = records.filter((r) => r.origin === 'curated');
  const needle = q.trim().toLowerCase();
  if (needle) list = list.filter((r) => r.full_name.toLowerCase().includes(needle) || (r.raw?.meta?.description || '').toLowerCase().includes(needle));
  const F = {
    published: (r) => r.publish?.published, eligible: (r) => r.publish?.eligible && !r.publish?.published, hidden: (r) => r.hidden, excluded: (r) => r.excluded,
    pinned: (r) => r.pinned, suppressed: (r) => r.suppressed, anomaly: (r) => r.trending && Object.values(r.trending).some((w) => w?.anomaly), gem: (r) => r.gem,
    new7: (r) => now - Date.parse(r.raw?.first_seen_at || 0) <= 7 * 86400_000, missing: (r) => r.status === 'not_found' || r.status === 'blocked',
  };
  if (F[filter]) list = list.filter(F[filter]);
  const val = {
    t1: (r) => r.trending?.d1?.score ?? -1, t7: (r) => r.trending?.d7?.score ?? -1, t30: (r) => r.trending?.d30?.score ?? -1,
    q: (r) => r.quality?.total ?? -1, stars: (r) => r.raw?.meta?.stars ?? -1, new: (r) => Date.parse(r.raw?.first_seen_at || 0), created: (r) => Date.parse(r.raw?.meta?.created_at || 0),
  }[sort] || ((r) => r.trending?.d7?.score ?? -1);
  list.sort((a, b) => val(b) - val(a));
  const total = list.length;
  const items = list.slice((page - 1) * size, page * size).map((r) => ({
    gid: r.gid, full_name: r.full_name, origin: r.origin, status: r.status, description: (r.raw?.meta?.description || '').slice(0, 160),
    stars: r.raw?.meta?.stars ?? null, forks: r.raw?.meta?.forks ?? null, created_at: r.raw?.meta?.created_at || null, first_seen_at: r.raw?.first_seen_at || null,
    t1: r.trending?.d1?.score ?? null, t7: r.trending?.d7?.score ?? null, t30: r.trending?.d30?.score ?? null, q: r.quality ? Math.round(r.quality.total) : null, qc: r.quality?.coverage ?? null,
    areas: r.areas.slice(0, 3).map((a) => a.slug), gem: Boolean(r.gem), hidden: r.hidden, excluded: r.excluded, pinned: r.pinned,
    suppressed: r.suppressed?.reason || null, anomaly: r.trending ? Object.values(r.trending).find((w) => w?.anomaly)?.anomaly || null : null,
    publish: r.publish, seen_in: Object.keys(r.raw?.seen_in || {}).slice(0, 6),
  }));
  return { total, page, size, items, computed_at: rankCached().computed_at };
}

// ------------------------------------------------------------------ Kiểm duyệt
const ACTIONS = {
  hide: ['hidden', true], unhide: ['hidden', false], exclude: ['excluded', true], unexclude: ['excluded', false], pin: ['pinned', true], unpin: ['pinned', false],
};

export function moderate({ action, target, reason = '' }) {
  const mod = loadModeration();
  const t = String(target || '').trim();
  if (!t) throw new Error('Thiếu repo (GitHub ID hoặc owner/name)');
  if (action === 'exclude_owner' || action === 'unexclude_owner') {
    const owner = t.split('/')[0].toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(owner)) throw new Error('Tên chủ sở hữu không hợp lệ');
    if (action === 'exclude_owner') mod.excluded_owners[owner] = { at: new Date().toISOString(), reason: String(reason).slice(0, 300) };
    else delete mod.excluded_owners[owner];
    saveModeration(mod);
    logAdminAction(action, owner, { reason });
    rankCache.at = 0;
    return { ok: true };
  }
  const spec = ACTIONS[action];
  if (!spec) throw new Error(`Thao tác không hợp lệ: ${action}`);
  if (!/^\d+$/.test(t) && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) throw new Error('Nhập GitHub ID (số) hoặc owner/name');
  const [field, on] = spec;
  const map = mod[field];
  for (const k of Object.keys(map)) if (k.toLowerCase() === t.toLowerCase()) delete map[k];
  if (on) map[t] = { at: new Date().toISOString(), ...(field === 'pinned' ? { note: String(reason).slice(0, 300) } : { reason: String(reason).slice(0, 300) }) };
  saveModeration(mod);
  logAdminAction(action, t, { reason });
  rankCache.at = 0;
  return { ok: true };
}

export function moderationState() {
  return { ...loadModeration(), audit: readAdminLog(200) };
}

// ------------------------------------------------------------------ Kiểm tra trước khi xuất bản
const SECRET_RE = /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

export function prepublish() {
  const checks = [];
  const add = (key, label, status, detail) => checks.push({ key, label, status, detail });
  const v = validate();
  add('catalog', 'Catalog biên tập hợp lệ', v.errors.length ? 'fail' : v.warnings.length ? 'warn' : 'pass', v.errors.length ? v.errors.slice(0, 5).join('; ') : `${v.count} repo, ${v.warnings.length} cảnh báo`);
  const { warnings } = loadSettingsWithWarnings();
  add('settings', 'Cấu hình tự động hợp lệ', warnings.length ? 'warn' : 'pass', warnings.length ? warnings.join('; ') : 'Không có cảnh báo');

  const lib = readJson(path.join(GENERATED_DIR, 'library.json'), null);
  if (!lib) { add('library', 'Đã tạo dữ liệu website', 'fail', 'Chưa có src/generated/library.json — chạy build-data'); return { ok: false, checks }; }
  const now = Date.now();
  const radarPages = lib.repos.filter((r) => r.origin === 'radar');
  const badRadar = radarPages.filter((r) => !r.gid || !r.stats || r.status !== 'ok');
  add('radar_pages', 'Trang repo tự phát hiện có định danh và số liệu thật', badRadar.length ? 'fail' : 'pass', badRadar.length ? badRadar.slice(0, 5).map((r) => r.full_name).join(', ') : `${radarPages.length} trang`);
  const mod = loadModeration();
  const leaked = lib.repos.filter((r) => modHas(mod.hidden, r.gid, r.full_name) || modHas(mod.excluded, r.gid, r.full_name));
  const dq = readJson(path.join(JOBS_DIR, 'data-quality.json'), null);
  const suppressed = new Set((dq?.suppressed_clusters || []).flatMap((c) => c.repos.map((x) => x.toLowerCase())));
  const leakedSup = lib.repos.filter((r) => suppressed.has(r.full_name.toLowerCase()));
  add('moderation', 'Repo bị ẩn/loại trừ/nghi spam không xuất hiện trên website', leaked.length + leakedSup.length ? 'fail' : 'pass', leaked.length + leakedSup.length ? [...leaked, ...leakedSup].map((r) => r.full_name).join(', ') : 'Đạt');
  let noMethod = 0;
  let futurePts = 0;
  for (const r of lib.repos) {
    for (const w of Object.values(r.trending || {})) if (w && w.score != null && (!w.growth || !w.growth.method || !w.growth.from || !w.growth.to)) noMethod++;
    for (const [t] of r.chart || []) if (t > now + 300_000) futurePts++;
  }
  add('methods', 'Mọi điểm xu hướng đều có phương pháp đo và mốc thời gian', noMethod ? 'fail' : 'pass', noMethod ? `${noMethod} điểm thiếu phương pháp` : 'Đạt');
  add('snapshots', 'Không có điểm đo ở tương lai (dữ liệu giả/lệch giờ)', futurePts ? 'fail' : 'pass', futurePts ? `${futurePts} điểm` : 'Đạt');
  const stale = lib.automation?.last_data_sync_at ? (now - Date.parse(lib.automation.last_data_sync_at)) / 3600_000 : Infinity;
  add('freshness', 'Dữ liệu đủ mới', stale > (lib.automation?.stale_after_hours || 12) ? 'warn' : 'pass', Number.isFinite(stale) ? `Đồng bộ thành công gần nhất ${stale.toFixed(1)} giờ trước` : 'Chưa có lần đồng bộ thành công');
  const missingGid = lib.repos.filter((r) => r.origin === 'curated' && r.synced && !r.gid);
  add('github_id', 'Repo catalog có GitHub ID ổn định', missingGid.length ? 'warn' : 'pass', missingGid.length ? `${missingGid.length} repo chưa có ID (chạy job refresh)` : 'Đạt');
  let secretHit = null;
  for (const f of [path.join(GENERATED_DIR, 'library.json'), path.join(PUBLIC_DATA_DIR, 'index.json'), path.join(PUBLIC_DATA_DIR, 'radar.json')]) {
    try { if (SECRET_RE.test(fs.readFileSync(f, 'utf8'))) secretHit = path.relative(ROOT, f); } catch { /* bỏ qua */ }
  }
  add('secrets', 'Không lộ token/khóa bí mật trong dữ liệu xuất bản', secretHit ? 'fail' : 'pass', secretHit ? `Phát hiện chuỗi giống token trong ${secretHit}` : 'Đạt');
  const idxSize = (() => { try { return fs.statSync(path.join(PUBLIC_DATA_DIR, 'index.json')).size; } catch { return 0; } })();
  add('size', 'Chỉ mục tìm kiếm có kích thước hợp lý', idxSize > 1_500_000 ? 'warn' : 'pass', `${Math.round(idxSize / 1024)} KB`);
  const curatedStale = lib.repos.filter((r) => r.origin === 'curated' && r.fetched_at && daysSince(r.fetched_at, now) > 3).length;
  add('curated_fresh', 'Số liệu repo catalog cập nhật trong 3 ngày', curatedStale ? 'warn' : 'pass', curatedStale ? `${curatedStale} repo cũ hơn 3 ngày` : 'Đạt');
  const ok = !checks.some((c) => c.status === 'fail');
  return { ok, checks, checked_at: new Date().toISOString() };
}

export function settingsPayload() {
  const { settings, warnings } = loadSettingsWithWarnings();
  return { settings, warnings, defaults: DEFAULTS, components: TRENDING_COMPONENTS, jobs: JOB_NAMES.map((n) => ({ name: n, label: JOB_LABELS[n] })) };
}
