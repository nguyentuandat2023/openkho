// Job "rank": tính lại Quality/Trending Score cho mọi repo, ghi lịch sử điểm (mỗi ngày một điểm),
// cập nhật danh sách repo radar có trang chi tiết. Không gọi mạng.
import { rankAll, appendScoreHistory, updatePublished } from '../rank.mjs';
import { savePublished } from '../radar.mjs';
import { writeJson } from '../config.mjs';
import { JOBS_DIR } from '../scheduler/state.mjs';
import path from 'node:path';

export default async function rank(ctx) {
  const { settings, log } = ctx;
  const now = Date.now();
  const result = rankAll({ now, settings });
  const n = appendScoreHistory(result, now, settings.retention.score_history_days);
  const changes = updatePublished(result, now);
  savePublished(result.published);
  const recs = result.records;
  const count = (fn) => recs.filter(fn).length;
  const stats = {
    repos: recs.length,
    curated: count((r) => r.origin === 'curated'),
    radar: count((r) => r.origin === 'radar'),
    // Không tính repo bị ẩn/loại trừ/nghi spam (khớp số liệu hiển thị trên website)
    with_trending: Object.fromEntries(['d1', 'd7', 'd30'].map((k) => [k, count((r) => !r.suppressed && !r.hidden && !r.excluded && r.trending?.[k]?.score != null)])),
    growth_methods: recs.reduce((acc, r) => { for (const k of ['d1', 'd7', 'd30']) { const m = r.growth?.[k]?.method || 'none'; acc[`${k}:${m}`] = (acc[`${k}:${m}`] || 0) + 1; } return acc; }, {}),
    gems: count((r) => r.gem),
    suppressed: count((r) => r.suppressed),
    anomalies: count((r) => r.trending && Object.values(r.trending).some((w) => w?.anomaly)),
    published_total: Object.keys(result.published.repos).length,
    published_added: changes.added.length,
    published_removed: changes.removed.length,
    history_points: n,
  };
  // Báo cáo chất lượng dữ liệu (trang quản trị)
  const dq = {
    computed_at: result.computed_at,
    curated_missing_github_id: recs.filter((r) => r.origin === 'curated' && !r.gid).map((r) => r.key),
    missing_contributors: count((r) => r.raw?.meta && !(r.raw.contributors?.anon)),
    stale_over_48h: recs.filter((r) => r.raw?.fetched_at && now - Date.parse(r.raw.fetched_at) > 48 * 3600000).map((r) => r.full_name).slice(0, 200),
    low_quality_coverage: recs.filter((r) => r.quality && r.quality.coverage < 0.7).length,
    insufficient_trending: count((r) => r.trending?.d7 && r.trending.d7.score == null),
    not_found: recs.filter((r) => r.status === 'not_found' || r.status === 'blocked').map((r) => ({ id: r.full_name, origin: r.origin, status: r.status })),
    renamed: recs.filter((r) => r.raw?.renamed_from).map((r) => ({ from: r.raw.renamed_from, to: r.full_name })),
    anomalies: recs.filter((r) => r.trending && Object.values(r.trending).some((w) => w?.anomaly)).map((r) => ({ id: r.full_name, reasons: Object.values(r.trending).find((w) => w?.anomaly)?.anomaly })),
    published_changes: changes,
    suppressed_clusters: Object.values(recs.filter((r) => r.suppressed).reduce((acc, r) => { (acc[r.suppressed.cluster] ||= { cluster: r.suppressed.cluster, reason: r.suppressed.reason, repos: [] }).repos.push(r.full_name); return acc; }, {})),
  };
  writeJson(path.join(JOBS_DIR, 'data-quality.json'), dq);
  log(`Xếp hạng: ${stats.repos} repo · có Trending 24h/7d/30d: ${stats.with_trending.d1}/${stats.with_trending.d7}/${stats.with_trending.d30} · Hidden Gem ${stats.gems} · trang radar ${stats.published_total} (+${stats.published_added}/−${stats.published_removed})`);
  return { stats, changed: true, summary: `Trending 7 ngày: ${stats.with_trending.d7} repo · ${stats.gems} hidden gem · ${stats.published_total} trang radar` };
}
