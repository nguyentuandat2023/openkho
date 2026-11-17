#!/usr/bin/env node
// Gộp catalog (biên tập) + radar (tự động phát hiện) + snapshot + điểm → dữ liệu cho website:
//   src/generated/library.json  (đầy đủ, dùng khi build trang tĩnh)
//   public/data/index.json      (gọn, dùng cho tìm kiếm/bộ lọc phía trình duyệt)
// Không gọi mạng. Chạy tự động trước `next build`, sau `npm run sync` và sau các job tự động.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCategories, ENUMS } from './lib/catalog.mjs';
import { detectAssetPlatforms, TIERS, CRITERIA } from './lib/score.mjs';
import { readJson, writeJson, GENERATED_DIR, PUBLIC_DATA_DIR, SYNC_REPORT_FILE, CACHE_DIR, siteConfig, daysSince } from './lib/config.mjs';
import { loadSettings, JOB_NAMES, JOB_LABELS, TRENDING_COMPONENTS, normalizedWeights } from './lib/settings.mjs';
import { rankAll, loadScoreHistory, previousRanks } from './lib/rank.mjs';
import { loadAreas } from './lib/classify.mjs';
import { loadReadmeExtract } from './lib/radar.mjs';
import { loadAnalysis } from './lib/ai.mjs';
import { loadState, loadHistory } from './lib/scheduler/state.mjs';
import { WINDOWS, earliestWindowAt } from './lib/snapshots.mjs';
import { REF } from './lib/trending.mjs';

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
// Giấy phép cho phép trích đoạn README (có ghi nguồn). Không giấy phép/phi thương mại/tùy chỉnh → chỉ đặt link.
const PREVIEW_OK = new Set(['permissive', 'weak-copyleft', 'copyleft', 'content']);
const DAY = 86400000;

function slimTrending(t) {
  if (!t) return null;
  const out = {};
  for (const w of WINDOWS) {
    const x = t[w.key];
    if (!x) { out[w.key] = null; continue; }
    const g = x.growth;
    out[w.key] = {
      score: x.score, coverage: x.coverage, insufficient: Boolean(x.insufficient),
      components: x.components, reasons: x.reasons, warnings: x.warnings, missing: x.missing,
      anomaly: x.anomaly || null,
      growth: g ? { method: g.method, delta: g.delta, gained: g.gained, span_hours: g.span_hours, from: g.from, to: g.to, base_stars: g.base_stars, forks_gained: g.forks_gained } : null,
    };
  }
  return out;
}

const growthOf = (rec) => Object.fromEntries(WINDOWS.map((w) => {
  const g = rec.growth?.[w.key];
  return [w.key, g ? { gained: g.gained, delta: g.delta, method: g.method, span_hours: g.span_hours } : null];
}));

