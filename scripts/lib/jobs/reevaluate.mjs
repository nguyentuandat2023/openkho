// Job "reevaluate" (mặc định 7 ngày/lần): làm mới dữ liệu nền cho đánh giá chất lượng & phân loại.
//   - Catalog: số người đóng góp cũ hơn 7 ngày (theo hạn mức còn lại), README (ETag → gần như miễn phí nếu không đổi).
//   - Radar đã xuất bản / ứng viên: README cũ hơn 7 ngày, bản phát hành, người đóng góp.
//   - Phân loại lĩnh vực và điểm được tính lại ở bước xếp hạng ngay sau job này.
import { githubToken, daysSince, readJson, writeJson, repoDataFile } from '../config.mjs';
import { loadCatalog } from '../catalog.mjs';
import { fetchContributors, fetchRawReadme } from '../github.mjs';
import { fetchRateLimit, rateState, RateLimitError, saveEtags } from '../http.mjs';
import { loadRadar, saveRadar, loadModeration, loadPublished, isExcluded } from '../radar.mjs';
import { checkAbort, fetchReadmes, fetchReleases, fetchRadarContributors } from './common.mjs';

export default async function reevaluate(ctx) {
  const { settings, log, signal } = ctx;
  const now = Date.now();
  const token = Boolean(githubToken());
  const stats = { catalog_contributors: 0, catalog_readme: 0 };
  await fetchRateLimit().catch(() => null);

  // 1) Catalog: người đóng góp (cũ nhất trước) + README
  const cat = loadCatalog().map((e) => ({ e, d: readJson(repoDataFile(e.repo)) })).filter((x) => x.d?.meta && x.d.status === 'ok');
  const needC = cat
    .filter((x) => !x.d.contributors?.anon || (daysSince(x.d.contributors.fetched_at, now) ?? 99) > 7)
    .sort((a, b) => Date.parse(a.d.contributors?.fetched_at || 0) - Date.parse(b.d.contributors?.fetched_at || 0));
  const budget = token ? needC.length : Math.max(0, Math.min(25, (rateState.core?.remaining ?? 0) - 25));
  for (const x of needC.slice(0, budget)) {
    checkAbort(signal);
    try {
      const c = await fetchContributors(x.d.full_name);
      if (c === 'not-modified') x.d.contributors = { ...x.d.contributors, fetched_at: new Date().toISOString() };
      else if (c) x.d.contributors = c;
      else continue;
      writeJson(repoDataFile(x.e.repo), x.d);
      stats.catalog_contributors++;
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
  log(`Catalog: cập nhật người đóng góp ${stats.catalog_contributors}/${needC.length} repo cần làm mới`);

  const needR = cat.filter((x) => (daysSince(x.d.readme?.checked_at || x.d.readme?.fetched_at, now) ?? 99) > 7).slice(0, 120);
  for (const x of needR) {
    checkAbort(signal);
    try {
      const rm = await fetchRawReadme(x.d.full_name, x.d.meta.default_branch || 'main', x.d.readme, false);
      if (rm) { x.d.readme = rm; writeJson(repoDataFile(x.e.repo), x.d); stats.catalog_readme++; }
    } catch { /* giữ README cũ */ }
  }
  saveEtags();
  log(`Catalog: kiểm tra lại README ${stats.catalog_readme}/${needR.length} repo`);

  // 2) Radar
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const pubIds = Object.keys(published.repos).filter((g) => radar.repos[g] && !isExcluded(mod, g, radar.repos[g].full_name));
  const oldReadme = pubIds.filter((g) => (daysSince(radar.repos[g].readme?.fetched_at, now) ?? 99) > 7);
  stats.radar_readme = (await fetchReadmes(radar, oldReadme.slice(0, 150), { log, signal })).ok;
  const oldRel = pubIds.filter((g) => (daysSince(radar.repos[g].release_checked_at, now) ?? 99) > 7);
  stats.radar_releases = await fetchReleases(radar, oldRel.slice(0, 120), { log, signal });
  await fetchRateLimit().catch(() => null);
  const oldC = pubIds.filter((g) => (daysSince(radar.repos[g].contributors?.fetched_at, now) ?? 99) > 7)
    .sort((a, b) => Date.parse(radar.repos[a].contributors?.fetched_at || 0) - Date.parse(radar.repos[b].contributors?.fetched_at || 0));
  stats.radar_contributors = await fetchRadarContributors(radar, oldC.slice(0, token ? 600 : 15), { log, signal, reserve: token ? 100 : 5 });
  saveRadar(radar);
  return { stats, changed: true, summary: `catalog: ${stats.catalog_contributors} người đóng góp, ${stats.catalog_readme} README · radar: ${stats.radar_readme} README, ${stats.radar_contributors} người đóng góp` };
}
