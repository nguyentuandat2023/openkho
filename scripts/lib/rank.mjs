// Gộp catalog (biên tập) + radar (tự phát hiện) + snapshot → bản ghi thống nhất theo GitHub ID,
// tính Quality Score, Trending Score (3 cửa sổ), lĩnh vực công nghệ, Hidden Gem, điều kiện xuất bản.
// Hàm thuần (không gọi mạng, không ghi file) — dùng chung cho job "rank" và build-data.
import path from 'node:path';
import { DATA_DIR, readJson, writeJson, repoDataFile, daysSince } from './config.mjs';
import { loadCatalog } from './catalog.mjs';
import { classifyLicense } from './license.mjs';
import { scoreRepo } from './score.mjs';
import { openSnapshots, growthAll, WINDOWS } from './snapshots.mjs';
import { computeTrending } from './trending.mjs';
import { classify } from './classify.mjs';
import { loadSettings } from './settings.mjs';
import { loadRadar, loadModeration, loadPublished, loadReadmeExtract, modHas, isExcluded } from './radar.mjs';

export const SCORES_DIR = path.join(DATA_DIR, 'scores');
export const SCORE_HISTORY_FILE = path.join(SCORES_DIR, 'history.json');
const DAY = 86400000;
const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** Trích văn bản README của repo trong catalog (từ các mục đã lưu) để phân loại. */
function curatedReadmeText(r) {
  const s = r?.readme?.sections || {};
  return [s.features?.html, s.usage?.html, s.install?.html].map(stripTags).join(' ').slice(0, 6000);
}

/**
 * Tính toàn bộ. Trả về { computed_at, records, snaps, radar, moderation, published, settings }.
 * records[i]: { gid, key, origin, full_name, raw, entry, lic, quality, growth, trending, areas, gem, hidden, pinned, publish }
 */