export async function buildData({ quiet = false, now = Date.now() } = {}) {
  const settings = loadSettings();
  const categories = loadCategories();
  const report = readJson(SYNC_REPORT_FILE, null);
  const linkReport = readJson(path.join(CACHE_DIR, 'link-report.json'), null);
  const deadLinks = new Set((linkReport?.external || []).filter((x) => x.status === 404 || x.status === 410).map((x) => x.url));
  const areasDef = loadAreas();

  const result = rankAll({ now, settings });
  const { records, snaps, published } = result;
  const hist = loadScoreHistory();
  const prevRank = previousRanks(hist, now);

  const repos = [];
  const usedPaths = new Set();
  const pagePath = (owner, name) => {
    const seg = (s) => s.toLowerCase().replace(/\./g, '-');
    let p = `/repo/${seg(owner)}/${seg(name)}/`;
    for (let i = 2; usedPaths.has(p); i++) p = `/repo/${seg(owner)}/${seg(name)}-${i}/`;
    usedPaths.add(p);
    return p;
  };

  const chartOf = (gid) => {
    if (!gid) return null;
    const pts = snaps.dailySeries(gid, 365);
    return pts.length >= 2 ? pts.map(([t, s]) => [t, s]) : null;
  };

  /** Bản ghi Repo đầy đủ cho trang chi tiết (dùng chung cho catalog và radar đã xuất bản). */
  const toRepo = (rec) => {
    const e = rec.entry || {};
    const r = rec.raw;
    const synced = Boolean(r?.meta);
    const m = r?.meta || null;
    const full = r?.full_name || rec.key;
    const [owner, name] = full.split('/');
    const lic = rec.lic;
    const score = rec.quality;
    const assetsByOs = detectAssetPlatforms(r?.release?.assets || []);
    const contentOnly = (e.deploy || []).length > 0 && (e.deploy || []).every((d) => d === 'content' || d === 'cloud');
    const platforms = uniq([...(e.platforms || []), ...Object.keys(assetsByOs), !contentOnly && (r?.docker || r?.readme?.docker_mentioned) ? 'docker' : null])
      .sort((a, b) => ENUMS.platforms.indexOf(a) - ENUMS.platforms.indexOf(b));
    const branch = m?.default_branch || 'main';
    const homepage = safeUrl(m?.homepage);
    const gh = `https://github.com/${full}`;
    const status = !r ? 'pending' : r.status || 'ok';
    const visible = status !== 'not_found' && status !== 'blocked';
    const isRadar = rec.origin === 'radar';
    const commitVerified = Boolean(r?.activity?.last_commit_at && r.activity.source && r.activity.source !== 'pushed_at');
    const extract = isRadar && rec.gid ? loadReadmeExtract(rec.gid) : null;
    const ai = rec.gid ? loadAnalysis(rec.gid) : null;
    const aiOk = ai && ai.status === 'ok' ? { model: ai.model, generated_at: ai.generated_at, truncated: Boolean(ai.input?.truncated), readme_path: ai.input?.readme_path || null, ...ai.result, verification: { claims: ai.verification?.claims ?? 0, kept: ai.verification?.kept ?? 0 } } : null;
    const previewAllowed = PREVIEW_OK.has(lic.class);
    const readmeSections = isRadar
      ? (extract && previewAllowed ? { install: extract.sections?.install || null, usage: extract.sections?.usage || null, features: extract.sections?.features || null } : { install: null, usage: null, features: null })
      : r?.readme?.sections || null;
    const trendBest = WINDOWS.map((w) => rec.growth?.[w.key]).find(Boolean);
    return {
      id: full,
      gid: rec.gid,
      key: rec.key,
      origin: rec.origin,
      owner,
      name,
      full_name: full,
      path: isRadar ? published.repos[rec.gid]?.path || pagePath(owner, name) : pagePath(owner, name),
      category: e.category || '',
      categories: e.category ? uniq([e.category, ...(e.also || [])]) : [],
      status,
      synced,
      visible,
      noindex: isRadar && !(aiOk && aiOk.summary_vi) && !settings.publish.radar_index_without_summary,
      fetched_at: r?.fetched_at || null,
      source: r?.source || (isRadar ? 'search' : null),
      summary: e.summary || null,
      description: m?.description || null,
      tags: e.tags || [],
      topics: m?.topics || [],
      use_cases: e.use_cases || [],
      features: e.features || [],
      pros: e.pros || [],
      cons: e.cons || [],
      platforms,
      deploy: e.deploy || [],
      difficulty: e.difficulty || null,
      pricing: e.pricing || null,
      needs_api_key: e.needs_api_key || null,
      requirements: e.requirements || null,
      license_note: e.license_note || null,
      note: e.note || null,
      quick_start: e.quick_start ? String(e.quick_start).trimEnd() : null,
      alternatives: e.alternatives || [],
      applicability: Number.isInteger(e.applicability) ? e.applicability : null,
      featured: Boolean(e.featured),
      added_at: e.added_at || (isRadar ? r?.first_seen_at?.slice(0, 10) || null : null),
      owner_type: m?.owner_type || null,
      avatar_url: m?.avatar_url || `https://github.com/${owner}.png?size=96`,
      og_image: m?.og_image || `https://opengraph.githubassets.com/1/${full}`,
      homepage,
      branch,
      language: m?.language || null,
      languages: m?.languages || null,
      stats: synced ? {
        stars: m.stars,
        forks: m.forks,
        watchers: m.watchers ?? null,
        open_issues: m.open_issues,
        open_prs: m.open_prs ?? null,
        contributors: rec.raw.contributors?.anon ? rec.raw.contributors.count ?? null : null,
        contributors_capped: Boolean(rec.raw.contributors?.anon && rec.raw.contributors?.capped),
        contributors_fetched_at: rec.raw.contributors?.anon ? rec.raw.contributors.fetched_at || null : null,
        size_kb: m.size_kb ?? null,
        created_at: m.created_at,
        pushed_at: m.pushed_at,
        metadata_updated_at: m.updated_at || null,
        last_commit_at: commitVerified ? r.activity.last_commit_at : m.pushed_at,
        last_commit_verified: commitVerified,
        commits_90d: r.activity?.commits_90d ?? null,
        commits_90d_estimated: Boolean(r.activity?.commits_90d_estimated),
        archived: Boolean(m.archived),
        is_fork: Boolean(m.is_fork),
        has_discussions: Boolean(m.has_discussions),
        has_issues: Boolean(m.has_issues),
      } : null,
      license: lic,
      release: r?.release || null,
      prerelease: r?.prerelease || null,
      latest_tag: r?.latest_tag || null,
      releases_count: r?.releases_count ?? null,
      release_checked: Boolean(r?.release_checked),
      downloads_by_os: Object.fromEntries(Object.entries(assetsByOs).map(([os, a]) => [os, { name: a.name, size: a.size, download_count: a.download_count, url: a.url }])),
      links: {
        github: gh,
        zip: synced && visible ? `${gh}/archive/refs/heads/${encodeURIComponent(branch)}.zip` : null,
        zip_release: r?.release?.tag && visible ? `${gh}/archive/refs/tags/${encodeURIComponent(r.release.tag)}.zip` : null,
        release: r?.release ? safeUrl(r.release.url) || `${gh}/releases/latest` : null,
        releases: `${gh}/releases`,
        docs: e.docs === 'none' ? null : safeUrl(e.docs) || (homepage && !homepage.startsWith(gh) && !deadLinks.has(homepage) ? homepage : null),
        demo: safeUrl(e.demo),
        video: safeUrl(e.video),
        readme: `${gh}#readme`,
        issues: m?.has_issues ? `${gh}/issues` : null,
        license_file: m?.license ? `${gh}/blob/${encodeURIComponent(branch)}/LICENSE` : null,
        clone: `${gh}.git`,
      },
      score,
      trend: trendBest ? { gained: trendBest.gained, method: trendBest.method, window: WINDOWS.find((w) => rec.growth[w.key] === trendBest).key } : null,
      trending: slimTrending(rec.trending),
      rank_prev: rec.gid ? prevRank.get(rec.gid) ?? null : null,
      areas: rec.areas,
      gem: rec.gem?.reason || null,
      pinned: rec.pinned,
      chart: chartOf(rec.gid),
      ai: aiOk,
      readme_preview: isRadar && extract?.intro && previewAllowed ? { ...extract.intro, path: extract.path, fetched_at: extract.fetched_at } : null,
      readme_preview_blocked: isRadar && Boolean(extract?.intro) && !previewAllowed,
      readme: r?.readme && readmeSections ? {
        path: r.readme.path,
        original_path: r.readme.original_path || null,
        length: r.readme.length,
        sections: readmeSections,
        videos: r.readme.videos || [],
        fetched_at: r.readme.fetched_at,
      } : null,
      first_seen_at: isRadar ? r?.first_seen_at || null : null,
      renamed_from: r?.renamed_from || null,
    };
  };

  // Repo catalog (bỏ repo bị ẩn) + repo radar đã xuất bản
  for (const rec of records) if (rec.origin === 'curated' && !rec.hidden) repos.push(toRepo(rec));
  const pubRecs = records.filter((rec) => rec.origin === 'radar' && rec.gid && published.repos[rec.gid] && !rec.hidden && !rec.excluded && !rec.suppressed && rec.raw?.meta)
    .sort((a, b) => (published.repos[a.gid].since || '').localeCompare(published.repos[b.gid].since || '') || a.gid.localeCompare(b.gid));
  for (const rec of pubRecs) repos.push(toRepo(rec));
  const byGid = new Map(repos.filter((x) => x.gid).map((x) => [x.gid, x]));

  // ---------- Thẻ (card) cho trang Xu hướng: gồm cả repo radar chưa có trang riêng (link thẳng tới GitHub)
  const visibleRecs = records.filter((rec) => rec.raw?.meta && !rec.hidden && !rec.excluded && !rec.suppressed && rec.status !== 'not_found' && rec.status !== 'blocked');
  const card = (rec) => {
    const m = rec.raw.meta;
    const page = rec.gid ? byGid.get(rec.gid) : repos.find((x) => x.key === rec.key);
    const commitVerified = Boolean(rec.raw.activity?.last_commit_at && rec.raw.activity.source && rec.raw.activity.source !== 'pushed_at');
    return {
      i: rec.full_name, gid: rec.gid, p: page?.path || null, u: `https://github.com/${rec.full_name}`,
      o: rec.full_name.split('/')[0], n: rec.full_name.split('/')[1],
      d: (rec.entry?.summary) || page?.ai?.summary_vi || m.description || '',
      av: m.avatar_url || `https://github.com/${rec.full_name.split('/')[0]}.png?size=80`,
      st: m.stars, fk: m.forks, l: m.language || null, lc: rec.lic.class, ls: rec.lic.display,
      cr: m.created_at, lu: commitVerified ? rec.raw.activity.last_commit_at : m.pushed_at, la: commitVerified ? 'commit' : 'push',
      c90: rec.raw.activity?.commits_90d ?? null, c90e: Boolean(rec.raw.activity?.commits_90d_estimated),
      t1: rec.trending?.d1?.score ?? null, t7: rec.trending?.d7?.score ?? null, t30: rec.trending?.d30?.score ?? null,
      q: rec.quality ? Math.round(rec.quality.total) : null, qc: rec.quality?.coverage ?? null, tr: rec.quality?.tier || null,
      g: growthOf(rec),
      ae: rec.areas.slice(0, 3).map((a) => a.slug),
      gem: rec.gem?.reason || null, gq: rec.gem?.score ?? null, pin: rec.pinned,
      an: Boolean(rec.trending && Object.values(rec.trending).some((w) => w?.anomaly)) || Boolean(rec.quality?.anomaly),
      og: rec.origin, ar: Boolean(m.archived),
      rp: rec.gid ? prevRank.get(rec.gid) ?? null : null,
      why: rec.trending?.d7?.reasons?.[0] || rec.trending?.d1?.reasons?.[0] || rec.trending?.d30?.reasons?.[0] || null,
    };
  };
  const cards = new Map(visibleRecs.map((rec) => [rec.gid || rec.key, card(rec)]));
  const C = (rec) => cards.get(rec.gid || rec.key);
  const LIMIT = 12;
  const live = visibleRecs.filter((rec) => !rec.raw.meta.archived);
  const sortBy = (list, fn) => [...list].sort((a, b) => fn(b) - fn(a));

  // Repo có tín hiệu bất thường (sao không đi kèm fork/người đóng góp…) không vào các danh sách nổi bật của trang Xu hướng
  // — vẫn tìm thấy trong Tìm kiếm (xếp cuối khi sắp theo tăng trưởng) với nhãn "Cần lưu ý số sao". An toàn đặt trước.
  const flagged = (rec) => Boolean(rec.trending && Object.values(rec.trending).some((w) => w?.anomaly)) || Boolean(rec.quality?.anomaly);
  const featured = live.filter((rec) => !flagged(rec));
  const hub = { computed_at: result.computed_at, trending: {}, fastest: {}, new_rising: {}, windows: {}, flagged: live.length - featured.length };
  for (const w of WINDOWS) {
    const scored = live.filter((rec) => rec.trending?.[w.key]?.score != null);
    hub.trending[w.key] = sortBy(scored.filter((rec) => !flagged(rec)), (rec) => rec.trending[w.key].score).slice(0, LIMIT).map(C);
    const grown = live.filter((rec) => rec.growth?.[w.key] && rec.growth[w.key].gained > 0);
    hub.fastest[w.key] = sortBy(grown.filter((rec) => !flagged(rec)), (rec) => rec.growth[w.key].gained).slice(0, LIMIT).map(C);
    const methods = {};
    for (const rec of live) { const mth = rec.growth?.[w.key]?.method || 'none'; methods[mth] = (methods[mth] || 0) + 1; }
    hub.windows[w.key] = { label: w.label, scored: scored.length, with_growth: grown.length, flagged: scored.filter(flagged).length, methods };
  }
  for (const days of [7, 30, 90]) {
    const fresh = featured.filter((rec) => (daysSince(rec.raw.meta.created_at, now) ?? 9999) <= days && rec.raw.meta.stars >= 10);
    hub.new_rising[`d${days}`] = sortBy(fresh, (rec) => rec.raw.meta.stars).slice(0, LIMIT).map(C);
  }
  hub.top_rated = sortBy(live.filter((rec) => rec.quality && rec.quality.coverage >= 0.7 && rec.status === 'ok'), (rec) => rec.quality.total).slice(0, LIMIT).map(C);
  hub.gems = sortBy(featured.filter((rec) => rec.gem),(rec) => rec.gem.score + Math.min(5, (rec.growth?.d7?.gained || 0) / 100)).slice(0, LIMIT).map(C);
  const recentCode = (rec) => {
    const a = rec.raw.activity;
    const verified = a?.last_commit_at && a.source !== 'pushed_at';
    return Date.parse(verified ? a.last_commit_at : rec.raw.meta.pushed_at || 0);
  };
  hub.active = sortBy(live.filter((rec) => now - recentCode(rec) <= 7 * DAY && typeof rec.raw.activity?.commits_90d === 'number'), (rec) => rec.raw.activity.commits_90d).slice(0, LIMIT).map(C);
  hub.popular = sortBy(featured, (rec) => rec.raw.meta.stars).slice(0, LIMIT).map(C);
  hub.pinned = visibleRecs.filter((rec) => rec.pinned).map(C);
  hub.areas = areasDef.map((a) => {
    const inArea = live.filter((rec) => rec.areas.some((x) => x.slug === a.slug));
    const top = sortBy(inArea, (rec) => (rec.trending?.d7?.score ?? rec.trending?.d30?.score ?? 0) * 2 + (rec.quality?.total ?? 0));
    return { slug: a.slug, name: a.name, en: a.en, icon: a.icon, hue: a.hue, description: a.description, count: inArea.length, top: top.slice(0, 3).map(C) };
  });
  // Lĩnh vực: danh sách đầy đủ cho trang riêng
  const areaLists = Object.fromEntries(areasDef.map((a) => {
    const inArea = live.filter((rec) => rec.areas.some((x) => x.slug === a.slug));
    const conf = (rec) => rec.areas.find((x) => x.slug === a.slug)?.confidence ?? 0;
    return [a.slug, {
      trending: sortBy(inArea.filter((rec) => rec.trending?.d7?.score != null), (rec) => rec.trending.d7.score).slice(0, 24).map(C),
      top_rated: sortBy(inArea.filter((rec) => rec.quality && rec.quality.coverage >= 0.7), (rec) => rec.quality.total).slice(0, 24).map(C),
      newest: sortBy(inArea.filter((rec) => (daysSince(rec.raw.meta.created_at, now) ?? 9999) <= 90), (rec) => rec.raw.meta.stars).slice(0, 24).map(C),
      popular: sortBy(inArea, (rec) => rec.raw.meta.stars * (0.5 + conf(rec))).slice(0, 24).map(C),
      count: inArea.length,
    }];
  }));

  // Snapshot: thời điểm đo đầu tiên → dự kiến lúc có đủ dữ liệu cho từng cửa sổ
  let firstSnap = null;
  for (const d of snaps.daily.values()) for (const arr of Object.values(d.repos)) if (arr.length && (!firstSnap || arr[0][0] < firstSnap)) firstSnap = arr[0][0];
  for (const arr of Object.values(snaps.recent.repos)) if (arr.length && (!firstSnap || arr[0][0] < firstSnap)) firstSnap = arr[0][0];
  hub.snapshots = {
    first_at: firstSnap ? new Date(firstSnap * 1000).toISOString() : null,
    ready_at: Object.fromEntries(WINDOWS.map((w) => [w.key, firstSnap ? earliestWindowAt(firstSnap * 1000, w) : null])),
  };

  // ---------- Trạng thái tự động hóa (hiển thị thời điểm đồng bộ, cảnh báo dữ liệu cũ)
  const state = loadState();
  const histRuns = loadHistory().runs;
  const lastDataSuccess = ['discover', 'refresh'].map((j) => state.jobs[j]?.last_success_at).filter(Boolean).sort().pop() || null;
  // Chỉ tính lần đồng bộ catalog thực sự lấy số liệu (lượt bỏ qua toàn bộ vì --max-age không phải lần cập nhật dữ liệu)
  const reportAt = report && Object.values(report.totals || {}).reduce((a, b) => a + b, 0) > 0 ? report.finished_at : null;
  const syncAt = [lastDataSuccess, reportAt].filter(Boolean).sort().pop() || null;
  const refreshH = settings.scheduler.jobs.refresh.interval_hours;
  const automation = {
    scheduler_enabled: settings.scheduler.enabled,
    timezone: settings.timezone,
    last_data_sync_at: syncAt,
    stale: !syncAt || now - Date.parse(syncAt) > Math.max(2 * refreshH, 12) * 3600000,
    stale_after_hours: Math.max(2 * refreshH, 12),
    ranking_computed_at: result.computed_at,
    jobs: Object.fromEntries(JOB_NAMES.map((j) => [j, {
      label: JOB_LABELS[j], enabled: settings.scheduler.enabled && settings.scheduler.jobs[j].enabled, interval_hours: settings.scheduler.jobs[j].interval_hours,
      last_success_at: state.jobs[j]?.last_success_at || null, last_status: state.jobs[j]?.last_status || null,
    }])),
    last_failures: histRuns.filter((r) => ['failed', 'timeout', 'interrupted'].includes(r.status)).slice(-3).map((r) => ({ job: r.job, at: r.finished_at, status: r.status })),
    weights: normalizedWeights(settings),
    components: TRENDING_COMPONENTS,
    ref: REF,
    min_coverage: settings.trending.min_coverage,
    anomaly_damping: settings.trending.anomaly_damping,
    discovery: { radar_total: Object.keys(result.radar.repos).length, published: pubRecs.length, max_radar: settings.discovery.max_radar_repos, topics: settings.discovery.topics, new_windows: settings.discovery.new_windows, gem_star_range: settings.discovery.gem_star_range, publish_min_stars: settings.publish.radar_detail_min_stars },
  };

  // ---------- Danh mục biên tập + thống kê
  const cats = categories.map((c) => {
    const list = repos.filter((x) => x.visible && x.categories.includes(c.slug));
    return {
      slug: c.slug, name: c.name, short: c.short || c.name, description: c.description, icon: c.icon || 'sparkles', hue: c.hue ?? 210,
      count: list.length,
      primary_count: list.filter((x) => x.category === c.slug).length,
      stars: list.reduce((s, x) => s + (x.stats?.stars || 0), 0),
    };
  });
  const curatedRepos = repos.filter((x) => x.origin === 'curated');
  const fetched = curatedRepos.map((x) => x.fetched_at).filter(Boolean).sort();
  const visibleRepos = curatedRepos.filter((x) => x.visible && x.synced);
  const byTier = Object.fromEntries(TIERS.map((t) => [t.key, visibleRepos.filter((x) => x.score?.tier === t.key).length]));
  const langCount = {};
  for (const rec of live) if (rec.raw.meta.language) langCount[rec.raw.meta.language] = (langCount[rec.raw.meta.language] || 0) + 1;
  const languages = Object.entries(langCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const areaCounts = Object.fromEntries(hub.areas.map((a) => [a.slug, a.count]));

  const meta = {
    generated_at: new Date(now).toISOString(),
    synced_at: syncAt || fetched[fetched.length - 1] || null,
    oldest_fetched_at: fetched[0] || null,
    last_sync: report ? { mode: report.mode, finished_at: report.finished_at, token: report.token, totals: report.totals } : null,
    stats: {
      repos: curatedRepos.length,
      visible: curatedRepos.filter((x) => x.visible).length,
      synced: visibleRepos.length,
      pending: curatedRepos.filter((x) => x.status === 'pending').length,
      deleted: curatedRepos.filter((x) => !x.visible).length,
      archived: curatedRepos.filter((x) => x.stats?.archived).length,
      categories: cats.length,
      by_tier: byTier,
      with_contributors: visibleRepos.filter((x) => x.stats?.contributors != null || x.stats?.contributors_capped).length,
      radar_tracked: records.filter((r) => r.origin === 'radar').length,
      radar_published: pubRecs.length,
      tracked_total: live.length,
    },
    languages,
    tiers: TIERS,
    criteria: CRITERIA,
    areas: areasDef.map((a) => ({ slug: a.slug, name: a.name, en: a.en, icon: a.icon, hue: a.hue, description: a.description, count: areaCounts[a.slug] || 0 })),
  };

  writeJson(path.join(GENERATED_DIR, 'library.json'), { ...meta, site: siteConfig(), automation, hub, area_lists: areaLists, categories: cats, repos }, false);

  // ---------- Chỉ mục gọn cho trình duyệt: repo catalog + toàn bộ repo radar đang theo dõi
  const repoByKey = new Map(repos.map((x) => [x.gid || x.key, x]));
  const compact = visibleRecs.map((rec) => {
    const x = repoByKey.get(rec.gid || rec.key);
    const cd = C(rec);
    return {
      i: rec.full_name, p: x?.path || null, o: cd.o, n: cd.n,
      s: x?.summary || x?.ai?.summary_vi || '', d: rec.raw.meta.description || '',
      c: x?.categories || [], t: uniq([...(x?.tags || []), ...(rec.raw.meta.topics || [])]).slice(0, 14), u: x?.use_cases || [],
      l: cd.l, st: cd.st, fk: cd.fk, ct: x?.stats?.contributors ?? (rec.raw.contributors?.anon ? rec.raw.contributors.count ?? null : null),
      sc: cd.q, tr: cd.tr,
      lc: rec.lic.class, ls: rec.lic.display,
      pr: x?.pricing || null, df: x?.difficulty || null, pf: x?.platforms || [], dp: x?.deploy || [], ak: x?.needs_api_key || null,
      lu: cd.lu, rl: rec.raw.release?.published_at || null, rt: rec.raw.release?.tag || null,
      ar: cd.ar, ss: rec.status, v: true,
      ft: Boolean(x?.featured), ap: x?.applicability ?? null, av: cd.av, cr: cd.cr, ad: x?.added_at || null,
      an: cd.an, fl: (rec.quality?.flags || []).map((f) => f.key),
      b: x && rec.quality ? CRITERIA.map((c) => rec.quality.breakdown[c.key]?.score ?? null) : null,
      og: rec.origin === 'radar' ? 'r' : 'c', t1: cd.t1, t7: cd.t7, t30: cd.t30,
      g1: cd.g.d1?.gained ?? null, g7: cd.g.d7?.gained ?? null, g30: cd.g.d30?.gained ?? null,
      gm: WINDOWS.map((w) => ({ snapshots: 's', created_in_window: 'c', stargazer_sample: 'g' })[rec.growth?.[w.key]?.method] || '-').join(''),
      qc: cd.qc, ae: rec.areas.map((a) => a.slug), gem: Boolean(cd.gem), pin: cd.pin, la: cd.la,
    };
  });
  // Repo catalog không còn tồn tại vẫn có trong chỉ mục (ẩn mặc định, bật bằng bộ lọc)
  for (const x of curatedRepos.filter((r) => !r.visible)) {
    compact.push({
      i: x.id, p: x.path, o: x.owner, n: x.name, s: x.summary || '', d: x.description || '', c: x.categories, t: x.tags.slice(0, 14), u: x.use_cases,
      l: x.language, st: x.stats?.stars ?? null, fk: x.stats?.forks ?? null, ct: null, sc: x.score ? Math.round(x.score.total) : null, tr: x.score?.tier || null,
      lc: x.license.class, ls: x.license.display, pr: x.pricing, df: x.difficulty, pf: x.platforms, dp: x.deploy, ak: x.needs_api_key,
      lu: x.stats?.last_commit_at || null, rl: null, rt: null, ar: Boolean(x.stats?.archived), ss: x.status, v: false,
      ft: x.featured, ap: x.applicability, av: x.avatar_url, cr: x.stats?.created_at || null, ad: x.added_at, an: false, fl: (x.score?.flags || []).map((f) => f.key), b: null,
      og: 'c', t1: null, t7: null, t30: null, g1: null, g7: null, g30: null, gm: '---', qc: x.score?.coverage ?? null, ae: [], gem: false, pin: false, la: 'push',
    });
  }
  const main = compact.filter((x) => x.og === 'c' || x.p);
  const extra = compact.filter((x) => x.og === 'r' && !x.p).map(({ c, u, pr, df, pf, dp, ak, ft, ap, ad, b, ...rest }) => ({ ...rest, c: [], u: [], pr: null, df: null, pf: [], dp: [], ak: null, ft: false, ap: null, ad: null, b: null }));
  writeJson(path.join(PUBLIC_DATA_DIR, 'index.json'), {
    generated_at: meta.generated_at, synced_at: meta.synced_at, ranking_computed_at: result.computed_at,
    categories: cats.map(({ slug, name, short, hue, icon, count }) => ({ slug, name, short, hue, icon, count })),
    areas: meta.areas.map(({ slug, name, hue, icon, count }) => ({ slug, name, hue, icon, count })),
    languages: languages.slice(0, 40),
    radar_extra: extra.length,
    repos: main,
  }, false);
  writeJson(path.join(PUBLIC_DATA_DIR, 'radar.json'), { generated_at: meta.generated_at, ranking_computed_at: result.computed_at, repos: extra }, false);

  if (!quiet) {
    console.log(`library.json: ${curatedRepos.length} repo catalog (${meta.stats.synced} có số liệu, ${meta.stats.pending} chờ đồng bộ, ${meta.stats.deleted} không còn tồn tại) + ${pubRecs.length} trang repo tự phát hiện · ${cats.length} danh mục`);
    console.log(`Chỉ mục tìm kiếm: ${compact.length - extra.length} repo (index.json) + ${extra.length} repo radar chưa có trang (radar.json) · Trending 24h/7d/30d có điểm: ${hub.windows.d1.scored}/${hub.windows.d7.scored}/${hub.windows.d30.scored} · loại ${records.filter((r) => r.suppressed).length} repo thuộc cụm nhân bản`);
    console.log(`Hạng (catalog): ${TIERS.map((t) => `${t.label} ${byTier[t.key]}`).join(' · ')}`);
  }
  return { repos: repos.length, categories: cats.length, meta };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildData();
}
