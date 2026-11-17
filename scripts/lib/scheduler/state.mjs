// Trạng thái bộ lập lịch (chạy phía máy chủ / GitHub Actions — KHÔNG chạy trên trình duyệt).
//   data/jobs/state.json    : lần chạy gần nhất / thành công gần nhất / lần tới của từng job (commit vào git)
//   data/jobs/history.json  : lịch sử các lượt chạy (giữ N lượt gần nhất)
//   .cache/scheduler.lock   : khóa toàn cục — tại một thời điểm chỉ một job chạy (chống trùng lặp, tránh vượt hạn mức API)
//   .cache/jobs/logs/<id>.log : nhật ký đầy đủ từng lượt chạy
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR, CACHE_DIR, readJson, writeJson } from '../config.mjs';
import { JOB_NAMES } from '../settings.mjs';

export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
export const STATE_FILE = path.join(JOBS_DIR, 'state.json');
export const HISTORY_FILE = path.join(JOBS_DIR, 'history.json');
export const LOCK_FILE = path.join(CACHE_DIR, 'scheduler.lock');
export const LOG_DIR = path.join(CACHE_DIR, 'jobs', 'logs');
export const DAEMON_FILE = path.join(CACHE_DIR, 'scheduler-daemon.json');
const H = 3600000;

export function loadState() {
  const s = readJson(STATE_FILE, null) || {};
  const jobs = {};
  for (const name of JOB_NAMES) jobs[name] = { ...(s.jobs?.[name] || {}) };
  return { version: 1, updated_at: s.updated_at || null, jobs };
}

export function saveState(state) {
  state.updated_at = new Date().toISOString();
  writeJson(STATE_FILE, state);
}

export function loadHistory() {
  return readJson(HISTORY_FILE, null) || { version: 1, runs: [] };
}

export function appendHistory(entry, keep = 300) {
  const h = loadHistory();
  const i = h.runs.findIndex((r) => r.id === entry.id);
  if (i >= 0) h.runs[i] = entry; else h.runs.push(entry);
  if (h.runs.length > keep) h.runs.splice(0, h.runs.length - keep);
  writeJson(HISTORY_FILE, h);
}

/**
 * Job đến hạn? Quy tắc:
 *  - tắt (scheduler hoặc job) → không
 *  - đang hoãn vì hết hạn mức (deferred_until) → chưa
 *  - chưa từng chạy thành công → có
 *  - next_due_at (đặt sau mỗi lượt: thành công = bắt đầu + chu kỳ; thất bại = backoff) ≤ bây giờ → có
 */
export function dueInfo(name, settings, state, now = Date.now()) {
  const cfg = settings.scheduler.jobs[name];
  const st = state.jobs[name] || {};
  if (!settings.scheduler.enabled) return { due: false, reason: 'Bộ lập lịch đang tắt' };
  if (!cfg?.enabled) return { due: false, reason: 'Job đang tắt' };
  if (st.deferred_until && Date.parse(st.deferred_until) > now) return { due: false, reason: `Hoãn tới ${st.deferred_until} (hết hạn mức API)`, next_at: st.deferred_until };
  if (!st.last_success_at && !st.next_due_at) return { due: true, reason: 'Chưa từng chạy thành công', next_at: new Date(now).toISOString() };
  // Chu kỳ có thể vừa được đổi ở trang quản trị → tính lại từ lần thành công gần nhất
  const byInterval = st.last_started_success_at ? Date.parse(st.last_started_success_at) + cfg.interval_hours * H : 0;
  const next = st.last_status === 'success' || !st.next_due_at ? byInterval : Math.min(Date.parse(st.next_due_at), byInterval || Infinity);
  const nextAt = Number.isFinite(next) && next > 0 ? next : now;
  return { due: nextAt <= now, reason: nextAt <= now ? 'Đến hạn' : 'Chưa đến hạn', next_at: new Date(nextAt).toISOString() };
}

export function dueJobs(settings, state, now = Date.now()) {
  return JOB_NAMES
    .map((name) => ({ name, ...dueInfo(name, settings, state, now) }))
    .filter((j) => j.due)
    .sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at));
}

// ------------------------------------------------------------------ Khóa toàn cục

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

export function readLock() {
  return readJson(LOCK_FILE, null);
}