export function rankAll({ now = Date.now(), settings = loadSettings(), catalog = null } = {}) {
  const cat = catalog || loadCatalog();
  const snaps = openSnapshots({ months: 14, now });
  const radar = loadRadar();
  const mod = loadModeration();
  const published = loadPublished();
  const records = [];
  const curatedIds = new Set();
  const curatedNames = new Set();

  const build = (origin, key, raw, entry, extract) => {
    const m = raw?.meta || null;
    const gid = raw?.github_id != null ? String(raw.github_id) : null;
    const full = raw?.full_name || key;
    const lic = classifyLicense(m?.license?.spdx ?? null, m?.license?.name ?? null, entry?.license_override || null);
    const contributors = raw?.contributors && raw.contributors.anon ? raw.contributors : null;
    const r = raw && raw.contributors && !raw.contributors.anon ? { ...raw, contributors: null } : raw;
    const quality = m ? scoreRepo(r, entry || {}, lic, now) : null;
    const points = gid ? snaps.series(gid, { sinceMs: now - 40 * DAY }) : [];
    const growth = m ? growthAll(points, { now, created_at: m.created_at, stars: m.stars, forks: m.forks, measured_at: raw.fetched_at, stargazers: raw.stargazers }) : null;
    const rec = {
      gid, key, origin, full_name: full,
      raw: r, entry: entry || null, lic, quality, growth,
      status: raw ? raw.status || 'ok' : 'pending',
    };
    rec.trending = m ? computeTrending({ meta: m, activity: r.activity, readme: r.readme, contributors, release_checked: r.release_checked, release: r.release, lic, growth, quality_anomaly: quality?.anomaly, status: rec.status }, settings, now) : null;
    rec.areas = m ? classify({
      topics: [...(m.topics || []), ...((entry?.tags) || [])],
      description: [m.description, entry?.summary].filter(Boolean).join(' '),
      name: m.name,
      readme_text: origin === 'curated' ? curatedReadmeText(r) : extract?.text || '',
      language: m.language,
    }) : [];
    rec.hidden = Boolean(modHas(mod.hidden, gid, full));
    rec.excluded = isExcluded(mod, gid, full);
    rec.pinned = Boolean(modHas(mod.pinned, gid, full));
    return rec;
  };

  for (const e of cat) {
    const raw = readJson(repoDataFile(e.repo));
    const rec = build('curated', e.repo, raw, e, null);
    records.push(rec);
    if (rec.gid) curatedIds.add(rec.gid);
    curatedNames.add(e.repo.toLowerCase());
    if (raw?.full_name) curatedNames.add(raw.full_name.toLowerCase());
  }
  for (const [gid, rr] of Object.entries(radar.repos)) {
    if (curatedIds.has(gid) || curatedNames.has(rr.full_name.toLowerCase())) continue; // đã có trong catalog → không trùng
    const extract = rr.readme ? loadReadmeExtract(gid) : null;
    records.push(build('radar', rr.full_name, rr, null, extract));
  }

  // Cụm repo nhân bản: ≥ 3 repo cùng tên từ các tài khoản khác nhau, tạo gần cùng lúc, giống hệt nhau
  // (cùng số sao/mô tả/dung lượng) → dấu hiệu spam hoặc sao ảo. Tự động loại khỏi xếp hạng, báo trang quản trị.
  for (const c of detectClusters(records)) for (const rec of c.members) rec.suppressed = { reason: c.reason, cluster: c.key, size: c.members.length };

  // Hidden gems: chất lượng cao (đủ dữ liệu) nhưng còn ít người biết, đang hoạt động
  const d = settings.discovery;
  for (const rec of records) {
    const m = rec.raw?.meta;
    const q = rec.quality;
    rec.gem = null;
    if (!m || !q || m.archived || rec.status !== 'ok' || rec.suppressed) continue;
    const codeAt = rec.raw.activity?.last_commit_at || m.pushed_at;
    const active = (daysSince(codeAt, now) ?? 999) <= d.gem_pushed_within_days;
    const inRange = m.stars >= d.gem_star_range[0] && m.stars <= d.gem_star_range[1];
    const licOk = !['none', 'noncommercial'].includes(rec.lic.class);
    const exPop = qualityExPopularity(q);
    if (inRange && active && licOk && exPop !== null && exPop >= GEM_MIN_QUALITY && q.coverage >= 0.7 && !q.anomaly) {
      rec.gem = { score: exPop, reason: `Chất lượng (không tính độ phổ biến) ${Math.round(exPop)}/100, độ phủ dữ liệu ${Math.round(q.coverage * 100)}%, nhưng mới có ${m.stars.toLocaleString('vi-VN')} sao` };
    }
  }

  // Điều kiện có trang chi tiết riêng (chỉ áp dụng cho repo radar)
  const p = settings.publish;
  for (const rec of records) {
    if (rec.origin !== 'radar') { rec.publish = null; continue; }
    const m = rec.raw?.meta;
    const why = [];
    if (!m) why.push('chưa có số liệu');
    else {
      if (rec.status !== 'ok') why.push(`trạng thái ${rec.status}`);
      if (m.archived) why.push('đã archived');
      if (m.stars < p.radar_detail_min_stars) why.push(`dưới ${p.radar_detail_min_stars} sao`);
      if (!rec.raw.readme) why.push('chưa lấy README');
      else if ((rec.raw.readme.length || 0) < p.readme_min_chars) why.push(`README ngắn hơn ${p.readme_min_chars} ký tự`);
    }
    if (rec.hidden) why.push('bị ẩn');
    if (rec.suppressed) why.push('thuộc cụm repo nhân bản đáng ngờ');
    if (rec.excluded) why.push('bị loại trừ');
    rec.publish = { eligible: why.length === 0, why, published: Boolean(published.repos[rec.gid]), path: published.repos[rec.gid]?.path || null };
  }

  return { computed_at: new Date(now).toISOString(), records, snaps, radar, moderation: mod, published, settings };
}

