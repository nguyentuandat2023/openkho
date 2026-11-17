// Radar: các repo do hệ thống TỰ ĐỘNG phát hiện (khác catalog do biên tập viên chọn).
//   data/radar/repos.json        : { version, updated_at, cursor, repos: { [github_id]: RadarRepo } }
//   data/radar/readme/<id>.json  : trích đoạn README đã làm sạch (chỉ cho repo đủ điều kiện xuất bản)
//   data/radar/published.json    : repo radar đã có trang chi tiết (đường dẫn cố định, chống "nhấp nháy")
//   data/moderation.json         : ẩn / loại trừ / ghim (quản trị)
//   data/admin-actions.ndjson    : nhật ký thao tác quản trị
// Khóa chính là GitHub Repository ID → không trùng lặp khi repo đổi tên/chuyển chủ.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson } from './config.mjs';
import { normalizeRest } from './github.mjs';
import { request } from './http.mjs';
import { processReadme, sanitize, README_PROCESSOR_VERSION } from './readme.mjs';
import { marked } from 'marked';

export const RADAR_DIR = path.join(DATA_DIR, 'radar');
export const RADAR_FILE = path.join(RADAR_DIR, 'repos.json');
export const RADAR_README_DIR = path.join(RADAR_DIR, 'readme');
export const PUBLISHED_FILE = path.join(RADAR_DIR, 'published.json');
export const MODERATION_FILE = path.join(DATA_DIR, 'moderation.json');
export const ADMIN_LOG_FILE = path.join(DATA_DIR, 'admin-actions.ndjson');

const nowIso = () => new Date().toISOString();

export function loadRadar() {
  const r = readJson(RADAR_FILE, null) || {};
  return { version: 1, updated_at: r.updated_at || null, cursor: r.cursor || { topic: 0 }, runs: r.runs || [], repos: r.repos || {} };
}

export function saveRadar(radar) {
  radar.updated_at = nowIso();
  radar.runs = (radar.runs || []).slice(-30);
  writeJson(RADAR_FILE, radar, false);
}

export function loadPublished() {
  return readJson(PUBLISHED_FILE, null) || { version: 1, repos: {} };
}
export function savePublished(p) {
  p.updated_at = nowIso();
  writeJson(PUBLISHED_FILE, p);
}

export function readmeExtractFile(gid) { return path.join(RADAR_README_DIR, `${gid}.json`); }
export function loadReadmeExtract(gid) { return readJson(readmeExtractFile(gid), null); }

// ------------------------------------------------------------------ Kiểm duyệt (ẩn / loại trừ / ghim)

export function loadModeration() {
  const m = readJson(MODERATION_FILE, null) || {};
  return {
    version: 1,
    hidden: m.hidden || {},           // { [github_id | owner/name]: { at, reason } } — không hiển thị trên website
    excluded: m.excluded || {},       // { [github_id | owner/name]: { at, reason } } — không bao giờ thêm lại vào radar
    excluded_owners: m.excluded_owners || {}, // { [login]: { at, reason } }
    pinned: m.pinned || {},           // { [github_id | owner/name]: { at, note } } — ưu tiên hiển thị ở trang Xu hướng
  };
}
export function saveModeration(m) { writeJson(MODERATION_FILE, m); }

/** Tra cứu khóa kiểm duyệt theo ID hoặc tên đầy đủ (không phân biệt hoa thường). */
export function modHas(map, gid, fullName) {
  if (!map) return null;
  if (gid != null && map[String(gid)]) return map[String(gid)];
  if (fullName) {
    const lower = fullName.toLowerCase();
    for (const [k, v] of Object.entries(map)) if (k.toLowerCase() === lower) return v;
  }
  return null;
}

export function isExcluded(mod, gid, fullName) {
  if (modHas(mod.excluded, gid, fullName)) return true;
  const owner = (fullName || '').split('/')[0]?.toLowerCase();
  return Boolean(owner && Object.keys(mod.excluded_owners).some((o) => o.toLowerCase() === owner));
}

/** Ghi nhật ký thao tác quản trị (mỗi dòng một JSON). */
export function logAdminAction(action, target, details = {}, actor = 'admin') {
  fs.mkdirSync(path.dirname(ADMIN_LOG_FILE), { recursive: true });
  fs.appendFileSync(ADMIN_LOG_FILE, JSON.stringify({ at: nowIso(), actor, action, target, details }) + '\n', 'utf8');
}

