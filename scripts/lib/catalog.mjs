// Đọc, kiểm tra và chỉnh sửa danh mục + catalog (YAML). Dùng Document API của `yaml`
// để giữ nguyên chú thích và định dạng khi trang Quản trị sửa file.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { CATALOG_DIR, CATEGORIES_FILE } from './config.mjs';

export const ENUMS = {
  platforms: ['windows', 'macos', 'linux', 'docker', 'web', 'android', 'ios'],
  deploy: ['desktop', 'local', 'self-host', 'cli', 'library', 'extension', 'skill', 'cloud', 'content'],
  difficulty: ['easy', 'medium', 'hard'],
  pricing: ['free', 'freemium', 'paid-license'],
  needs_api_key: ['none', 'optional', 'required'],
  license_class: ['permissive', 'weak-copyleft', 'copyleft', 'content', 'source-available', 'noncommercial', 'custom', 'none'],
};

export const EDITORIAL_FIELDS = [
  'also', 'tags', 'summary', 'use_cases', 'features', 'pros', 'cons', 'platforms', 'deploy', 'difficulty',
  'pricing', 'needs_api_key', 'requirements', 'license_note', 'license_override', 'note', 'quick_start',
  'docs', 'demo', 'video', 'alternatives', 'applicability', 'featured', 'added_at',
];

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function loadCategories() {
  const list = YAML.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8')) || [];
  return list.map((c, i) => ({ order: i, ...c }));
}

export function saveCategories(list) {
  const doc = new YAML.Document(list.map(({ order, ...c }) => c));
  const header = fs.readFileSync(CATEGORIES_FILE, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('#')).join('\n');
  fs.writeFileSync(CATEGORIES_FILE, `${header}\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}`, 'utf8');
}

function catalogFiles() {
  if (!fs.existsSync(CATALOG_DIR)) return [];
  return fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.yaml')).sort();
}

/** Toàn bộ mục trong catalog; `category` = tên file (danh mục chính). */
export function loadCatalog() {
  const entries = [];
  for (const file of catalogFiles()) {
    const category = file.replace(/\.yaml$/, '');
    const list = YAML.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8')) || [];
    if (!Array.isArray(list)) throw new Error(`${file}: nội dung phải là một danh sách (bắt đầu bằng "- repo: ...")`);
    list.forEach((e, idx) => entries.push({ ...e, category, _file: file, _index: idx }));
  }
  return entries;
}

/** Kiểm tra catalog + danh mục. Trả về { errors, warnings }. */
export function validate(entries = loadCatalog(), categories = loadCategories()) {
  const errors = [];
  const warnings = [];
  const slugs = new Set();
  for (const c of categories) {
    if (!c.slug || !SLUG_RE.test(c.slug)) errors.push(`Danh mục có slug không hợp lệ: "${c.slug}"`);
    if (slugs.has(c.slug)) errors.push(`Danh mục trùng slug: ${c.slug}`);
    slugs.add(c.slug);
    if (!c.name) errors.push(`Danh mục ${c.slug} thiếu tên (name)`);
  }
  for (const file of catalogFiles()) {
    const slug = file.replace(/\.yaml$/, '');
    if (!slugs.has(slug)) errors.push(`File catalog/${file} không khớp danh mục nào trong categories.yaml`);
  }
  const seen = new Map();
  for (const e of entries) {
    const where = `${e._file} › ${e.repo || `(mục #${e._index + 1})`}`;
    if (!e.repo || !REPO_RE.test(String(e.repo))) {
      errors.push(`${where}: trường "repo" phải có dạng owner/ten-repo`);
      continue;
    }
    const key = e.repo.toLowerCase();
    if (seen.has(key)) errors.push(`${where}: repo bị trùng (đã có trong ${seen.get(key)})`);
    seen.set(key, e._file);
    for (const k of Object.keys(e)) {
      if (k.startsWith('_') || k === 'repo' || k === 'category') continue;
      if (!EDITORIAL_FIELDS.includes(k)) warnings.push(`${where}: trường lạ "${k}" (bị bỏ qua)`);
    }
    for (const f of ['platforms', 'deploy']) {
      if (e[f] === undefined) continue;
      if (!Array.isArray(e[f])) errors.push(`${where}: "${f}" phải là danh sách`);
      else for (const v of e[f]) if (!ENUMS[f].includes(v)) errors.push(`${where}: ${f} không hợp lệ "${v}" (cho phép: ${ENUMS[f].join(', ')})`);
    }
    for (const f of ['difficulty', 'pricing', 'needs_api_key']) {
      if (e[f] !== undefined && !ENUMS[f].includes(e[f])) errors.push(`${where}: ${f} không hợp lệ "${e[f]}" (cho phép: ${ENUMS[f].join(', ')})`);
    }
    if (e.also) {
      if (!Array.isArray(e.also)) errors.push(`${where}: "also" phải là danh sách slug danh mục`);
      else for (const s of e.also) if (!slugs.has(s)) errors.push(`${where}: danh mục phụ không tồn tại "${s}"`);
    }
    if (e.applicability !== undefined && !(Number.isInteger(e.applicability) && e.applicability >= 1 && e.applicability <= 5)) {
      errors.push(`${where}: applicability phải là số nguyên 1–5`);
    }
    for (const f of ['use_cases', 'features', 'pros', 'cons', 'tags', 'alternatives']) {
      if (e[f] !== undefined && !Array.isArray(e[f])) errors.push(`${where}: "${f}" phải là danh sách`);
    }
    for (const f of ['docs', 'demo', 'video']) {
      if (e[f] !== undefined && !/^https:\/\//.test(String(e[f])) && !(f === 'docs' && e[f] === 'none')) errors.push(`${where}: "${f}" phải là link https://${f === 'docs' ? ' (hoặc "none" để ẩn trang chủ của repo)' : ''}`);
    }
    if (e.license_override) {
      const lo = e.license_override;
      if (typeof lo !== 'object') errors.push(`${where}: license_override phải là object { spdx, class, name }`);
      else if (lo.class && !ENUMS.license_class.includes(lo.class)) errors.push(`${where}: license_override.class không hợp lệ "${lo.class}"`);
    }
    if (!e.summary) warnings.push(`${where}: chưa có mô tả tiếng Việt (summary)`);
    if (e.alternatives) for (const a of e.alternatives) if (!REPO_RE.test(a)) errors.push(`${where}: alternatives "${a}" không đúng dạng owner/repo`);
  }
  return { errors, warnings, count: entries.length };
}

// ---------- Chỉnh sửa (dùng bởi trang Quản trị và các lệnh CLI) ----------

function loadDoc(file) {
  const full = path.join(CATALOG_DIR, file);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const doc = YAML.parseDocument(text || '[]');
  if (!doc.contents || !YAML.isSeq(doc.contents)) doc.contents = doc.createNode([]);
  return { doc, full };
}

function saveDoc(doc, full) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, doc.toString({ lineWidth: 0, flowCollectionPadding: false }), 'utf8');
}