/** Tìm cụm repo nhân bản trong radar. Trả về [{ key, reason, members }]. */
export function detectClusters(records) {
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+$/g, '').replace(/[-_.]+/g, '-');
  const groups = new Map();
  for (const rec of records) {
    if (rec.origin !== 'radar' || !rec.raw?.meta) continue;
    const k = norm(rec.full_name.split('/')[1] || '');
    if (k.length < 3) continue;
    (groups.get(k) || groups.set(k, []).get(k)).push(rec);
  }
  const out = [];
  for (const [k, list] of groups) {
    if (list.length < 3) continue;
    const owners = new Set(list.map((r) => r.full_name.split('/')[0].toLowerCase()));
    if (owners.size < 3) continue;
    const created = list.map((r) => Date.parse(r.raw.meta.created_at)).filter(Number.isFinite).sort((a, b) => a - b);
    const tight = created.length >= 3 && created[created.length - 1] - created[0] <= 72 * 3600000;
    const same = (f) => new Set(list.map(f)).size <= Math.ceil(list.length / 3);
    const identical = same((r) => r.raw.meta.stars) || same((r) => (r.raw.meta.description || '').trim().toLowerCase()) || same((r) => r.raw.meta.size_kb);
    if (tight && identical) {
      out.push({ key: k, members: list, reason: `Một trong ${list.length} repo cùng tên "${k}" do ${owners.size} tài khoản khác nhau tạo gần như cùng lúc, số liệu giống hệt nhau — dấu hiệu spam/sao ảo. Tự động loại khỏi xếp hạng.` });
    }
  }
  return [...out, ...detectCampaigns(records, new Set(out.flatMap((c) => c.members)))];
}

/**
 * Chiến dịch sao ảo phối hợp (repo KHÁC tên): ≥ 5 repo radar mới (≤ 30 ngày) gần như không có fork (≤ 1) và issue,
 * do ≥ 5 tài khoản khác nhau tạo cách nhau ≤ 36 giờ, số sao chênh nhau ≤ 3%.
 * Kiểu thường gặp: repo giả mạo phần mềm bản quyền/"crack" được bơm sao để lên danh sách xu hướng.
 */
export function detectCampaigns(records, skip = new Set(), now = Date.now()) {
  const cand = records.filter((r) => {
    const m = r.raw?.meta;
    if (r.origin !== 'radar' || !m || skip.has(r)) return false;
    const age = now - Date.parse(m.created_at);
    return age >= 0 && age <= 30 * DAY && m.stars >= 200 && (m.forks ?? 0) <= 1 && !m.open_issues;
  });
  const parent = cand.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < cand.length; i++) {
    const a = cand[i].raw.meta;
    for (let j = i + 1; j < cand.length; j++) {
      const b = cand[j].raw.meta;
      if (Math.abs(Date.parse(a.created_at) - Date.parse(b.created_at)) <= 36 * 3600000 && Math.abs(a.stars - b.stars) <= 0.03 * Math.max(a.stars, b.stars)) parent[find(i)] = find(j);
    }
  }
  const comps = new Map();
  cand.forEach((r, i) => { const root = find(i); (comps.get(root) || comps.set(root, []).get(root)).push(r); });
  const out = [];
  for (const members of comps.values()) {
    const owners = new Set(members.map((r) => r.full_name.split('/')[0].toLowerCase()));
    if (members.length < 5 || owners.size < 5) continue;
    const stars = members.map((r) => r.raw.meta.stars);
    out.push({
      key: `campaign-${members[0].raw.meta.created_at.slice(0, 10)}-${Math.min(...stars)}`,
      members,
      reason: `Một trong ${members.length} repo khác tên do ${owners.size} tài khoản tạo gần như cùng lúc, cùng khoảng ${Math.min(...stars).toLocaleString('vi-VN')}–${Math.max(...stars).toLocaleString('vi-VN')} sao nhưng không có fork/issue — dấu hiệu chiến dịch sao ảo. Tự động loại khỏi xếp hạng.`,
    });
  }
  return out;
}

export const GEM_MIN_QUALITY = 75;

/** Quality Score không tính nhóm "Mức độ phổ biến" (thang 100) — dùng cho Viên ngọc ẩn. */
export function qualityExPopularity(q) {
  if (!q?.breakdown) return null;
  const parts = Object.entries(q.breakdown).filter(([k, p]) => k !== 'popularity' && !p.na && p.score !== null);
  const max = parts.reduce((s, [, p]) => s + p.max, 0);
  return max ? Math.round((parts.reduce((s, [, p]) => s + p.score, 0) / max) * 1000) / 10 : null;
}

