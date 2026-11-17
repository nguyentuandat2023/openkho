// Job "refresh": cập nhật số liệu ưu tiên.
//   1) Catalog (biên tập): số liệu cơ bản theo lô + chi tiết (commit, release, README) — bỏ qua chi tiết khi không có push mới.
//   2) Radar: số liệu theo lô (Search API, 35 repo/request), ưu tiên repo đã xuất bản/được ghim/mới.
//      Repo không còn tìm thấy → kiểm tra bằng GitHub ID (/repositories/:id): đổi tên, chuyển chủ hay đã xóa.
//   3) Ứng viên xu hướng: feed commit (hoạt động mã thật), bản phát hành, README, mẫu stargazer, người đóng góp.
// Mọi lần đo số liệu đều được ghi snapshot (thời điểm thật).
import { searchBatch } from '../github.mjs';
import { request, rateState, RateLimitError, fetchRateLimit } from '../http.mjs';
import { githubToken, daysSince } from '../config.mjs';
import { openSnapshots } from '../snapshots.mjs';
import { syncCatalog } from '../sync-catalog.mjs';
import { loadRadar, saveRadar, loadModeration, loadPublished, upsertRadar, markMissing, isExcluded, modHas } from '../radar.mjs';
import { checkAbort, readmeCandidates, fetchReadmes, fetchCommitFeeds, fetchReleases, fetchStargazerSamples, fetchRadarContributors, curatedIndex } from './common.mjs';

const H = 3600000;