export function readAdminLog(limit = 200) {
  if (!fs.existsSync(ADMIN_LOG_FILE)) return [];
  const lines = fs.readFileSync(ADMIN_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
}

// ------------------------------------------------------------------ Cập nhật radar

/** Giữ những trường cần cho chấm điểm/hiển thị (định dạng giống data/github/*.json). */
function slimMeta(meta) {
  const { og_image, custom_og_image, languages, ...rest } = meta;
  return rest;
}

/**
 * Thêm/cập nhật một repo từ kết quả REST/Search. group: nhóm khám phá (vd. 'new7', 'topic:llm').
 * Trả về 'new' | 'updated' | 'renamed'.
 */
export function upsertRadar(radar, item, group, at = nowIso()) {
  const gid = String(item.id);
  const norm = normalizeRest(item, item.full_name, 'search');
  const cur = radar.repos[gid];
  if (!cur) {
    radar.repos[gid] = {
      github_id: item.id,
      node_id: item.node_id || null,
      full_name: item.full_name,
      status: norm.status,
      first_seen_at: at,
      last_seen_at: at,
      fetched_at: at,
      seen_in: group ? { [group]: at } : {},
      meta: slimMeta(norm.meta),
      activity: null,
      readme: null,
      contributors: null,
      stargazers: null,
      release_checked: false,
      release: null,
    };
    return 'new';
  }
  let result = 'updated';
  if (cur.full_name.toLowerCase() !== item.full_name.toLowerCase()) {
    cur.renamed_from = cur.full_name;
    cur.renamed_at = at;
    result = 'renamed';
  }
  cur.full_name = item.full_name;
  cur.node_id ||= item.node_id || null;
  cur.status = norm.status;
  cur.last_seen_at = at;
  cur.fetched_at = at;
  if (group) cur.seen_in = { ...(cur.seen_in || {}), [group]: at };
  // pushed_at thay đổi → feed commit đã cũ (sẽ được lấy lại ở lượt sau)
  if (cur.meta?.pushed_at !== norm.meta.pushed_at && cur.activity) cur.activity.stale = true;
  cur.meta = slimMeta(norm.meta);
  delete cur.missing_since;
  return result;
}

/** Đánh dấu repo không còn truy cập được (404/451/riêng tư). Giữ số liệu cũ, không xóa ngay. */
export function markMissing(radar, gid, status, at = nowIso()) {
  const cur = radar.repos[String(gid)];
  if (!cur) return;
  cur.status = status;
  cur.missing_since ||= at;
  cur.fetched_at = at;
}

/** Giới hạn kích thước radar: loại repo ít giá trị nhất (không loại repo đã xuất bản/ghim). */
export function enforceRadarLimit(radar, max, keep = new Set()) {
  const ids = Object.keys(radar.repos);
  if (ids.length <= max) return [];
  const now = Date.now();
  const prio = (r) => {
    const m = r.meta || {};
    const seenDays = (now - Date.parse(r.last_seen_at || 0)) / 86400000;
    const young = now - Date.parse(m.created_at || 0) < 90 * 86400000;
    const gemLike = (m.stars || 0) >= 50 && (m.stars || 0) <= 3000 && now - Date.parse(m.pushed_at || 0) < 30 * 86400000;
    return Math.log10((m.stars || 0) + 10) * 10 + (young ? 25 : 0) + (gemLike ? 20 : 0) + (r.readme ? 15 : 0) - seenDays * 3;
  };
  const removable = ids.filter((id) => !keep.has(id)).sort((a, b) => prio(radar.repos[a]) - prio(radar.repos[b]));
  const drop = removable.slice(0, ids.length - max);
  for (const id of drop) delete radar.repos[id];
  return drop;
}

// ------------------------------------------------------------------ README (raw.githubusercontent.com, không tốn hạn mức API)

const RADAR_README_CANDIDATES = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.markdown', 'README.mdx', 'README.rst', 'README'];

/** Văn bản thuần từ markdown (để phân loại và phân tích): bỏ khối mã, HTML, ảnh, cú pháp. */
export function readmePlainText(md, max = 6000) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_`|~]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Đoạn mở đầu README (từ đầu tới tiêu đề lớn thứ hai), đã làm sạch — dùng cho bản xem trước có ghi nguồn. */
export function readmeIntroHtml(md, ctx, limit = 2600) {
  const tokens = marked.lexer(String(md || '').replace(/<!--[\s\S]*?-->/g, ''));
  let start = 0;
  if (tokens[0]?.type === 'heading' && tokens[0].depth <= 2) start = 1;
  let end = tokens.length;
  for (let i = start; i < tokens.length; i++) if (tokens[i].type === 'heading' && tokens[i].depth <= 2) { end = i; break; }
  const slice = [];
  let size = 0;
  let truncated = end < tokens.length;
  for (let i = start; i < end; i++) {
    const t = tokens[i];
    if (t.type === 'space') continue;
    if (size + (t.raw?.length || 0) > limit && slice.length) { truncated = true; break; }
    slice.push(t);
    size += t.raw?.length || 0;
  }
  slice.links = tokens.links;
  const html = sanitize(marked.parser(slice), ctx);
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text.length >= 40 ? { html, truncated, chars: size } : null;
}

/**
 * Lấy README (raw) và tạo trích đoạn. Trả về { summary (lưu trong radar), extract (lưu file riêng) } hoặc null.
 * summary có cấu trúc như readme của data/github (length, sections → boolean) để dùng chung hàm chấm điểm.
 */
export async function fetchReadmeExtract(full, branch) {
  for (const p of RADAR_README_CANDIDATES) {
    const url = `https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch || 'HEAD')}/${encodeURIComponent(p)}`;
    const res = await request(url, { api: false, retries: 2 });
    if (!res.ok) continue;
    const md = res.text();
    const ctx = { full_name: full, branch: branch || 'HEAD', path: p };
    const pr = processReadme(md, ctx);
    const at = nowIso();
    const summary = {
      path: p,
      length: pr.length,
      cjk_ratio: pr.cjk_ratio,
      docker_mentioned: pr.docker_mentioned,
      sections: { install: Boolean(pr.sections.install), usage: Boolean(pr.sections.usage), features: Boolean(pr.sections.features) },
      headings: pr.headings,
      videos: pr.videos,
      processor: README_PROCESSOR_VERSION,
      fetched_at: at,
    };
    const extract = {
      full_name: full,
      path: p,
      fetched_at: at,
      length: pr.length,
      text: readmePlainText(md, 6000),
      intro: readmeIntroHtml(md, ctx),
      sections: pr.sections,
    };
    return { summary, extract };
  }
  return null;
}