/** Điểm ưu tiên để chọn repo radar được xuất bản trang chi tiết. */
export function publishPriority(rec) {
  const t = rec.trending?.d7?.score ?? rec.trending?.d30?.score ?? 0;
  const q = rec.quality?.total ?? 0;
  return Math.max(t, q * 0.9) + (rec.pinned ? 100 : 0) + (rec.gem ? 5 : 0);
}

/**
 * Cập nhật danh sách repo radar có trang chi tiết (ổn định: repo đã xuất bản chỉ bị gỡ khi bị ẩn/loại trừ/xóa
 * ngay lập tức, hoặc khi không còn đủ điều kiện liên tục quá 7 ngày).
 */
export function updatePublished(result, now = Date.now()) {
  const { records, published, settings } = result;
  const max = settings.publish.radar_detail_max_pages;
  const at = new Date(now).toISOString();
  const byGid = new Map(records.filter((r) => r.origin === 'radar' && r.gid).map((r) => [r.gid, r]));
  const changes = { added: [], removed: [], kept: 0 };
  for (const [gid, info] of Object.entries(published.repos)) {
    const rec = byGid.get(gid);
    const hardRemove = !rec || rec.hidden || rec.excluded || rec.suppressed || rec.status === 'not_found' || rec.status === 'blocked';
    if (hardRemove) { delete published.repos[gid]; changes.removed.push({ gid, full_name: info.full_name, why: rec ? rec.publish.why.join(', ') : 'không còn trong radar' }); continue; }
    if (!rec.publish.eligible) {
      info.failing_since ||= at;
      if (now - Date.parse(info.failing_since) > 7 * DAY) { delete published.repos[gid]; changes.removed.push({ gid, full_name: info.full_name, why: rec.publish.why.join(', ') }); continue; }
    } else delete info.failing_since;
    info.full_name = rec.full_name;
    changes.kept++;
  }
  const slots = Math.max(0, max - Object.keys(published.repos).length);
  const candidates = records
    .filter((r) => r.origin === 'radar' && r.gid && r.publish?.eligible && !published.repos[r.gid])
    .sort((a, b) => publishPriority(b) - publishPriority(a))
    .slice(0, slots);
  for (const rec of candidates) {
    published.repos[rec.gid] = { full_name: rec.full_name, since: at };
    changes.added.push({ gid: rec.gid, full_name: rec.full_name });
  }
  return changes;
}

// ------------------------------------------------------------------ Lịch sử điểm (mỗi ngày một điểm)

export function loadScoreHistory() {
  return readJson(SCORE_HISTORY_FILE, null) || { version: 1, repos: {} };
}

/** Ghi điểm hôm nay cho mọi repo có điểm: [ngày (UTC, số ngày từ 1970), t1, t7, t30, quality]. */
export function appendScoreHistory(result, now = Date.now(), retentionDays = 400) {
  const hist = loadScoreHistory();
  const day = Math.floor(now / DAY);
  let n = 0;
  for (const rec of result.records) {
    if (!rec.gid || !rec.quality) continue;
    const point = [day, rec.trending?.d1?.score ?? null, rec.trending?.d7?.score ?? null, rec.trending?.d30?.score ?? null, rec.quality.total];
    const arr = (hist.repos[rec.gid] ||= []);
    if (arr.length && arr[arr.length - 1][0] === day) arr[arr.length - 1] = point;
    else arr.push(point);
    while (arr.length && arr[0][0] < day - retentionDays) arr.shift();
    n++;
  }
  hist.updated_at = new Date(now).toISOString();
  writeJson(SCORE_HISTORY_FILE, hist, false);
  return n;
}

/** Thứ hạng hôm trước theo Trending 7 ngày (từ lịch sử) → để hiển thị mức tăng/giảm bậc. */
export function previousRanks(hist, now = Date.now(), field = 2) {
  const yesterday = Math.floor(now / DAY) - 1;
  const rows = [];
  for (const [gid, arr] of Object.entries(hist.repos || {})) {
    const p = [...arr].reverse().find((x) => x[0] <= yesterday);
    if (p && p[0] === yesterday && p[field] != null) rows.push([gid, p[field]]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  return new Map(rows.map(([gid], i) => [gid, i + 1]));
}

export { WINDOWS };