function findItem(doc, id) {
  const items = doc.contents.items;
  const idx = items.findIndex((it) => String(it.get?.('repo') || '').toLowerCase() === id.toLowerCase());
  return { items, idx };
}

export function findEntry(id) {
  return loadCatalog().find((e) => e.repo.toLowerCase() === id.toLowerCase()) || null;
}

function cleanFields(fields) {
  const out = {};
  for (const k of EDITORIAL_FIELDS) {
    const v = fields[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

export function addEntry(category, repo, fields = {}) {
  if (!REPO_RE.test(repo)) throw new Error('Repo phải có dạng owner/ten-repo');
  if (findEntry(repo)) throw new Error(`${repo} đã có trong thư viện`);
  const { doc, full } = loadDoc(`${category}.yaml`);
  const node = doc.createNode({ repo, ...cleanFields({ added_at: new Date().toISOString().slice(0, 10), ...fields }) });
  doc.contents.items.push(node);
  saveDoc(doc, full);
}

export function updateEntry(id, fields, { replace = false } = {}) {
  const entry = findEntry(id);
  if (!entry) throw new Error(`Không tìm thấy ${id} trong catalog`);
  const { doc, full } = loadDoc(entry._file);
  const { items, idx } = findItem(doc, id);
  const node = items[idx];
  const clean = cleanFields(fields);
  if (replace) {
    for (const k of EDITORIAL_FIELDS) if (!(k in clean) && k !== 'added_at') node.delete(k);
  }
  for (const [k, v] of Object.entries(clean)) node.set(k, doc.createNode(v));
  for (const [k, v] of Object.entries(fields)) if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) node.delete(k);
  saveDoc(doc, full);
}

export function renameEntry(id, newRepo) {
  const entry = findEntry(id);
  if (!entry) throw new Error(`Không tìm thấy ${id}`);
  const { doc, full } = loadDoc(entry._file);
  const { items, idx } = findItem(doc, id);
  items[idx].set('repo', newRepo);
  saveDoc(doc, full);
}

export function removeEntry(id) {
  const entry = findEntry(id);
  if (!entry) throw new Error(`Không tìm thấy ${id}`);
  const { doc, full } = loadDoc(entry._file);
  const { items, idx } = findItem(doc, id);
  items.splice(idx, 1);
  saveDoc(doc, full);
  return entry;
}

export function moveEntry(id, newCategory) {
  const entry = findEntry(id);
  if (!entry) throw new Error(`Không tìm thấy ${id}`);
  if (entry.category === newCategory) return;
  const src = loadDoc(entry._file);
  const { items, idx } = findItem(src.doc, id);
  const json = items[idx].toJSON();
  items.splice(idx, 1);
  const dst = loadDoc(`${newCategory}.yaml`);
  json.also = (json.also || []).filter((s) => s !== newCategory);
  if (!json.also.length) delete json.also;
  dst.doc.contents.items.push(dst.doc.createNode(json));
  saveDoc(src.doc, src.full);
  saveDoc(dst.doc, dst.full);
}
