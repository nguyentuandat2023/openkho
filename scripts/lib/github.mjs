// Lấy dữ liệu thật từ GitHub cho từng repo trong catalog.
//   Chế độ "full"  (có GITHUB_TOKEN): GraphQL theo lô + REST (người đóng góp, README) – dùng trong GitHub Actions.
//   Chế độ "lite"  (không token)    : Search API theo lô (10 lượt/phút) + Atom feed chính thức (commit, release)
//                                      + raw.githubusercontent.com (README) + REST (người đóng góp, theo hạn mức còn lại).
// Cả hai chế độ ghi cùng một định dạng chuẩn hóa (xem normalize* bên dưới).
import { request, rateState, countFromLink, RateLimitError } from './http.mjs';
import { pMap, sleep, githubToken } from './config.mjs';
import { processReadme, README_CANDIDATES, ENGLISH_README_CANDIDATES, README_PROCESSOR_VERSION } from './readme.mjs';

const API = 'https://api.github.com';
const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ GraphQL (chế độ full)
export const REPO_FRAGMENT = `
fragment Repo on Repository {
  databaseId id
  nameWithOwner name url description homepageUrl
  owner { login avatarUrl __typename }
  stargazerCount forkCount
  watchers { totalCount }
  issues(states: OPEN) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  isArchived isDisabled isFork isTemplate isLocked isMirror
  hasIssuesEnabled hasDiscussionsEnabled hasWikiEnabled
  createdAt updatedAt pushedAt diskUsage
  primaryLanguage { name color }
  languages(first: 6, orderBy: { field: SIZE, direction: DESC }) { totalSize edges { size node { name color } } }
  licenseInfo { spdxId name key }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  openGraphImageUrl usesCustomOpenGraphImage
  defaultBranchRef {
    name
    target { ... on Commit { committedDate history(since: $since) { totalCount } } }
  }
  latestRelease {
    name tagName publishedAt url isPrerelease
    releaseAssets(first: 40) { totalCount nodes { name size downloadCount downloadUrl contentType updatedAt } }
  }
  newestReleases: releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
    totalCount nodes { name tagName publishedAt url isPrerelease isDraft }
  }
  tags: refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { totalCount nodes { name } }
  recentStars: stargazers(last: 100, orderBy: { field: STARRED_AT, direction: ASC }) { edges { starredAt } }
  dockerfile: object(expression: "HEAD:Dockerfile") { __typename }
  compose: object(expression: "HEAD:docker-compose.yml") { __typename }
  composeAlt: object(expression: "HEAD:compose.yaml") { __typename }
}`;

export function buildBatchQuery(ids) {
  const vars = ['$since: GitTimestamp!'];
  const fields = [];
  const variables = {};
  ids.forEach((id, i) => {
    const [owner, name] = id.split('/');
    vars.push(`$o${i}: String!`, `$n${i}: String!`);
    variables[`o${i}`] = owner;
    variables[`n${i}`] = name;
    fields.push(`  r${i}: repository(owner: $o${i}, name: $n${i}) { ...Repo }`);
  });
  const query = `query Batch(${vars.join(', ')}) {\n${fields.join('\n')}\n  rateLimit { cost remaining resetAt }\n}\n${REPO_FRAGMENT}`;
  return { query, variables };
}

function starsRecentFromEdges(edges, total) {
  const dates = (edges || []).map((e) => Date.parse(e.starredAt)).filter(Boolean).sort((a, b) => a - b);
  if (dates.length < 10) return null;
  const now = Date.now();
  const oldest = dates[0];
  const windowDays = Math.max((now - oldest) / 86400000, 1 / 24);
  // Nếu toàn bộ sao của repo nằm trong mẫu thì cửa sổ thực tế là từ khi có sao đầu tiên
  const perDay = dates.length / windowDays;
  return { per_day: Math.round(perDay * 10) / 10, sample: dates.length, window_days: Math.round(windowDays * 10) / 10, complete: total <= dates.length, method: 'stargazers' };
}

