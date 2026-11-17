// Hàm dùng chung cho các job tự động.
import fs from 'node:fs';
import { loadCatalog } from '../catalog.mjs';
import { readJson, writeJson, repoDataFile, pMap, daysSince } from '../config.mjs';
import { fetchReadmeExtract, readmeExtractFile, isExcluded } from '../radar.mjs';
import { fetchCommitsAtom, fetchReleaseFeeds, fetchRecentStargazers, fetchContributors } from '../github.mjs';
import { RateLimitError, rateState } from '../http.mjs';

/** Tập ID / tên đầy đủ của repo trong catalog (để radar không thêm trùng). */
export function curatedIndex() {
  const ids = new Set();
  const names = new Set();
  for (const e of loadCatalog()) {
    names.add(e.repo.toLowerCase());
    const d = readJson(repoDataFile(e.repo));
    if (d?.github_id != null) ids.add(String(d.github_id));
    if (d?.full_name) names.add(d.full_name.toLowerCase());
  }
  return { ids, names, has: (gid, full) => ids.has(String(gid)) || names.has(String(full || '').toLowerCase()) };
}

export function checkAbort(signal) {
  if (signal?.aborted) throw new Error('Job bị dừng: vượt thời gian tối đa hoặc bị hủy');
}

/** Ứng viên cần README: repo đủ sao để có trang, hoặc ứng viên Hidden Gem. Ưu tiên repo đã xuất bản/được ghim. */
export function readmeCandidates(radar, settings, published, mod, now = Date.now()) {
  const d = settings.discovery;
  const p = settings.publish;
  const out = [];
  const gems = [];
  for (const [gid, r] of Object.entries(radar.repos)) {
    const m = r.meta;
    if (!m || r.status !== 'ok' || m.archived || isExcluded(mod, gid, r.full_name)) continue;
    const age = r.readme?.fetched_at ? daysSince(r.readme.fetched_at, now) : null;
    if (age !== null && age < 7) continue;
    const isPub = Boolean(published.repos[gid]);
    const gemCand = m.stars >= d.gem_star_range[0] && m.stars <= d.gem_star_range[1] && (daysSince(m.pushed_at, now) ?? 999) <= d.gem_pushed_within_days;
    if (!isPub && m.stars < p.radar_detail_min_stars && !gemCand) continue;
    const prio = (isPub ? 1e9 : 0) + (age === null ? 1e7 : 0) + (daysSince(m.created_at, now) <= 90 ? 1e6 : 0) + m.stars;
    (!isPub && m.stars < p.radar_detail_min_stars ? gems : out).push([gid, prio]);
  }
  const a = out.sort((x, y) => y[1] - x[1]).map(([gid]) => gid);
  const b = gems.sort((x, y) => y[1] - x[1]).map(([gid]) => gid);
  // Xen kẽ 2:1 (ứng viên có trang : ứng viên viên ngọc ẩn) để cả hai nhóm đều có README
  const merged = [];
  while (a.length || b.length) { if (a.length) merged.push(a.shift()); if (a.length) merged.push(a.shift()); if (b.length) merged.push(b.shift()); }
  return merged;
}

/** Lấy README cho danh sách repo radar (raw.githubusercontent.com — không tốn hạn mức API). */
export async function fetchReadmes(radar, gids, { log, signal, concurrency = 4 } = {}) {
  let ok = 0;
  let none = 0;
  await pMap(gids, async (gid) => {
    checkAbort(signal);
    const r = radar.repos[gid];
    if (!r) return;
    try {
      const res = await fetchReadmeExtract(r.full_name, r.meta?.default_branch);
      if (!res) { r.readme = { length: 0, sections: {}, missing: true, fetched_at: new Date().toISOString() }; none++; return; }
      r.readme = res.summary;
      writeJson(readmeExtractFile(gid), res.extract, false);
      ok++;
    } catch (err) {
      r.errors = [...(r.errors || []).slice(-4), `README: ${err.message.slice(0, 120)}`];
    }
  }, concurrency);
  if (gids.length) log?.(`  README: ${ok} lấy được, ${none} repo không có README (${gids.length} ứng viên)`);
  return { ok, none };
}

