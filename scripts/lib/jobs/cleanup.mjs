// Job "cleanup" (mặc định 30 ngày/lần): áp dụng chính sách lưu giữ dữ liệu.
//   - Snapshot theo ngày cũ hơn N ngày; snapshot của repo không còn theo dõi
//   - Repo radar không còn xuất hiện quá N ngày (trừ repo đã xuất bản/ghim/ẩn) + file README/AI mồ côi
//   - Cache ETag của repo không còn theo dõi; nhật ký job cũ; lịch sử điểm cũ
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, DATA_DIR, readJson, writeJson, repoDataFile, daysSince } from '../config.mjs';
import { loadCatalog } from '../catalog.mjs';
import { openSnapshots, pruneDailyMonths } from '../snapshots.mjs';
import { loadRadar, saveRadar, loadModeration, loadPublished, RADAR_README_DIR } from '../radar.mjs';
import { loadScoreHistory, SCORE_HISTORY_FILE } from '../rank.mjs';
import { LOG_DIR } from '../scheduler/state.mjs';
import { removeReadmeFiles } from './common.mjs';

export default async function cleanup(ctx) {
  const { settings, log } = ctx;
  const now = Date.now();
  const ret = settings.retention;
  const stats = {};

  // Repo đang theo dõi
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const keep = new Set([...Object.keys(published.repos), ...Object.keys(mod.pinned), ...Object.keys(mod.hidden)]);
  const pruned = [];
  for (const [gid, r] of Object.entries(radar.repos)) {
    if (keep.has(gid)) continue;
    const unseen = daysSince(r.last_seen_at, now) ?? 999;
    const goneLong = r.missing_since && (daysSince(r.missing_since, now) ?? 0) > 30;
    if (unseen > ret.radar_unseen_days || goneLong) { delete radar.repos[gid]; pruned.push(gid); }
  }
  stats.radar_pruned = pruned.length;
  saveRadar(radar);

  const tracked = new Set(Object.keys(radar.repos));
  for (const e of loadCatalog()) { const d = readJson(repoDataFile(e.repo)); if (d?.github_id != null) tracked.add(String(d.github_id)); }

  // Snapshot
  stats.daily_months_removed = pruneDailyMonths(ret.daily_snapshot_days, now);
  const snaps = openSnapshots({ months: 24, now });
  const orphans = [...snaps.ids()].filter((g) => !tracked.has(g));
  snaps.forget(orphans);
  stats.snapshot_orphans = orphans.length;
  snaps.save({ recentHours: ret.recent_snapshot_hours });

  // File README/AI mồ côi
  const orphanFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !tracked.has(f.replace(/\.json$/, ''))) : []);
  const rmOrphans = orphanFiles(RADAR_README_DIR);
  stats.readme_files_removed = removeReadmeFiles([...pruned, ...rmOrphans.map((f) => f.replace(/\.json$/, ''))]);
  const aiDir = path.join(DATA_DIR, 'ai');
  stats.ai_files_removed = 0;
  for (const f of orphanFiles(aiDir)) { fs.rmSync(path.join(aiDir, f), { force: true }); stats.ai_files_removed++; }

  // Lịch sử điểm
  const hist = loadScoreHistory();
  const minDay = Math.floor(now / 86400000) - ret.score_history_days;
  let removedPoints = 0;
  for (const [gid, arr] of Object.entries(hist.repos)) {
    if (!tracked.has(gid)) { removedPoints += arr.length; delete hist.repos[gid]; continue; }
    const before = arr.length;
    hist.repos[gid] = arr.filter((p) => p[0] >= minDay);
    removedPoints += before - hist.repos[gid].length;
  }
  writeJson(SCORE_HISTORY_FILE, hist, false);
  stats.score_points_removed = removedPoints;

  // Cache ETag: bỏ khóa của repo không còn theo dõi
  const etagFile = path.join(CACHE_DIR, 'etags.json');
  const etags = readJson(etagFile, {});
  const names = new Set(loadCatalog().map((e) => e.repo.toLowerCase()));
  for (const r of Object.values(radar.repos)) names.add(r.full_name.toLowerCase());
  let etagRemoved = 0;
  for (const k of Object.keys(etags)) {
    const m = k.match(/^(?:raw|readme|contrib-anon|contrib):([^:]+\/[^:]+)/);
    if (m && !names.has(m[1].toLowerCase())) { delete etags[k]; etagRemoved++; }
  }
  if (etagRemoved) writeJson(etagFile, etags, false);
  stats.etag_removed = etagRemoved;

  // Nhật ký job cũ
  let logsRemoved = 0;
  if (fs.existsSync(LOG_DIR)) {
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (now - fs.statSync(full).mtimeMs > ret.job_log_days * 86400000) { fs.rmSync(full, { force: true }); logsRemoved++; }
    }
  }
  stats.job_logs_removed = logsRemoved;
  log(`Dọn dẹp: radar −${stats.radar_pruned} · snapshot mồ côi −${stats.snapshot_orphans} · tháng snapshot cũ −${stats.daily_months_removed.length} · README −${stats.readme_files_removed} · ETag −${etagRemoved} · nhật ký −${logsRemoved}`);
  return { stats, changed: pruned.length > 0 || orphans.length > 0, summary: `radar −${stats.radar_pruned}, snapshot mồ côi −${stats.snapshot_orphans}, nhật ký −${logsRemoved}` };
}
