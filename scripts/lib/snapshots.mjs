// Kho snapshot số liệu theo thời gian (sao, fork) — nguồn duy nhất để tính tăng trưởng.
// Nguyên tắc: chỉ ghi số liệu ĐO THẬT tại thời điểm đo; không nội suy, không tự tạo điểm lịch sử.
//   data/snapshots/recent.json          : mọi lần đo trong ~60 giờ gần nhất (tính tăng trưởng 24 giờ)
//   data/snapshots/daily/YYYY-MM.json   : lần đo CUỐI CÙNG của mỗi ngày (UTC) cho từng repo (7/30 ngày, biểu đồ)
// Khóa: GitHub Repository ID (số) dạng chuỗi → không lệch khi repo đổi tên/chuyển chủ sở hữu.
// Mỗi điểm: [epochSeconds, stars, forks]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson } from './config.mjs';

export const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const RECENT_FILE = path.join(SNAPSHOT_DIR, 'recent.json');
const DAILY_DIR = path.join(SNAPSHOT_DIR, 'daily');
const HOUR = 3600;
const DAYS = 86400;

const monthOf = (sec) => new Date(sec * 1000).toISOString().slice(0, 7);
const dayOf = (sec) => Math.floor(sec / DAYS);

/** Chèn điểm theo thứ tự thời gian; gộp điểm cách nhau < mergeSec (giữ điểm mới hơn). */
function insertPoint(arr, p, mergeSec) {
  let i = arr.length;
  while (i > 0 && arr[i - 1][0] > p[0]) i--;
  if (i > 0 && p[0] - arr[i - 1][0] < mergeSec) { arr[i - 1] = p; return; }
  if (i < arr.length && arr[i][0] - p[0] < mergeSec) return; // đã có điểm mới hơn sát bên
  arr.splice(i, 0, p);
}

export function listMonths() {
  if (!fs.existsSync(DAILY_DIR)) return [];
  return fs.readdirSync(DAILY_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).sort();
}

/**
 * Mở kho snapshot. months: số tháng gần nhất cần nạp (mặc định 14 ≈ 400 ngày).
 * Trả về đối tượng có record/series/growth/save.
 */