export default async function refresh(ctx) {
  const { settings, log, signal } = ctx;
  const now = Date.now();
  const token = Boolean(githubToken());
  const mode = token ? 'full' : 'lite';
  const snaps = openSnapshots({ months: 2, now });
  const stats = {};

  // 1) Catalog
  checkAbort(signal);
  const rep = await syncCatalog({ mode, fixRenames: false, log, skipUnchanged: true, contributorsLimit: token ? 200 : 12, snapshots: snaps, signal });
  stats.catalog = { totals: rep.totals, renamed: rep.renamed.length, deleted: rep.deleted.length, errors: rep.errors.length, snapshots: rep.snapshots };

  // 2) Radar — số liệu theo lô
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const curated = curatedIndex();
  const freshCut = now - Math.max(1, settings.scheduler.jobs.refresh.interval_hours - 1) * H;
  const prio = (gid, r) => (published.repos[gid] ? 4e9 : 0) + (modHas(mod.pinned, gid, r.full_name) ? 3e9 : 0) + ((daysSince(r.meta?.created_at, now) ?? 999) <= 90 ? 1e9 : 0) + (r.meta?.stars || 0);
  const due = Object.entries(radar.repos)
    .filter(([gid, r]) => r.status !== 'not_found' && r.status !== 'blocked' && Date.parse(r.last_seen_at || 0) < freshCut && !isExcluded(mod, gid, r.full_name))
    .sort((a, b) => prio(b[0], b[1]) - prio(a[0], a[1]));
  const maxBatches = token ? 120 : 60;
  const BATCH = 35;
  const missing = [];
  let seen = 0;
  let batches = 0;
  for (let i = 0; i < due.length && batches < maxBatches; i += BATCH, batches++) {
    checkAbort(signal);
    const chunk = due.slice(i, i + BATCH);
    let map;
    try {
      map = await searchBatch(chunk.map(([, r]) => r.full_name));
    } catch (err) {
      if (err instanceof RateLimitError || /\b401\b/.test(err.message)) throw err;
      log(`  ! Lô radar ${batches + 1}: ${err.message.slice(0, 140)}`);
      continue;
    }
    const at = new Date().toISOString();
    for (const [gid, r] of chunk) {
      const it = map.get(r.full_name.toLowerCase());
      if (it && String(it.id) === gid) {
        upsertRadar(radar, it, null, at);
        snaps.record(gid, { stars: it.stargazers_count, forks: it.forks_count, at });
        seen++;
      } else missing.push(gid);
    }
    if ((batches + 1) % 10 === 0) log(`  Radar: ${Math.min(i + BATCH, due.length)}/${due.length} · search còn ${rateState.search?.remaining ?? '?'}/phút`);
  }
  stats.radar = { due: due.length, refreshed: seen, batches, missing: missing.length };
  log(`Radar: cập nhật ${seen}/${due.length} repo (${batches} lô)${due.length > batches * BATCH ? ` — phần còn lại để lượt sau` : ''}`);

  // 2b) Repo không thấy trong tìm kiếm → tra theo GitHub ID (đổi tên/chuyển chủ vẫn giữ ID)
  await fetchRateLimit().catch(() => null);
  const idBudget = Math.min(missing.length, token ? 200 : Math.max(0, (rateState.core?.remaining ?? 0) - 30), token ? 200 : 15);
  let resolved = 0;
  for (const gid of missing.slice(0, idBudget)) {
    checkAbort(signal);
    try {
      const res = await request(`https://api.github.com/repositories/${gid}`, { maxWaitMs: 0, retries: 2 });
      const at = new Date().toISOString();
      if (res.ok) {
        const it = res.json();
        if (curated.has(it.id, it.full_name)) { delete radar.repos[gid]; continue; }
        const kind = upsertRadar(radar, it, null, at);
        snaps.record(gid, { stars: it.stargazers_count, forks: it.forks_count, at });
        if (kind === 'renamed') log(`  ↪ ${radar.repos[gid].renamed_from} → ${it.full_name}`);
        resolved++;
      } else if (res.status === 404) { markMissing(radar, gid, 'not_found', at); resolved++; log(`  ✖ ${radar.repos[gid].full_name}: không còn truy cập được (404 — đã xóa hoặc chuyển riêng tư)`); }
      else if (res.status === 451) { markMissing(radar, gid, 'blocked', at); resolved++; }
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
  stats.radar.resolved_missing = resolved;

  // 3) Ứng viên xu hướng / đã xuất bản: feed commit, release, README, mẫu stargazer, người đóng góp
  const d = settings.discovery;
  const live = Object.entries(radar.repos).filter(([gid, r]) => r.status === 'ok' && r.meta && !r.meta.archived && !isExcluded(mod, gid, r.full_name));
  const candScore = ([gid, r]) => (published.repos[gid] ? 1e9 : 0) + ((daysSince(r.meta.created_at, now) ?? 999) <= 90 ? 1e6 : 0) + r.meta.stars;
  const ranked = live.filter(([gid, r]) => published.repos[gid] || r.meta.stars >= settings.publish.radar_detail_min_stars).sort((a, b) => candScore(b) - candScore(a));

  const needFeed = ranked.filter(([, r]) => !r.activity || r.activity.stale || r.activity.pushed_at_seen !== r.meta.pushed_at || (daysSince(r.activity.fetched_at, now) ?? 99) > 3).map(([gid]) => gid).slice(0, d.commit_feeds_per_run);
  stats.commit_feeds = await fetchCommitFeeds(radar, needFeed, { log, signal });

  const needRel = ranked.filter(([gid, r]) => published.repos[gid] && (!r.release_checked || (daysSince(r.release_checked_at, now) ?? 99) > 7 || (r.activity?.pushed_at_seen && r.release_pushed_seen !== r.meta.pushed_at))).map(([gid]) => gid).slice(0, 40);
  stats.releases = await fetchReleases(radar, needRel, { log, signal });
  for (const gid of needRel) if (radar.repos[gid]) radar.repos[gid].release_pushed_seen = radar.repos[gid].meta.pushed_at;

  const rdC = readmeCandidates(radar, settings, published, mod, now).slice(0, d.readme_fetch_per_run);
  stats.readme = (await fetchReadmes(radar, rdC, { log, signal })).ok;

  // Repo mới thấy < 30 giờ (chưa có snapshot 24 giờ trước): đếm thời điểm gắn sao để có số liệu tăng trưởng thật ngay.
  // GitHub yêu cầu xác thực cho danh sách stargazer → chỉ chạy khi có token.
  await fetchRateLimit().catch(() => null);
  const sgLimit = token ? d.stargazer_samples_per_run * 4 : 0;
  if (!token) log('  Mẫu stargazer: bỏ qua (GitHub API yêu cầu token cho danh sách người gắn sao)');
  const needSg = live
    .filter(([, r]) => now - Date.parse(r.first_seen_at) < 30 * H && r.meta.stars >= 100 && r.meta.stars <= 40000 && (!r.stargazers || now - Date.parse(r.stargazers.sampled_at) > 6 * H))
    .sort((a, b) => b[1].meta.stars - a[1].meta.stars)
    .map(([gid]) => gid)
    .slice(0, sgLimit);
  stats.stargazer_samples = await fetchStargazerSamples(radar, needSg, { log, signal, reserve: token ? 100 : 10 });

  const needContrib = ranked.filter(([gid, r]) => published.repos[gid] && (!r.contributors || (daysSince(r.contributors.fetched_at, now) ?? 99) > 14)).map(([gid]) => gid).slice(0, token ? 150 : 10);
  stats.contributors = await fetchRadarContributors(radar, needContrib, { log, signal, reserve: token ? 100 : 5 });

  radar.runs.push({ job: 'refresh', at: new Date().toISOString(), refreshed: seen });
  saveRadar(radar);
  stats.snapshot_files = snaps.save({ recentHours: settings.retention.recent_snapshot_hours });
  await fetchRateLimit().catch(() => null);
  stats.rate_limit = { core: rateState.core?.remaining ?? null, search: rateState.search?.remaining ?? null };
  return { stats, changed: true, summary: `catalog ${Object.values(rep.totals).reduce((a, b) => a + b, 0)} repo, radar ${seen} repo, ${stats.commit_feeds} feed commit, ${stats.readme} README` };
}
