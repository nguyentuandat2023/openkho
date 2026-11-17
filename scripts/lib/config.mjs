// Đường dẫn, cấu hình chung và đọc biến môi trường (.env.local / .env) cho các script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// OPENKHO_DATA_DIR / OPENKHO_CACHE_DIR: chỉ dùng cho kiểm thử (ghi vào thư mục tạm, không đụng dữ liệu thật)
export const DATA_DIR = process.env.OPENKHO_DATA_DIR ? path.resolve(process.env.OPENKHO_DATA_DIR) : path.join(ROOT, 'data');
export const CATALOG_DIR = path.join(DATA_DIR, 'catalog');
export const GITHUB_DIR = path.join(DATA_DIR, 'github');
export const HISTORY_FILE = path.join(DATA_DIR, 'history', 'stars.json');
export const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.yaml');
export const SYNC_REPORT_FILE = path.join(DATA_DIR, 'sync-report.json');
export const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json');
export const CACHE_DIR = process.env.OPENKHO_CACHE_DIR ? path.resolve(process.env.OPENKHO_CACHE_DIR) : path.join(ROOT, '.cache');
export const GENERATED_DIR = path.join(ROOT, 'src', 'generated');
export const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data');

/** Đọc .env.local rồi .env (không ghi đè biến đã có trong môi trường). */
export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

export function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

export function siteConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
}

export function readJson(file, fallback = null) {
  try {
    // Bỏ BOM nếu file được ghi bởi PowerShell 5.1
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data, pretty = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 1 : 0) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Tên file dữ liệu của một repo: owner__name.json (chữ thường). */
export function repoDataFile(id) {
  return path.join(GITHUB_DIR, `${id.toLowerCase().replace('/', '__')}.json`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DAY = 86400000;
export const daysSince = (iso, now = Date.now()) => (iso ? (now - Date.parse(iso)) / DAY : null);

/** Chạy fn trên từng phần tử với số luồng đồng thời giới hạn. */
export async function pMap(items, fn, concurrency = 4) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Lấy giá trị tham số dòng lệnh: --key value hoặc --key=value; cờ boolean trả true. */
export function argv(name, def = undefined) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === `--${name}`) {
      const nxt = args[i + 1];
      return nxt && !nxt.startsWith('--') ? nxt : true;
    }
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return def;
}