export function openSnapshots({ months = 14, now = Date.now() } = {}) {
  const recent = readJson(RECENT_FILE, null) || { version: 1, repos: {} };
  const daily = new Map(); // 'YYYY-MM' → { version, month, repos }
  const dirty = new Set();
  let recentDirty = false;
  const all = listMonths();
  for (const m of all.slice(-months)) daily.set(m, readJson(path.join(DAILY_DIR, `${m}.json`), { version: 1, month: m, repos: {} }));

  const monthStore = (m) => {
    if (!daily.has(m)) daily.set(m, readJson(path.join(DAILY_DIR, `${m}.json`), null) || { version: 1, month: m, repos: {} });
    return daily.get(m);
  };

  const store = {
    recent,
    daily,
    /** Ghi một lần đo thật. at: Date/ISO/ms. Bỏ qua giá trị không hợp lệ. */
    record(gid, { stars, forks, at }) {
      if (gid === null || gid === undefined || !Number.isFinite(stars)) return false;
      const sec = Math.round((at instanceof Date ? at.getTime() : typeof at === 'string' ? Date.parse(at) : at ?? now) / 1000);
      if (!Number.isFinite(sec) || sec * 1000 > now + 5 * 60_000) return false; // không nhận thời điểm ở tương lai
      const p = [sec, stars, Number.isFinite(forks) ? forks : null];
      const key = String(gid);
      insertPoint((recent.repos[key] ||= []), p, 20 * 60); // hai lần đo cách nhau < 20 phút → giữ lần sau
      recentDirty = true;
      const m = monthOf(sec);
      const ms = monthStore(m);
      const arr = (ms.repos[key] ||= []);
      // Một điểm/ngày: điểm cùng ngày UTC được thay bằng lần đo muộn hơn
      const idx = arr.findIndex((x) => dayOf(x[0]) === dayOf(sec));
      if (idx >= 0) { if (arr[idx][0] <= sec) arr[idx] = p; }
      else insertPoint(arr, p, 1);
      dirty.add(m);
      return true;
    },
    has(gid) { return Boolean(recent.repos[String(gid)]?.length) || [...daily.values()].some((d) => d.repos[String(gid)]?.length); },
    /** Chuỗi điểm (ms) đã gộp: điểm theo ngày (cũ) + mọi điểm gần đây, sắp theo thời gian. */
    series(gid, { sinceMs = 0 } = {}) {
      const key = String(gid);
      const out = [];
      for (const [, d] of [...daily.entries()].sort()) for (const p of d.repos[key] || []) if (p[0] * 1000 >= sinceMs) out.push(p);
      for (const p of recent.repos[key] || []) if (p[0] * 1000 >= sinceMs) out.push(p);
      out.sort((a, b) => a[0] - b[0]);
      const dedup = [];
      for (const p of out) if (!dedup.length || dedup[dedup.length - 1][0] !== p[0]) dedup.push(p);
      return dedup.map(([s, st, fk]) => [s * 1000, st, fk]);
    },
    /** Điểm theo ngày (cho biểu đồ): [[ms, stars, forks]] — mỗi ngày một điểm, gồm cả hôm nay. */
    dailySeries(gid, days = 365) {
      const since = now - days * 86400000;
      const byDay = new Map();
      for (const p of this.series(gid, { sinceMs: since })) byDay.set(Math.floor(p[0] / 86400000), p);
      return [...byDay.values()].sort((a, b) => a[0] - b[0]);
    },
    ids() {
      const s = new Set(Object.keys(recent.repos));
      for (const d of daily.values()) for (const k of Object.keys(d.repos)) s.add(k);
      return s;
    },
    /** Xóa toàn bộ điểm của các repo không còn theo dõi. */
    forget(gids) {
      const set = new Set([...gids].map(String));
      for (const k of Object.keys(recent.repos)) if (set.has(k)) { delete recent.repos[k]; recentDirty = true; }
      for (const [m, d] of daily) for (const k of Object.keys(d.repos)) if (set.has(k)) { delete d.repos[k]; dirty.add(m); }
    },
    /** Lưu: cắt recent theo retention (giờ). Chỉ ghi file tháng có thay đổi. */
    save({ recentHours = 60 } = {}) {
      const cutoff = Math.floor(now / 1000) - recentHours * HOUR;
      for (const [k, arr] of Object.entries(recent.repos)) {
        const kept = arr.filter((p) => p[0] >= cutoff);
        if (kept.length !== arr.length) recentDirty = true;
        if (kept.length) recent.repos[k] = kept; else delete recent.repos[k];
      }
      if (recentDirty) writeJson(RECENT_FILE, { version: 1, updated_at: new Date(now).toISOString(), repos: recent.repos }, false);
      for (const m of dirty) {
        const d = daily.get(m);
        writeJson(path.join(DAILY_DIR, `${m}.json`), { version: 1, month: m, updated_at: new Date(now).toISOString(), repos: d.repos }, false);
      }
      const n = dirty.size + (recentDirty ? 1 : 0);
      dirty.clear();
      recentDirty = false;
      return n;
    },
  };
  return store;
}

/** Xóa file tháng cũ hơn số ngày lưu giữ. Trả về danh sách tháng đã xóa. */
export function pruneDailyMonths(retentionDays, now = Date.now()) {
  const cutoff = new Date(now - retentionDays * 86400000).toISOString().slice(0, 7);
  const removed = [];
  for (const m of listMonths()) if (m < cutoff) { fs.rmSync(path.join(DAILY_DIR, `${m}.json`), { force: true }); removed.push(m); }
  return removed;
}

// ------------------------------------------------------------------ Tăng trưởng theo cửa sổ thời gian

export const WINDOWS = [
  { key: 'd1', days: 1, label: '24 giờ', tolerance_h: 6 },
  { key: 'd7', days: 7, label: '7 ngày', tolerance_h: 24 },
  { key: 'd30', days: 30, label: '30 ngày', tolerance_h: 72 },
];

