// Đồng bộ các repo trong CATALOG (biên tập) — dùng chung cho `npm run sync` và job "refresh" của scheduler.
// Ghi data/github/*.json, snapshot số liệu (theo GitHub ID), báo cáo data/sync-report.json.
import fs from 'node:fs';
import { loadCatalog, renameEntry } from './catalog.mjs';
import { syncRepos } from './github.mjs';
import { fetchRateLimit, rateState, saveEtags } from './http.mjs';
import { githubToken, readJson, writeJson, repoDataFile, SYNC_REPORT_FILE, GITHUB_DIR } from './config.mjs';
import { openSnapshots } from './snapshots.mjs';

/**
 * opts: { only: string[]|null, mode, force, fixRenames, maxAgeH, log, skipUnchanged, contributorsLimit, snapshots, recentHours }
 * Trả về report (đồng thời ghi SYNC_REPORT_FILE).
 */
export async function syncCatalog(opts = {}) {
  const log = opts.log || console.log;
  const t0 = Date.now();
  const catalog = loadCatalog();
  let ids = catalog.map((e) => e.repo);
  if (opts.only?.length) {
    const want = new Set(opts.only.map((s) => s.toLowerCase()));
    ids = ids.filter((id) => want.has(id.toLowerCase()));
  }
  fs.mkdirSync(GITHUB_DIR, { recursive: true });
  const prevData = new Map(ids.map((id) => [id, readJson(repoDataFile(id))]));
  if (opts.maxAgeH > 0) {
    const fresh = ids.filter((id) => {
      const p = prevData.get(id);
      return p?.fetched_at && Date.now() - Date.parse(p.fetched_at) < opts.maxAgeH * 3600000 && p.status !== 'unverified';
    });
    ids = ids.filter((id) => !fresh.includes(id));
    log(`Bỏ qua ${fresh.length} repo đã đồng bộ trong ${opts.maxAgeH} giờ qua.`);
  }
  const mode = opts.mode || (githubToken() ? 'full' : 'lite');
  await fetchRateLimit().catch(() => null);
  log(`Đồng bộ catalog: ${ids.length} repo · chế độ ${mode === 'full' ? 'FULL (GraphQL + REST, có token)' : 'LITE (không token)'} · core ${rateState.core?.remaining ?? '?'}/${rateState.core?.limit ?? '?'} · search ${rateState.search?.remaining ?? '?'}/${rateState.search?.limit ?? '?'}`);

  let results;
  try {
    ({ results } = await syncRepos(ids.map((id) => ({ id, prev: prevData.get(id) })), {
      mode, force: Boolean(opts.force), log, skipUnchanged: opts.skipUnchanged, contributorsLimit: opts.contributorsLimit, signal: opts.signal,
    }));
  } finally {
    saveEtags();
  }

  const snaps = opts.snapshots || openSnapshots({ months: 2 });
  const report = { started_at: new Date(t0).toISOString(), finished_at: null, mode, token: Boolean(githubToken()), totals: {}, renamed: [], deleted: [], archived: [], unverified: [], errors: [], snapshots: 0 };
  const count = (k) => (report.totals[k] = (report.totals[k] || 0) + 1);
  for (const id of ids) {
    const r = results.get(id);
    if (!r) continue;
    const prev = prevData.get(id);
    // Giữ số người đóng góp mới hơn nếu tiến trình khác vừa cập nhật trong lúc đồng bộ
    const latest = readJson(repoDataFile(id));
    if (latest?.contributors?.fetched_at && Date.parse(latest.contributors.fetched_at) > Date.parse(r.contributors?.fetched_at || 0)) r.contributors = latest.contributors;
    if (r.github_id == null && prev?.github_id != null) { r.github_id = prev.github_id; r.node_id = prev.node_id; }
    writeJson(repoDataFile(id), r);
    count(r.status);
    if (r.renamed_from) report.renamed.push({ from: id, to: r.full_name });
    if (r.status === 'not_found' || r.status === 'blocked') report.deleted.push({ id, status: r.status, since: r.detected_missing_at });
    if (r.status === 'archived') report.archived.push(id);
    if (r.status === 'unverified') report.unverified.push({ id, error: r.last_error || null });
    if (r.errors?.length) report.errors.push({ id, errors: r.errors });
    // Snapshot: lần đo trước (đã lưu kèm thời điểm thật) + lần đo mới — chỉ số liệu thật, không nội suy
    if (r.github_id != null && r.meta && (r.status === 'ok' || r.status === 'archived')) {
      if (prev?.meta && prev.fetched_at && prev.status !== 'unverified' && !snaps.has(r.github_id)) snaps.record(r.github_id, { stars: prev.meta.stars, forks: prev.meta.forks, at: prev.fetched_at });
      if (snaps.record(r.github_id, { stars: r.meta.stars, forks: r.meta.forks, at: r.fetched_at })) report.snapshots++;
    }
  }
  if (!opts.snapshots) snaps.save({ recentHours: opts.recentHours ?? 60 });

  if (opts.fixRenames && report.renamed.length) {
    for (const { from, to } of report.renamed) {
      renameEntry(from, to);
      const old = readJson(repoDataFile(from));
      if (old) {
        fs.rmSync(repoDataFile(from), { force: true });
        writeJson(repoDataFile(to), { ...old, id: to, renamed_from: from });
      }
      log(`  Đã sửa catalog: ${from} → ${to}`);
    }
  }

  await fetchRateLimit().catch(() => null);
  report.finished_at = new Date().toISOString();
  report.rate_limit = rateState;
  const prevReport = readJson(SYNC_REPORT_FILE, null);
  writeJson(SYNC_REPORT_FILE, opts.only?.length ? { ...(prevReport || {}), last_partial: report } : report);
  log(`Catalog xong sau ${Math.round((Date.now() - t0) / 1000)} giây: ${Object.entries(report.totals).map(([k, n]) => `${k}=${n}`).join(' · ') || 'không có repo'}`);
  return report;
}