/** Khóa còn hiệu lực? Treo khi: tiến trình (cùng máy) đã chết, quá 10 phút không có heartbeat, hoặc chạy quá thời gian tối đa. */
export function lockStatus(maxMinutes = 45, now = Date.now()) {
  if (!fs.existsSync(LOCK_FILE)) return { held: false };
  const lock = readLock();
  if (!lock) {
    // File khóa hỏng (vd. mất điện khi đang ghi) → coi là treo sau 1 phút
    let mtime = now;
    try { mtime = fs.statSync(LOCK_FILE).mtimeMs; } catch { return { held: false }; }
    return { held: true, stale: now - mtime > 60_000, alive: null, lock: null, age_min: Math.round((now - mtime) / 60000) };
  }
  const beat = Date.parse(lock.heartbeat_at || lock.started_at || 0);
  const sameHost = lock.host === os.hostname();
  const alive = sameHost ? pidAlive(lock.pid) : null;
  const stale = alive === false || now - beat > 10 * 60_000 || now - Date.parse(lock.started_at) > (maxMinutes + 10) * 60_000;
  return { held: true, stale, alive, lock, age_min: Math.round((now - Date.parse(lock.started_at)) / 60000) };
}

/**
 * Giành khóa (tạo file độc quyền — nguyên tử). Khóa của tiến trình đã chết/treo được thu hồi.
 * Trả về { ok, lock?, takeover?, held_by? }
 */
export function acquireLock(info, maxMinutes = 45) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  const body = { ...info, pid: process.pid, host: os.hostname(), started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() };
  let takeover = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, JSON.stringify(body));
      fs.closeSync(fd);
      return { ok: true, lock: body, takeover };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const st = lockStatus(maxMinutes);
      if (!st.held) continue;
      if (!st.stale) return { ok: false, held_by: st.lock };
      takeover = st.lock || { job: '(không rõ — file khóa hỏng)' };
      // Đổi tên trước (nguyên tử) để hai tiến trình không cùng thu hồi một khóa
      try { fs.renameSync(LOCK_FILE, `${LOCK_FILE}.stale-${Date.now()}`); } catch { /* tiến trình khác đã thu hồi */ }
    }
  }
  return { ok: false, held_by: readLock() };
}

export function heartbeat(lock) {
  try {
    const cur = readLock();
    if (!cur || cur.pid !== process.pid || cur.run_id !== lock.run_id) return false;
    cur.heartbeat_at = new Date().toISOString();
    fs.writeFileSync(LOCK_FILE, JSON.stringify(cur));
    return true;
  } catch { return false; }
}

export function releaseLock(lock) {
  try {
    const cur = readLock();
    if (cur && cur.pid === process.pid && cur.run_id === lock.run_id) fs.rmSync(LOCK_FILE, { force: true });
  } catch { /* bỏ qua */ }
  // Dọn khóa treo cũ đã đổi tên
  try {
    for (const f of fs.readdirSync(path.dirname(LOCK_FILE))) if (f.startsWith('scheduler.lock.stale-')) fs.rmSync(path.join(path.dirname(LOCK_FILE), f), { force: true });
  } catch { /* bỏ qua */ }
}

/** Gỡ khóa thủ công (trang quản trị / CLI) — chỉ khi khóa đã treo, trừ khi force. */
export function forceUnlock(force = false, maxMinutes = 45) {
  const st = lockStatus(maxMinutes);
  if (!st.held) return { ok: true, message: 'Không có khóa' };
  if (!st.stale && !force) return { ok: false, message: `Job ${st.lock.job} đang chạy (PID ${st.lock.pid}, ${st.age_min} phút) — chỉ gỡ khi job bị treo` };
  fs.renameSync(LOCK_FILE, `${LOCK_FILE}.stale-${Date.now()}`);
  return { ok: true, message: `Đã gỡ khóa của job ${st.lock.job}`, lock: st.lock };
}

/** Thông tin daemon (tiến trình lập lịch chạy nền trên máy). */
export function daemonStatus(now = Date.now()) {
  const d = readJson(DAEMON_FILE, null);
  if (!d) return { running: false };
  const sameHost = d.host === os.hostname();
  const alive = sameHost ? pidAlive(d.pid) : null;
  const fresh = now - Date.parse(d.heartbeat_at || 0) < 3 * 60_000;
  return { ...d, running: Boolean(fresh && alive !== false), stale: !fresh || alive === false };
}