/** Chuyển một node GraphQL Repository thành định dạng chuẩn. */
export function normalizeGraphql(node, id) {
  const langTotal = node.languages?.totalSize || 0;
  const newest = node.newestReleases?.nodes?.[0] || null;
  const stable = node.latestRelease || null;
  const commit = node.defaultBranchRef?.target || null;
  return {
    id,
    github_id: node.databaseId ?? null,
    node_id: node.id ?? null,
    full_name: node.nameWithOwner,
    status: node.isDisabled ? 'blocked' : node.isArchived ? 'archived' : 'ok',
    renamed_from: node.nameWithOwner.toLowerCase() !== id.toLowerCase() ? id : null,
    source: 'graphql',
    fetched_at: nowIso(),
    meta: {
      name: node.name,
      owner: node.owner.login,
      owner_type: node.owner.__typename,
      avatar_url: node.owner.avatarUrl,
      description: node.description,
      homepage: node.homepageUrl || null,
      html_url: node.url,
      default_branch: node.defaultBranchRef?.name || 'main',
      language: node.primaryLanguage?.name || null,
      languages: (node.languages?.edges || []).map((e) => ({ name: e.node.name, color: e.node.color, share: langTotal ? Math.round((e.size / langTotal) * 1000) / 10 : null })),
      topics: (node.repositoryTopics?.nodes || []).map((n) => n.topic.name),
      license: node.licenseInfo ? { spdx: node.licenseInfo.spdxId, name: node.licenseInfo.name } : null,
      stars: node.stargazerCount,
      forks: node.forkCount,
      watchers: node.watchers?.totalCount ?? null,
      open_issues: node.issues?.totalCount ?? 0,
      open_prs: node.pullRequests?.totalCount ?? null,
      created_at: node.createdAt,
      pushed_at: node.pushedAt,
      updated_at: node.updatedAt,
      archived: node.isArchived,
      disabled: node.isDisabled,
      is_fork: node.isFork,
      is_template: node.isTemplate,
      is_mirror: node.isMirror,
      has_issues: node.hasIssuesEnabled,
      has_discussions: node.hasDiscussionsEnabled,
      has_wiki: node.hasWikiEnabled,
      size_kb: node.diskUsage ?? null,
      og_image: node.openGraphImageUrl || null,
      custom_og_image: Boolean(node.usesCustomOpenGraphImage),
    },
    activity: {
      last_commit_at: commit?.committedDate || node.pushedAt,
      commits_90d: commit?.history?.totalCount ?? null,
      commits_90d_estimated: false,
      source: 'graphql',
    },
    release_checked: true,
    release: stable ? {
      tag: stable.tagName,
      name: stable.name,
      published_at: stable.publishedAt,
      url: stable.url,
      is_prerelease: stable.isPrerelease,
      assets_total: stable.releaseAssets?.totalCount ?? 0,
      assets: (stable.releaseAssets?.nodes || []).map((a) => ({ name: a.name, size: a.size, download_count: a.downloadCount, url: a.downloadUrl, content_type: a.contentType })),
    } : null,
    prerelease: newest && newest.isPrerelease && (!stable || Date.parse(newest.publishedAt || 0) > Date.parse(stable.publishedAt || 0))
      ? { tag: newest.tagName, name: newest.name, published_at: newest.publishedAt, url: newest.url } : null,
    releases_count: node.newestReleases?.totalCount ?? null,
    latest_tag: node.tags?.nodes?.[0] ? { name: node.tags.nodes[0].name, total: node.tags.totalCount } : null,
    stars_recent: starsRecentFromEdges(node.recentStars?.edges, node.stargazerCount),
    docker: Boolean(node.dockerfile || node.compose || node.composeAlt),
  };
}

async function graphqlBatch(ids) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { query, variables } = buildBatchQuery(ids);
  const res = await request(`${API}/graphql`, {
    method: 'POST',
    body: JSON.stringify({ query, variables: { ...variables, since } }),
    headers: { 'Content-Type': 'application/json' },
    maxWaitMs: 15 * 60_000,
  });
  const j = res.json() || {};
  if (!res.ok && !j.data) throw new Error(`GraphQL ${res.status}: ${j.message || res.text().slice(0, 200)}`);
  const notFound = new Set((j.errors || []).filter((e) => e.type === 'NOT_FOUND').map((e) => e.path?.[0]));
  const other = (j.errors || []).filter((e) => e.type !== 'NOT_FOUND');
  if (other.length && !j.data) throw new Error(`GraphQL: ${other[0].message}`);
  const out = {};
  ids.forEach((id, i) => {
    const node = j.data?.[`r${i}`];
    out[id] = node ? normalizeGraphql(node, id) : { missing: true, notFound: notFound.has(`r${i}`) };
  });
  return out;
}

