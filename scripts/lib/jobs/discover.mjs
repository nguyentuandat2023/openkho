// Job "discover": tìm repo mới nổi qua GitHub Search API (chỉ dùng API chính thức, không cào trang Trending).
// Nhóm truy vấn: mới tạo 7/30/90 ngày · phổ biến nhất · trẻ & đang hoạt động · theo topic · ứng viên Hidden Gem.
// Mỗi kết quả tìm kiếm đã chứa số liệu đầy đủ (sao, fork, topic, giấy phép…) → 1 request cập nhật tới 100 repo.
import { searchRepos } from '../github.mjs';
import { rateState, RateLimitError } from '../http.mjs';
import { openSnapshots } from '../snapshots.mjs';
import { loadRadar, saveRadar, loadModeration, loadPublished, upsertRadar, enforceRadarLimit, isExcluded } from '../radar.mjs';
import { curatedIndex, checkAbort, readmeCandidates, fetchReadmes, removeReadmeFiles } from './common.mjs';

const DAY = 86400000;

/** Danh sách truy vấn cho một lượt chạy (nhóm cố định + nhóm xoay vòng theo con trỏ). */
export function buildQueries(settings, now, cursor = { topic: 0 }) {
  const d = settings.discovery;
  const date = (days) => new Date(now - days * DAY).toISOString().slice(0, 10);
  const base = [d.exclude_archived ? 'archived:false' : '', d.exclude_forks ? 'fork:false' : ''].filter(Boolean).join(' ');
  const fixed = [];
  for (const w of d.new_windows) for (let p = 1; p <= w.pages; p++) fixed.push({ group: `new${w.days}`, q: `created:>=${date(w.days)} stars:>=${w.min_stars} ${base}`.trim(), page: p });
  for (let p = 1; p <= d.popular_pages; p++) fixed.push({ group: 'popular', q: `stars:>=${d.popular_min_stars} ${base}`.trim(), page: p });
  const ya = d.young_active;
  for (let p = 1; p <= (ya.pages ?? 1); p++) fixed.push({ group: 'young_active', q: `created:>=${date(ya.max_age_days)} pushed:>=${date(ya.pushed_within_days)} stars:>=${ya.min_stars} ${base}`.trim(), page: p });
  const rotating = [];
  const [gmin, gmax] = d.gem_star_range;
  for (const t of d.topics) {
    rotating.push({ group: `topic:${t}`, q: `topic:${t} stars:>=${d.topic_min_stars} pushed:>=${date(d.topic_pushed_within_days)} ${base}`.trim(), page: 1 });
    rotating.push({ group: `gem:${t}`, q: `topic:${t} stars:${gmin}..${gmax} pushed:>=${date(d.gem_pushed_within_days)} created:>=${date(d.gem_max_age_days)} ${base}`.trim(), page: 1 });
  }
  const budget = Math.max(0, d.max_queries_per_run - fixed.length);
  const start = rotating.length ? (cursor.topic || 0) % rotating.length : 0;
  const picked = [];
  for (let i = 0; i < Math.min(budget, rotating.length); i++) picked.push(rotating[(start + i) % rotating.length]);
  return { queries: [...fixed.slice(0, d.max_queries_per_run), ...picked], nextCursor: { topic: rotating.length ? (start + picked.length) % rotating.length : 0 }, rotatingTotal: rotating.length };
}

export default async function discover(ctx) {
  const { settings, log, signal } = ctx;
  const now = Date.now();
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const curated = curatedIndex();
  const snaps = openSnapshots({ months: 2, now });
  const { queries, nextCursor, rotatingTotal } = buildQueries(settings, now, radar.cursor);
  log(`Khám phá: ${queries.length} truy vấn (xoay vòng ${queries.length - queries.filter((q) => !q.group.includes(':')).length}/${rotatingTotal} truy vấn theo topic)`);

  const stats = { queries: 0, query_errors: 0, items: 0, new: 0, updated: 0, renamed: 0, curated_seen: 0, excluded: 0, snapshots: 0, by_group: {} };
  for (const q of queries) {
    checkAbort(signal);
    let res;
    try {
      res = await searchRepos(q.q, { page: q.page, sort: 'stars' });
    } catch (err) {
      stats.query_errors++;
      if (/\b401\b|Bad credentials/i.test(err.message)) throw err;
      if (err instanceof RateLimitError) throw err;
      log(`  ! ${q.group} trang ${q.page}: ${err.message.slice(0, 140)}`);
      continue;
    }
    stats.queries++;
    const at = new Date().toISOString();
    const g = (stats.by_group[q.group] ||= { found: 0, new: 0, total: res.total });
    for (const it of res.items) {
      stats.items++;
      g.found++;
      if (isExcluded(mod, it.id, it.full_name)) { stats.excluded++; continue; }
      if (settings.discovery.exclude_forks && it.fork) continue;
      if (snaps.record(it.id, { stars: it.stargazers_count, forks: it.forks_count, at })) stats.snapshots++;
      if (curated.has(it.id, it.full_name)) { stats.curated_seen++; continue; }
      const r = upsertRadar(radar, it, q.group, at);
      stats[r]++;
      if (r === 'new') g.new++;
    }
    log(`  ${q.group.padEnd(22)} trang ${q.page}: ${String(res.items.length).padStart(3)} repo (tổng khớp ${res.total.toLocaleString('vi-VN')}) · search còn ${rateState.search?.remaining ?? '?'}/phút`);
  }
  radar.cursor = nextCursor;

  // Giới hạn kích thước radar (giữ repo đã xuất bản, được ghim)
  const keep = new Set([...Object.keys(published.repos), ...Object.keys(mod.pinned)]);
  const dropped = enforceRadarLimit(radar, settings.discovery.max_radar_repos, keep);
  if (dropped.length) {
    removeReadmeFiles(dropped);
    snaps.forget(dropped);
    log(`  Radar vượt giới hạn ${settings.discovery.max_radar_repos} → bỏ ${dropped.length} repo ít giá trị nhất`);
  }
  stats.dropped = dropped.length;

  // README cho ứng viên mới (không tốn hạn mức API)
  const cands = readmeCandidates(radar, settings, published, mod, now).slice(0, settings.discovery.readme_fetch_per_run);
  const rd = await fetchReadmes(radar, cands, { log, signal });
  stats.readme_fetched = rd.ok;

  radar.runs.push({ job: 'discover', at: new Date().toISOString(), new: stats.new, items: stats.items, queries: stats.queries });
  saveRadar(radar);
  snaps.save({ recentHours: settings.retention.recent_snapshot_hours });
  stats.radar_total = Object.keys(radar.repos).length;
  log(`Khám phá xong: ${stats.new} repo mới · ${stats.updated + stats.renamed} cập nhật · ${stats.curated_seen} thuộc catalog · radar có ${stats.radar_total} repo`);
  return { stats, changed: stats.items > 0, summary: `${stats.new} repo mới, ${stats.updated + stats.renamed} cập nhật, radar ${stats.radar_total}` };
}