/**
 * Tăng trưởng trong một cửa sổ, chỉ từ dữ liệu thật:
 *  1) 'snapshots'         : hiệu hai lần đo — lần mới nhất và lần đo gần nhất với (mới nhất − cửa sổ) trong biên dung sai.
 *  2) 'created_in_window' : repo được tạo bên trong cửa sổ → toàn bộ số sao hiện có đều phát sinh trong cửa sổ (chính xác).
 *  3) 'stargazer_sample'  : đếm thời điểm gắn sao (GitHub API) khi mẫu bao trùm cả cửa sổ (chính xác cho sao hiện còn).
 * Không có cách nào hợp lệ → null (website hiển thị "chưa đủ dữ liệu").
 * gained: số sao tăng quy về đúng độ dài cửa sổ (chỉ điều chỉnh tỉ lệ trong biên dung sai; delta gốc vẫn được trả về).
 */
export function windowGrowth(points, { days, tolerance_h }, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const W = days * 86400000;
  const tol = tolerance_h * 3600000;
  const last = points.length ? points[points.length - 1] : null;
  const freshEnough = last && now - last[0] <= Math.min(36 * 3600000, W / 2 + 6 * 3600000);
  if (last && freshEnough) {
    const target = last[0] - W;
    let best = null;
    for (const p of points) {
      if (p[0] >= last[0]) break;
      const d = Math.abs(p[0] - target);
      if (d <= tol && (!best || d < Math.abs(best[0] - target))) best = p;
    }
    if (best) {
      const span = last[0] - best[0];
      const delta = last[1] - best[1];
      const fDelta = last[2] != null && best[2] != null ? last[2] - best[2] : null;
      const scale = W / span;
      return {
        method: 'snapshots', exact: true,
        delta, forks_delta: fDelta, span_hours: Math.round(span / 360000) / 10,
        gained: Math.round(delta * scale), forks_gained: fDelta === null ? null : Math.round(fDelta * scale),
        base_stars: best[1], from: new Date(best[0]).toISOString(), to: new Date(last[0]).toISOString(),
      };
    }
  }
  const created = ctx.created_at ? Date.parse(ctx.created_at) : null;
  const curStars = ctx.stars ?? (last ? last[1] : null);
  const at = ctx.measured_at ? Date.parse(ctx.measured_at) : last ? last[0] : now;
  if (created && curStars != null && at - created <= W && at >= created) {
    return {
      method: 'created_in_window', exact: true,
      delta: curStars, forks_delta: ctx.forks ?? null, span_hours: Math.round((at - created) / 360000) / 10,
      gained: curStars, forks_gained: ctx.forks ?? null,
      base_stars: 0, from: new Date(created).toISOString(), to: new Date(at).toISOString(),
    };
  }
  const sg = ctx.stargazers;
  if (sg && sg[`d${days}`]?.exact && Date.parse(sg.sampled_at) >= now - 12 * 3600000) {
    const n = sg[`d${days}`].stars;
    return {
      method: 'stargazer_sample', exact: true,
      delta: n, forks_delta: null, span_hours: days * 24,
      gained: n, forks_gained: null,
      base_stars: curStars != null ? Math.max(0, curStars - n) : null,
      from: new Date(Date.parse(sg.sampled_at) - W).toISOString(), to: sg.sampled_at,
    };
  }
  return null;
}

/** Tăng trưởng cho cả ba cửa sổ. */
export function growthAll(points, ctx) {
  return Object.fromEntries(WINDOWS.map((w) => [w.key, windowGrowth(points, w, ctx)]));
}

/** Thời điểm sớm nhất có thể tính được tăng trưởng của một cửa sổ (để báo "dự kiến có dữ liệu lúc …"). */
export function earliestWindowAt(firstPointMs, w) {
  if (!firstPointMs) return null;
  return new Date(firstPointMs + w.days * 86400000 - w.tolerance_h * 3600000).toISOString();
}
