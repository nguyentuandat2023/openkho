// Phân loại tự động (đa nhãn) vào 20 lĩnh vực công nghệ theo quy tắc minh bạch (data/areas.yaml).
// Mỗi nhãn kèm độ tin cậy và danh sách tín hiệu (topic/mô tả/README/ngôn ngữ) để kiểm chứng.
// Không dùng AI để gán nhãn → kết quả lặp lại được, giải thích được.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { DATA_DIR } from './config.mjs';

export const AREAS_FILE = path.join(DATA_DIR, 'areas.yaml');
export const CLASSIFIER_VERSION = 1;
const WEIGHT = { topic: 3, desc: 2, name: 1, readme: 1, lang: 0.5 };
const CAP = { topic: 6, desc: 4, name: 1, readme: 3, lang: 0.5 };
const THRESHOLD = 3;
const MAX_LABELS = 5;

let cache = null;
export function loadAreas() {
  if (cache) return cache;
  const raw = YAML.parse(fs.readFileSync(AREAS_FILE, 'utf8')) || [];
  cache = raw.map((a) => ({
    slug: a.slug, name: a.name, en: a.en || a.name, icon: a.icon || 'sparkles', hue: a.hue ?? 210, description: a.description || '',
    implies: a.implies || [],
    topics: new Set((a.topics || []).map((t) => String(t).toLowerCase())),
    keywords: (a.keywords || []).map(compileKeyword),
    languages: new Set((a.languages || []).map((l) => String(l).toLowerCase())),
    combo: a.combo ? { with: a.combo.with, topics: new Set((a.combo.topics || []).map(String)), keywords: (a.combo.keywords || []).map(compileKeyword) } : null,
  }));
  return cache;
}
export function resetAreasCache() { cache = null; }

/** Từ khóa → biểu thức chính quy có ranh giới từ (dấu * ở cuối = khớp tiền tố). */
function compileKeyword(kw) {
  const k = String(kw).toLowerCase().trim();
  const prefix = k.endsWith('*');
  const body = (prefix ? k.slice(0, -1) : k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return { kw: k, re: new RegExp(`(?<![a-z0-9])${body}${prefix ? '' : '(?![a-z0-9])'}`, 'g') };
}

const countMatches = (re, text) => (text ? (text.match(re) || []).length : 0);

/**
 * input: { topics[], description, name, readme_text, language }
 * Trả về [{ slug, confidence, score, signals[] }] sắp theo điểm giảm dần.
 */
export function classify(input) {
  const areas = loadAreas();
  const topics = new Set((input.topics || []).map((t) => String(t).toLowerCase()));
  const desc = String(input.description || '').toLowerCase();
  const name = String(input.name || '').toLowerCase().replace(/[-_.]+/g, ' ');
  const readme = String(input.readme_text || '').toLowerCase().slice(0, 6000);
  const lang = String(input.language || '').toLowerCase();
  const raw = new Map();

  for (const a of areas) {
    const signals = [];
    const pts = { topic: 0, desc: 0, name: 0, readme: 0, lang: 0 };
    for (const t of topics) if (a.topics.has(t)) { pts.topic += WEIGHT.topic; signals.push(`topic:${t}`); }
    for (const k of a.keywords) {
      k.re.lastIndex = 0;
      if (countMatches(k.re, desc)) { pts.desc += WEIGHT.desc; signals.push(`mô tả:"${k.kw.replace('*', '')}"`); }
      k.re.lastIndex = 0;
      if (countMatches(k.re, name)) { pts.name += WEIGHT.name; signals.push(`tên:"${k.kw.replace('*', '')}"`); }
      k.re.lastIndex = 0;
      if (countMatches(k.re, readme) >= 2) { pts.readme += WEIGHT.readme; signals.push(`README:"${k.kw.replace('*', '')}"`); }
    }
    if (lang && a.languages.has(lang)) { pts.lang += WEIGHT.lang; signals.push(`ngôn ngữ:${input.language}`); }
    const score = Math.min(pts.topic, CAP.topic) + Math.min(pts.desc, CAP.desc) + Math.min(pts.name, CAP.name) + Math.min(pts.readme, CAP.readme) + Math.min(pts.lang, CAP.lang);
    raw.set(a.slug, { score, signals });
  }

  // Kết hợp: vd. "AI Automation" = có tín hiệu AI + tín hiệu tự động hóa
  for (const a of areas) {
    if (!a.combo) continue;
    const partner = raw.get(a.combo.with);
    if (!partner || partner.score < THRESHOLD) continue;
    const hitTopic = [...topics].find((t) => a.combo.topics.has(t));
    const hitKw = a.combo.keywords.find((k) => { k.re.lastIndex = 0; return countMatches(k.re, desc) > 0; });
    if (hitTopic || hitKw) {
      const cur = raw.get(a.slug);
      cur.score += 3;
      cur.signals.push(`kết hợp:${a.combo.with}+${hitTopic ? `topic:${hitTopic}` : `mô tả:"${hitKw.kw.replace('*', '')}"`}`);
    }
  }

  let labels = [...raw.entries()]
    .filter(([, v]) => v.score >= THRESHOLD)
    .map(([slug, v]) => ({ slug, score: Math.round(v.score * 10) / 10, confidence: Math.min(0.99, Math.round((v.score / 8) * 100) / 100), signals: v.signals.slice(0, 8) }));

  // Lĩnh vực cha được suy ra từ lĩnh vực con
  for (const a of areas) {
    const child = labels.find((l) => l.slug === a.slug);
    if (!child) continue;
    for (const parent of a.implies) {
      const conf = Math.round(child.confidence * 0.8 * 100) / 100;
      const existing = labels.find((l) => l.slug === parent);
      if (existing) { if (existing.confidence < conf) { existing.confidence = conf; existing.signals.push(`suy ra từ:${a.slug}`); } }
      else labels.push({ slug: parent, score: child.score * 0.8, confidence: conf, signals: [`suy ra từ:${a.slug}`] });
    }
  }
  labels.sort((x, y) => y.confidence - x.confidence || y.score - x.score);
  return labels.slice(0, MAX_LABELS);
}