/** Feed commit (Atom, github.com — không tốn hạn mức API) cho repo radar: hoạt động mã thật trên nhánh chính. */
export async function fetchCommitFeeds(radar, gids, { log, signal, concurrency = 4 } = {}) {
  let ok = 0;
  await pMap(gids, async (gid) => {
    checkAbort(signal);
    const r = radar.repos[gid];
    if (!r?.meta) return;
    try {
      const a = await fetchCommitsAtom(r.full_name, r.meta.default_branch || 'main');
      if (a) { r.activity = { ...a, fetched_at: new Date().toISOString(), pushed_at_seen: r.meta.pushed_at }; ok++; }
    } catch (err) {
      r.errors = [...(r.errors || []).slice(-4), `commits: ${err.message.slice(0, 120)}`];
    }
  }, concurrency);
  if (gids.length) log?.(`  Feed commit: ${ok}/${gids.length} repo`);
  return ok;
}

/** Bản phát hành (HEAD /releases/latest + releases.atom) cho repo radar đã xuất bản. */
export async function fetchReleases(radar, gids, { log, signal, concurrency = 3 } = {}) {
  let ok = 0;
  await pMap(gids, async (gid) => {
    checkAbort(signal);
    const r = radar.repos[gid];
    if (!r) return;
    try {
      const rel = await fetchReleaseFeeds(r.full_name);
      r.release_checked = true;
      r.release = rel.release;
      r.prerelease = rel.prerelease;
      r.release_checked_at = new Date().toISOString();
      ok++;
    } catch (err) {
      r.errors = [...(r.errors || []).slice(-4), `release: ${err.message.slice(0, 120)}`];
    }
  }, concurrency);
  if (gids.length) log?.(`  Bản phát hành: ${ok}/${gids.length} repo`);
  return ok;
}

/** Mẫu thời điểm gắn sao (REST, tốn 1–2 lượt core mỗi repo) cho repo mới phát hiện chưa có snapshot 24 giờ. */
export async function fetchStargazerSamples(radar, gids, { log, signal, reserve = 8 } = {}) {
  let ok = 0;
  for (const gid of gids) {
    checkAbort(signal);
    if ((rateState.core?.remaining ?? 60) <= reserve + 2) break;
    const r = radar.repos[gid];
    try {
      const s = await fetchRecentStargazers(r.full_name, r.meta.stars);
      if (s) { r.stargazers = s; ok++; }
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
  if (gids.length) log?.(`  Mẫu stargazer: ${ok}/${gids.length} repo · core còn ${rateState.core?.remaining ?? '?'}`);
  return ok;
}

/** Số người đóng góp (REST, 1 lượt core/repo) — chỉ trong phần hạn mức còn lại. */
export async function fetchRadarContributors(radar, gids, { log, signal, reserve = 5 } = {}) {
  let ok = 0;
  for (const gid of gids) {
    checkAbort(signal);
    if ((rateState.core?.remaining ?? 60) <= reserve) break;
    const r = radar.repos[gid];
    try {
      const c = await fetchContributors(r.full_name);
      if (c === 'not-modified') { if (r.contributors) r.contributors.fetched_at = new Date().toISOString(); ok++; }
      else if (c) { r.contributors = c; ok++; }
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
  if (gids.length) log?.(`  Người đóng góp (radar): ${ok}/${gids.length} repo`);
  return ok;
}

/** Xóa file trích đoạn README của repo không còn trong radar. */
export function removeReadmeFiles(gids) {
  let n = 0;
  for (const gid of gids) {
    const f = readmeExtractFile(gid);
    if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); n++; }
  }
  return n;
}