// ------------------------------------------------------------------ REST & Search (chế độ lite)
export function normalizeRest(r, id, source = 'search') {
  return {
    id,
    github_id: r.id ?? null,
    node_id: r.node_id ?? null,
    full_name: r.full_name,
    status: r.disabled ? 'blocked' : r.archived ? 'archived' : 'ok',
    renamed_from: r.full_name.toLowerCase() !== id.toLowerCase() ? id : null,
    source,
    fetched_at: nowIso(),
    meta: {
      name: r.name,
      owner: r.owner?.login,
      owner_type: r.owner?.type === 'Organization' ? 'Organization' : 'User',
      avatar_url: r.owner?.avatar_url,
      description: r.description,
      homepage: r.homepage || null,
      html_url: r.html_url,
      default_branch: r.default_branch,
      language: r.language,
      languages: null,
      topics: r.topics || [],
      license: r.license ? { spdx: r.license.spdx_id, name: r.license.name } : null,
      stars: r.stargazers_count,
      forks: r.forks_count,
      watchers: r.subscribers_count ?? null, // Search API không trả về số người theo dõi thật
      open_issues: r.open_issues_count, // GitHub tính cả pull request đang mở
      open_prs: null,
      created_at: r.created_at,
      pushed_at: r.pushed_at,
      updated_at: r.updated_at,
      archived: r.archived,
      disabled: r.disabled,
      is_fork: r.fork,
      is_template: r.is_template,
      is_mirror: Boolean(r.mirror_url),
      has_issues: r.has_issues,
      has_discussions: r.has_discussions,
      has_wiki: r.has_wiki,
      size_kb: r.size,
      og_image: `https://opengraph.githubassets.com/1/${r.full_name}`,
      custom_og_image: false,
    },
  };
}

export async function searchBatch(ids) {
  const q = ids.map((id) => `repo:${id}`).join('+');
  const res = await request(`${API}/search/repositories?q=${q}&per_page=100`, { maxWaitMs: 70_000 });
  if (!res.ok) throw new Error(`Search ${res.status}: ${res.text().slice(0, 160)}`);
  const map = new Map();
  for (const it of res.json().items || []) map.set(it.full_name.toLowerCase(), it);
  return map;
}

/** Kiểm tra repo không có trong kết quả tìm kiếm: đổi tên (REST tự theo chuyển hướng) hay đã bị xóa. */
export async function resolveMissing(id) {
  const res = await request(`${API}/repos/${id}`, { maxWaitMs: 0, retries: 2 });
  if (res.status === 404) return { status: 'not_found' };
  if (res.status === 451) return { status: 'blocked' };
  if (res.ok) return { status: 'ok', data: res.json() };
  return { status: 'unverified', error: `HTTP ${res.status}` };
}

function parseAtom(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const get = (tag) => (e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1];
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1];
    entries.push({
      id: get('id'),
      updated: get('updated'),
      title: (get('title') || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
      link: link ? link.replace(/&amp;/g, '&') : null,
    });
  }
  return entries;
}

/** Commit gần nhất + ước tính số commit 90 ngày từ Atom feed của nhánh mặc định (tối đa 20 mục mới nhất). */
export async function fetchCommitsAtom(full, branch) {
  const res = await request(`https://github.com/${full}/commits/${encodeURIComponent(branch)}.atom`, { api: false, retries: 3 });
  if (!res.ok) return null;
  const items = parseAtom(res.text()).map((e) => Date.parse(e.updated)).filter(Boolean).sort((a, b) => b - a);
  if (!items.length) return { last_commit_at: null, commits_90d: 0, commits_90d_estimated: false, source: 'atom' };
  const cutoff = Date.now() - 90 * 86400000;
  const within = items.filter((t) => t >= cutoff).length;
  let est = within;
  let estimated = false;
  if (within === items.length && items.length >= 20) {
    const span = Math.max((Date.now() - items[items.length - 1]) / 86400000, 0.5);
    est = Math.round((items.length * 90) / span);
    estimated = true;
  }
  return { last_commit_at: new Date(items[0]).toISOString(), commits_90d: est, commits_90d_estimated: estimated, source: 'atom' };
}

