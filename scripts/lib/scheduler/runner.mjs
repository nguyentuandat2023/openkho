// Chạy một job có kiểm soát: khóa toàn cục (không chạy trùng), heartbeat, giới hạn thời gian,
// thử lại với backoff lũy thừa khi lỗi tạm thời, hoãn khi hết hạn mức API, ghi trạng thái + lịch sử + nhật ký.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RateLimitError, saveEtags } from '../http.mjs';
import { loadSettings, JOB_NAMES } from '../settings.mjs';
import {
  loadState, saveState, appendHistory, loadHistory, acquireLock, heartbeat, releaseLock, lockStatus, LOG_DIR,
} from './state.mjs';

const H = 3600000;
const DATA_JOBS = new Set(['discover', 'refresh', 'reevaluate']);

export async function loadJob(name) {
  if (!JOB_NAMES.includes(name)) throw new Error(`Job không tồn tại: ${name}. Có: ${JOB_NAMES.join(', ')}`);
  const mod = await import(`../jobs/${name}.mjs`);
  return mod.default;
}

function sleepAbortable(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export const isAuthError = (err) => /\b401\b|Bad credentials/i.test(err?.message || '');
const isBug = (err) => err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError || err instanceof RangeError;

/**
 * Đánh dấu các lượt chạy bị gián đoạn (tiến trình chết, máy khởi động lại…) để lên lịch chạy lại.
 * Gọi khi daemon khởi động và trước mỗi lượt chạy.
 */
export function recoverInterrupted(settings = loadSettings(), log = () => {}) {
  const state = loadState();
  const lk = lockStatus(settings.scheduler.max_job_minutes);
  const recovered = [];
  for (const name of JOB_NAMES) {
    const st = state.jobs[name];
    if (!st.running) continue;
    const stillRunning = lk.held && !lk.stale && lk.lock?.run_id === st.running.run_id;
    if (stillRunning) continue;
    const at = new Date().toISOString();
    log(`Khôi phục: lượt ${st.running.run_id} của job ${name} bị gián đoạn (tiến trình không còn chạy) → lên lịch chạy lại.`);
    const h = loadHistory().runs.find((r) => r.id === st.running.run_id);
    appendHistory({ ...(h || { id: st.running.run_id, job: name, started_at: st.running.started_at, trigger: st.running.trigger }), status: 'interrupted', finished_at: at, error: 'Tiến trình dừng đột ngột (tắt máy, bị kill hoặc vượt thời gian) trước khi job hoàn tất' }, settings.retention.job_history);
    st.last_status = 'interrupted';
    st.last_finished_at = at;
    st.last_error = 'Bị gián đoạn — đã lên lịch chạy lại';
    st.consecutive_failures = (st.consecutive_failures || 0) + 1;
    st.next_due_at = at;
    st.running = null;
    recovered.push(name);
  }
  if (recovered.length) saveState(state);
  return recovered;
}

/**
 * Chạy job `name`. opts: { trigger: 'manual'|'schedule'|'daemon'|'actions'|'cli', settings, log, chained }
 * Trả về bản ghi lịch sử của lượt chạy.
 */
export async function runJob(name, opts = {}) {
  const settings = opts.settings || loadSettings();
  const trigger = opts.trigger || 'cli';
  const out = opts.log || ((m) => console.log(m));
  const jobFn = opts.jobFn || (await loadJob(name)); // jobFn: chỉ dùng trong kiểm thử
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${name}`;
  const maxMin = settings.scheduler.max_job_minutes;

  if (!opts.chained) recoverInterrupted(settings, out);
  const lockRes = opts.chained ? { ok: true, lock: opts.parentLock } : acquireLock({ job: name, run_id: runId, trigger }, maxMin);
  if (!lockRes.ok) {
    const entry = { id: runId, job: name, trigger, status: 'skipped', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), error: `Đang có job "${lockRes.held_by?.job || '?'}" chạy (PID ${lockRes.held_by?.pid || '?'}) — không chạy trùng.` };
    appendHistory(entry, settings.retention.job_history);
    out(entry.error);
    return entry;
  }
  if (lockRes.takeover) out(`Thu hồi khóa treo của job "${lockRes.takeover.job}" (PID ${lockRes.takeover.pid ?? '?'}).`);
  const lock = lockRes.lock;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${runId}.log`);
  const tail = [];
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString('vi-VN', { timeZone: settings.timezone, hour12: false })}] ${msg}`;
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch { /* bỏ qua */ }
    tail.push(line);
    if (tail.length > 60) tail.shift();
    out(msg);
  };

  const startedAt = new Date();
  let state = loadState();
  state.jobs[name].running = { run_id: runId, started_at: startedAt.toISOString(), pid: process.pid, host: os.hostname(), trigger };
  state.jobs[name].last_started_at = startedAt.toISOString();
  saveState(state);
  const entry = { id: runId, job: name, trigger, status: 'running', started_at: startedAt.toISOString(), host: os.hostname(), pid: process.pid, log_file: path.relative(process.cwd(), logFile) };
  appendHistory(entry, settings.retention.job_history);

  const ctrl = new AbortController();
  const beat = setInterval(() => heartbeat(lock), 30_000);
  const softTimer = setTimeout(() => { log(`! Vượt thời gian tối đa ${maxMin} phút → yêu cầu dừng job`); ctrl.abort(); }, maxMin * 60_000);
  let hardTimer;
  const hardTimeout = new Promise((_, reject) => { hardTimer = setTimeout(() => reject(Object.assign(new Error(`Job không dừng sau ${maxMin + 2} phút`), { hard: true })), (maxMin + 2) * 60_000); });
  hardTimeout.catch(() => {}); // tránh 'unhandled rejection' khi hết giờ lúc không có ai chờ

  const attempts = settings.scheduler.retry.attempts;
  let status = 'failed';
  let error = null;
  let result = null;
  let deferredUntil = null;
  let attempt = 0;
  log(`▶ Bắt đầu job "${name}" (kích hoạt: ${trigger}, lượt ${runId})`);
  try {
    for (attempt = 1; attempt <= attempts; attempt++) {
      try {
        result = await Promise.race([jobFn({ settings, log, signal: ctrl.signal, attempt, trigger }), hardTimeout]);
        status = 'success';
        error = null;
        break;
      } catch (err) {
        error = err.message || String(err);
        if (err instanceof RateLimitError) {
          status = 'deferred';
          deferredUntil = new Date(err.resetAt + 60_000).toISOString();
          log(`⏸ ${err.message} → hoãn tới ${deferredUntil}. Dữ liệu cũ được giữ nguyên.`);
          break;
        }
        if (isAuthError(err)) {
          status = 'failed';
          error = 'GITHUB_TOKEN không hợp lệ hoặc đã hết hạn (401). Dữ liệu cũ được giữ nguyên — tạo token mới hoặc xóa token để chạy chế độ không token.';
          log(`✖ ${error}`);
          break;
        }
        if (err.hard || ctrl.signal.aborted) { status = 'timeout'; log(`✖ ${error}`); break; }
        if (isBug(err)) { status = 'failed'; log(`✖ Lỗi chương trình: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`); break; }
        if (attempt < attempts) {
          const delay = settings.scheduler.retry.base_delay_seconds * 1000 * 2 ** (attempt - 1) * (0.85 + Math.random() * 0.3);
          log(`! Lỗi lần ${attempt}/${attempts}: ${error.slice(0, 200)} → thử lại sau ${Math.round(delay / 1000)} giây`);
          await sleepAbortable(delay, ctrl.signal);
          if (ctrl.signal.aborted) { status = 'timeout'; break; }
          continue;
        }
        status = 'failed';
        log(`✖ Thất bại sau ${attempts} lần: ${error.slice(0, 300)}`);
      }
    }

    // Xếp hạng lại ngay sau job làm thay đổi dữ liệu (không gọi mạng, vài giây)
    if (status === 'success' && !opts.chained && DATA_JOBS.has(name) && settings.scheduler.rank_after_data_jobs && settings.scheduler.jobs.rank.enabled) {
      log('↳ Xếp hạng lại sau khi dữ liệu thay đổi');
      const sub = await runJob('rank', { settings, trigger: `sau ${name}`, log: out, chained: true, parentLock: lock });
      entry.chained = { id: sub.id, status: sub.status, summary: sub.summary || null };
    }
  } finally {
    clearInterval(beat);
    clearTimeout(softTimer);
    clearTimeout(hardTimer);
    try { saveEtags(); } catch { /* bỏ qua */ }
    const finishedAt = new Date();
    state = loadState();
    const st = state.jobs[name];
    const interval = settings.scheduler.jobs[name].interval_hours * H;
    st.running = null;
    st.last_finished_at = finishedAt.toISOString();
    st.last_status = status;
    st.last_error = error;
    st.last_duration_ms = finishedAt - startedAt;
    st.last_run_id = runId;
    st.last_trigger = trigger;
    if (status === 'success') {
      st.last_success_at = finishedAt.toISOString();
      st.last_started_success_at = startedAt.toISOString();
      st.consecutive_failures = 0;
      st.deferred_until = null;
      st.next_due_at = new Date(startedAt.getTime() + interval).toISOString();
      st.last_summary = result?.summary || null;
      st.last_stats = result?.stats || null;
    } else if (status === 'deferred') {
      st.deferred_until = deferredUntil;
      st.next_due_at = deferredUntil;
    } else {
      st.consecutive_failures = (st.consecutive_failures || 0) + 1;
      const backoff = settings.scheduler.failure_backoff_minutes * 60_000 * 2 ** Math.min(st.consecutive_failures - 1, 6);
      st.next_due_at = new Date(finishedAt.getTime() + Math.min(interval, backoff)).toISOString();
    }
    saveState(state);
    Object.assign(entry, {
      status, finished_at: finishedAt.toISOString(), duration_ms: finishedAt - startedAt, attempts: attempt > attempts ? attempts : attempt,
      error, summary: result?.summary || null, stats: result?.stats || null, changed: Boolean(result?.changed), log_tail: tail.slice(-25),
      next_due_at: st.next_due_at,
    });
    appendHistory(entry, settings.retention.job_history);
    if (!opts.chained) releaseLock(lock);
    log(`■ Kết thúc job "${name}": ${status}${error && status !== 'success' ? ` — ${error.slice(0, 160)}` : ''} (${Math.round((finishedAt - startedAt) / 1000)} giây)`);
  }
  return entry;
}

/** Chạy lần lượt các job đến hạn (tối đa maxJobs). */
export async function runDue({ settings = loadSettings(), trigger = 'schedule', maxJobs = 3, log = (m) => console.log(m), only = null } = {}) {
  const { dueJobs } = await import('./state.mjs');
  recoverInterrupted(settings, log);
  const ran = [];
  for (let i = 0; i < maxJobs; i++) {
    const due = dueJobs(settings, loadState()).filter((j) => !only || only.includes(j.name)).filter((j) => !ran.some((r) => r.job === j.name));
    if (!due.length) break;
    const entry = await runJob(due[0].name, { settings, trigger, log });
    ran.push(entry);
    if (entry.status === 'skipped' || entry.status === 'deferred') break;
  }
  return ran;
}