/** Bản phát hành ổn định mới nhất (theo chuyển hướng /releases/latest) + bản thử nghiệm mới hơn (Atom). */
export async function fetchReleaseFeeds(full) {
  const head = await request(`https://github.com/${full}/releases/latest`, { api: false, method: 'HEAD', redirect: 'manual', retries: 3 });
  let tag = null;
  const loc = head.headers.get('location') || '';
  const m = loc.match(/\/releases\/tag\/([^?#]+)/);
  if (m) tag = decodeURIComponent(m[1]);
  const feed = await request(`https://github.com/${full}/releases.atom`, { api: false, retries: 3 });
  const entries = feed.ok ? parseAtom(feed.text()) : [];
  const tagOf = (e) => decodeURIComponent((e.link || '').split('/releases/tag/')[1] || (e.id || '').split('/').pop() || '');
  let release = null;
  if (tag) {
    const e = entries.find((x) => tagOf(x) === tag);
    release = { tag, name: e?.title || tag, published_at: e?.updated || null, url: `https://github.com/${full}/releases/tag/${encodeURIComponent(tag)}`, is_prerelease: false, assets: null, assets_total: null };
  }
  let prerelease = null;
  const newest = entries[0];
  if (newest && tagOf(newest) && tagOf(newest) !== tag && (!release?.published_at || Date.parse(newest.updated) > Date.parse(release.published_at))) {
    prerelease = { tag: tagOf(newest), name: newest.title, published_at: newest.updated, url: newest.link };
  }
  return { release, prerelease, feed_entries: entries.length };
}

export async function fetchRawReadme(full, branch, prev, force) {
  const tryPaths = prev?.path ? [prev.path, ...README_CANDIDATES.filter((p) => p !== prev.path)] : README_CANDIDATES;
  const reuse = prev && prev.processor === README_PROCESSOR_VERSION && !force;
  for (const p of tryPaths) {
    const url = `https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch)}/${p.split('/').map(encodeURIComponent).join('/')}`;
    const res = await request(url, { api: false, etagKey: reuse ? `raw:${full}:${p}` : undefined, force: !reuse, retries: 2 });
    if (res.notModified && reuse) return { ...prev, checked_at: nowIso() };
    if (!res.ok) continue;
    let md = res.text();
    let path = p;
    let data = processReadme(md, { full_name: full, branch, path });
    // Đang dùng bản README tiếng Anh từ lần trước → giữ ghi chú về README gốc
    if (prev?.original_path && p === prev.path) data.original_path = prev.original_path;
    if (data.cjk_ratio > 0.3) {
      for (const alt of ENGLISH_README_CANDIDATES) {
        const r2 = await request(`https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch)}/${alt}`, { api: false, retries: 1 });
        if (r2.ok && r2.text().length > 400) {
          md = r2.text();
          path = alt;
          data = { ...processReadme(md, { full_name: full, branch, path }), original_path: p };
          break;
        }
      }
    }
    return { ...data, fetched_at: nowIso(), checked_at: nowIso() };
  }
  return null;
}

async function fetchRestReadme(full, branch, prev, force) {
  const reuse = prev && prev.processor === README_PROCESSOR_VERSION && !force;
  const res = await request(`${API}/repos/${full}/readme`, { accept: 'application/vnd.github.raw+json', etagKey: reuse ? `readme:${full}` : undefined, force: !reuse });
  if (res.notModified && reuse) return { ...prev, checked_at: nowIso() };
  if (!res.ok) return res.status === 404 ? null : prev || null;
  // Lấy đường dẫn thật của README từ header content-location không có sẵn → đoán theo nội dung
  const path = prev?.path && !force ? prev.path : 'README.md';
  let data = processReadme(res.text(), { full_name: full, branch, path });
  if (data.cjk_ratio > 0.3) {
    const alt = await fetchRawReadme(full, branch, null, true);
    if (alt && alt.cjk_ratio <= 0.3) return alt;
  }
  return { ...data, fetched_at: nowIso(), checked_at: nowIso() };
}

/**
 * Số người đóng góp (REST, header Link với per_page=1).
 * Dùng anon=1 (tính cả người đóng góp ẩn danh): GitHub chỉ gắn tối đa 500 email đầu tiên với tài khoản,
 * nên anon=0 đếm thiếu nhiều ở dự án lớn (ví dụ n8n: 433 so với 864 khi có anon, GitHub hiển thị 897).
 */
export async function fetchContributors(full) {
  const res = await request(`${API}/repos/${full}/contributors?per_page=1&anon=1`, { etagKey: `contrib-anon:${full}`, maxWaitMs: 0, retries: 2 });
  if (res.notModified) return 'not-modified';
  if (res.status === 403 && /too large/i.test(res.text())) return { count: null, capped: true, anon: true, fetched_at: nowIso(), note: 'Lịch sử quá lớn, GitHub API không đếm được' };
  if (res.status === 204) return { count: 0, capped: false, anon: true, fetched_at: nowIso() };
  if (!res.ok) return null;
  const arr = res.json() || [];
  return { count: countFromLink(res.headers.get('link'), arr.length), capped: false, anon: true, fetched_at: nowIso() };
}

/**
 * Tìm kiếm repo (Search API). Trả về { total, incomplete, items } — items là đối tượng repo đầy đủ của REST.
 * Không token: 10 lượt/phút; có token: 30 lượt/phút. Tự chờ khi hết lượt trong phút (tối đa maxWaitMs).
 */
export async function searchRepos(q, { page = 1, perPage = 100, sort = 'stars', order = 'desc', maxWaitMs = 70_000 } = {}) {
  const url = `${API}/search/repositories?q=${encodeURIComponent(q).replace(/%20/g, '+')}&sort=${sort}&order=${order}&per_page=${perPage}&page=${page}`;
  const res = await request(url, { maxWaitMs });
  if (res.status === 422) return { total: 0, incomplete: false, items: [], error: res.text().slice(0, 200) };
  if (!res.ok) throw new Error(`Search ${res.status}: ${res.text().slice(0, 160)}`);
  const j = res.json() || {};
  return { total: j.total_count ?? 0, incomplete: Boolean(j.incomplete_results), items: j.items || [] };
}

/**
 * Mẫu thời điểm gắn sao gần nhất (REST, tối đa 2 trang cuối × 100). Đếm CHÍNH XÁC số sao mới trong cửa sổ khi
 * mẫu đủ dài để bao trùm cả cửa sổ; nếu không thì chỉ là cận dưới (lower_bound=true). Tốn 1–2 lượt core.
 * GitHub chỉ cho phân trang stargazers tới một giới hạn nhất định → repo quá lớn trả về null.
 */
export async function fetchRecentStargazers(full, totalStars, now = Date.now()) {
  if (!totalStars || !githubToken()) return null; // endpoint yêu cầu xác thực
  const last = Math.ceil(totalStars / 100);
  if (last > 400) return null;
  const pages = last > 1 ? [last, last - 1] : [last];
  const times = [];
  for (const p of pages) {
    const res = await request(`${API}/repos/${full}/stargazers?per_page=100&page=${p}`, { accept: 'application/vnd.github.star+json', maxWaitMs: 0, retries: 2 });
    if (!res.ok) return null;
    for (const s of res.json() || []) if (s.starred_at) times.push(Date.parse(s.starred_at));
    // Trang cuối đã đủ bao trùm 7 ngày thì không cần lấy thêm
    if (times.length && Math.min(...times) <= now - 7 * 86400000) break;
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  const oldest = times[0];
  const win = (days) => {
    const from = now - days * 86400000;
    const n = times.filter((t) => t >= from).length;
    return { stars: n, exact: oldest <= from || times.length >= totalStars };
  };
  return { sampled_at: new Date(now).toISOString(), sample: times.length, oldest_at: new Date(oldest).toISOString(), d1: win(1), d7: win(7), d30: win(30) };
}

// ------------------------------------------------------------------ Điều phối

/**
 * Đồng bộ danh sách repo.
 * entries: [{ id, prev }] – prev là dữ liệu cũ (để giữ lại khi không lấy được và tái dùng ETag)
 * opts: { mode: 'full'|'lite', force, log, contributorsReserve, contributorsMaxAgeDays }
 * Trả về Map id → dữ liệu chuẩn hóa mới
 */
export async function syncRepos(entries, opts = {}) {
  const log = opts.log || console.log;
  let mode = opts.mode || (githubToken() ? 'full' : 'lite');
  const results = new Map();
  const prevOf = new Map(entries.map((e) => [e.id, e.prev]));

  // 1) Số liệu cơ bản theo lô
  if (mode === 'full') {
    try {
      const BATCH = 20;
      for (let i = 0; i < entries.length; i += BATCH) {
        const ids = entries.slice(i, i + BATCH).map((e) => e.id);
        const batch = await graphqlBatch(ids);
        for (const [id, v] of Object.entries(batch)) results.set(id, v);
        log(`  GraphQL ${Math.min(i + BATCH, entries.length)}/${entries.length} · còn ${rateState.graphql?.remaining ?? '?'} điểm`);
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Truy vấn GraphQL bị từ chối (vd. GitHub đổi schema): không dừng cả lượt đồng bộ, chuyển sang chế độ lite
      log(`  ! GraphQL lỗi (${err.message.slice(0, 160)}) → chuyển sang chế độ lite cho lượt này`);
      results.clear();
      mode = 'lite';
    }
  }
  if (mode === 'lite') {
    const BATCH = 35;
    for (let i = 0; i < entries.length; i += BATCH) {
      const ids = entries.slice(i, i + BATCH).map((e) => e.id);
      const map = await searchBatch(ids);
      for (const id of ids) {
        const it = map.get(id.toLowerCase());
        results.set(id, it ? normalizeRest(it, id) : { missing: true });
      }
      log(`  Search ${Math.min(i + BATCH, entries.length)}/${entries.length} · còn ${rateState.search?.remaining ?? '?'} lượt/phút`);
      if (i + BATCH < entries.length && (rateState.search?.remaining ?? 1) <= 1) {
        const wait = Math.max((rateState.search?.reset || Date.now()) - Date.now() + 1000, 1000);
        await sleep(wait);
      } else if (i + BATCH < entries.length) await sleep(2200);
    }
  }

  // 2) Repo không thấy → kiểm tra đổi tên / đã xóa (REST)
  for (const [id, v] of results) {
    if (!v.missing) continue;
    try {
      const r = await resolveMissing(id);
      if (r.status === 'ok') {
        if (mode === 'full') {
          const again = await graphqlBatch([r.data.full_name]);
          const nv = again[r.data.full_name];
          results.set(id, nv && !nv.missing ? { ...nv, id, renamed_from: r.data.full_name.toLowerCase() !== id.toLowerCase() ? id : null } : normalizeRest(r.data, id, 'rest'));
        } else results.set(id, normalizeRest(r.data, id, 'rest'));
        if (r.data.full_name.toLowerCase() !== id.toLowerCase()) log(`  ↪ ${id} → ${r.data.full_name}`);
        else log(`  ✓ ${id}: Search API không trả về, đã tra trực tiếp qua REST`);
      } else if (r.status === 'not_found' || r.status === 'blocked') {
        const prev = prevOf.get(id);
        results.set(id, { ...(prev || { id, meta: null }), id, status: r.status, fetched_at: nowIso(), detected_missing_at: prev?.detected_missing_at || nowIso() });
        log(`  ✖ ${id}: ${r.status === 'not_found' ? 'không còn tồn tại (404)' : 'bị chặn (451)'}`);
      } else {
        const prev = prevOf.get(id);
        results.set(id, prev ? { ...prev, status: 'unverified', last_error: r.error } : { id, status: 'unverified', meta: null, last_error: r.error });
      }
    } catch (err) {
      const prev = prevOf.get(id);
      results.set(id, prev ? { ...prev, status: 'unverified', last_error: err.message } : { id, status: 'unverified', meta: null, last_error: err.message });
      if (err instanceof RateLimitError) log(`  ! ${err.message}`);
    }
  }

  // 3) Chi tiết từng repo: commit/release (lite), README, người đóng góp
  const live = [...results.values()].filter((v) => v.meta && (v.status === 'ok' || v.status === 'archived'));
  let done = 0;
  let skipped = 0;
  await pMap(live, async (v) => {
    const prev = prevOf.get(v.id) || null;
    const full = v.full_name;
    const branch = v.meta.default_branch || 'main';
    if (opts.signal?.aborted) throw new Error('Job bị hủy (quá thời gian tối đa)');
    const detailsAge = Date.now() - Date.parse(prev?.details_checked_at || prev?.fetched_at || 0);
    if (opts.skipUnchanged && mode === 'lite' && !opts.force && prev?.meta && prev.activity && prev.release_checked &&
        prev.meta.pushed_at === v.meta.pushed_at && detailsAge < 7 * 86400000) {
      // Không có push mới kể từ lần lấy chi tiết trước → commit/release/README không đổi; giữ nguyên
      for (const k of ['activity', 'release_checked', 'release', 'prerelease', 'latest_tag', 'stars_recent', 'docker', 'readme', 'releases_count']) if (prev[k] !== undefined) v[k] = prev[k];
      if (prev.meta.languages && !v.meta.languages) v.meta.languages = prev.meta.languages;
      if (prev.meta.watchers != null && v.meta.watchers == null) v.meta.watchers = prev.meta.watchers;
      if (prev.meta.custom_og_image) { v.meta.og_image = prev.meta.og_image; v.meta.custom_og_image = true; }
      v.details_checked_at = prev.details_checked_at || prev.fetched_at;
      v.contributors = prev.contributors || null;
      skipped++;
      done++;
      return;
    }
    try {
      if (mode === 'lite') {
        v.activity = (await fetchCommitsAtom(full, branch)) || prev?.activity || { last_commit_at: v.meta.pushed_at, commits_90d: null, source: 'pushed_at' };
        const rel = await fetchReleaseFeeds(full);
        v.release_checked = true;
        v.release = rel.release;
        // Giữ danh sách file tải về (assets) từ lần đồng bộ có token trước đó nếu cùng phiên bản
        if (v.release && prev?.release?.tag === v.release.tag && prev.release.assets) {
          v.release.assets = prev.release.assets;
          v.release.assets_total = prev.release.assets_total;
          v.release.published_at ||= prev.release.published_at;
        }
        v.prerelease = rel.prerelease;
        v.latest_tag = prev?.latest_tag || null;
        v.stars_recent = prev?.stars_recent || null;
        v.docker = prev?.docker ?? null;
        if (prev?.meta?.languages && !v.meta.languages) v.meta.languages = prev.meta.languages;
        if (prev?.meta?.watchers != null && v.meta.watchers == null) v.meta.watchers = prev.meta.watchers;
        if (prev?.meta?.custom_og_image) { v.meta.og_image = prev.meta.og_image; v.meta.custom_og_image = true; }
        v.readme = (await fetchRawReadme(full, branch, prev?.readme, opts.force)) || prev?.readme || null;
      } else {
        v.readme = (await fetchRestReadme(full, branch, prev?.readme, opts.force)) || null;
      }
    } catch (err) {
      v.errors = [...(v.errors || []), err.message];
      v.readme ||= prev?.readme || null;
      v.activity ||= prev?.activity || null;
    }
    v.contributors = prev?.contributors || null;
    v.details_checked_at = nowIso();
    done++;
    if (done % 25 === 0 || done === live.length) log(`  Chi tiết ${done}/${live.length}`);
  }, mode === 'full' ? 6 : 4);
  if (skipped) log(`  Bỏ qua chi tiết ${skipped} repo không có push mới (dùng lại dữ liệu lần trước)`);

  // 4) Người đóng góp: chế độ full lấy tất cả; chế độ lite lấy theo hạn mức còn lại (ưu tiên repo chưa có/cũ nhất)
  const maxAge = (opts.contributorsMaxAgeDays ?? 7) * 86400000;
  const need = live
    .filter((v) => !v.contributors || !v.contributors.anon || Date.now() - Date.parse(v.contributors.fetched_at || 0) > maxAge || opts.force)
    .sort((a, b) => Date.parse(a.contributors?.fetched_at || 0) - Date.parse(b.contributors?.fetched_at || 0));
  let budget = need.length;
  if (mode === 'lite') {
    const remaining = rateState.core?.remaining ?? 60;
    budget = Math.max(0, remaining - (opts.contributorsReserve ?? 3));
  }
  if (Number.isFinite(opts.contributorsLimit)) budget = Math.min(budget, opts.contributorsLimit);
  const targets = need.slice(0, budget);
  if (targets.length) log(`  Người đóng góp: ${targets.length}/${need.length} repo cần cập nhật`);
  let fetched = 0;
  await pMap(targets, async (v) => {
    try {
      const c = await fetchContributors(v.full_name);
      if (c === 'not-modified') v.contributors = { ...v.contributors, fetched_at: nowIso() };
      else if (c) v.contributors = c;
      fetched++;
    } catch (err) {
      if (!(err instanceof RateLimitError)) v.errors = [...(v.errors || []), err.message];
    }
  }, mode === 'full' ? 6 : 3);
  if (targets.length) log(`  Người đóng góp: đã cập nhật ${fetched}`);
  return { results, mode };
}
