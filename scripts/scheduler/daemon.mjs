#!/usr/bin/env node
// Daemon lập lịch chạy nền trên máy chủ/máy tính (npm run scheduler). KHÔNG chạy trên trình duyệt.
//   - Mỗi phút: đọc lại cấu hình (đổi lịch ở trang quản trị có hiệu lực ngay), tìm job đến hạn.
//   - Mỗi job chạy trong TIẾN TRÌNH CON riêng (cli.mjs run-due) → bị treo thì kill được, lỗi không làm sập daemon.
//   - Khóa toàn cục trong tiến trình con đảm bảo không chạy trùng (kể cả khi bấm chạy tay ở trang quản trị).
//   - Khởi động lại sau sự cố: lượt chạy dở được đánh dấu "bị gián đoạn" và tự chạy lại.
//   - Sau job làm thay đổi dữ liệu: dựng lại dữ liệu website (site_rebuild = data) hoặc cả website (full).
// Tùy chọn: --once (chạy một vòng rồi thoát) · --no-rebuild
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, argv, writeJson } from '../lib/config.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { loadState, loadHistory, dueJobs, lockStatus, DAEMON_FILE } from '../lib/scheduler/state.mjs';
import { recoverInterrupted } from '../lib/scheduler/runner.mjs';

const once = Boolean(argv('once'));
const noRebuild = Boolean(argv('no-rebuild'));
const startedAt = new Date().toISOString();
let stopping = false;
let child = null;
let lastRebuildRun = null;
const log = (m) => console.log(`[${new Date().toLocaleString('vi-VN', { hour12: false })}] ${m}`);

// Chỉ một daemon trên mỗi máy
const existing = (() => { try { return JSON.parse(fs.readFileSync(DAEMON_FILE, 'utf8')); } catch { return null; } })();
if (existing && existing.host === os.hostname() && existing.pid !== process.pid) {
  let alive = false;
  try { process.kill(existing.pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
  if (alive && Date.now() - Date.parse(existing.heartbeat_at || 0) < 3 * 60_000) {
    console.error(`Daemon khác đang chạy (PID ${existing.pid}). Thoát để không chạy trùng.`);
    process.exit(4);
  }
}

function beat(extra = {}) {
  writeJson(DAEMON_FILE, { pid: process.pid, host: os.hostname(), started_at: startedAt, heartbeat_at: new Date().toISOString(), current: child ? child.job : null, ...extra }, false);
}

function runChild(args, label, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child = { proc: p, job: label };
    beat();
    p.stdout.on('data', (d) => process.stdout.write(d));
    p.stderr.on('data', (d) => process.stderr.write(d));
    const timer = setTimeout(() => {
      log(`! ${label} vượt ${Math.round(timeoutMs / 60000)} phút → dừng tiến trình con`);
      p.kill();
      setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* đã dừng */ } }, 10_000);
    }, timeoutMs);
    p.on('close', (code) => { clearTimeout(timer); child = null; beat(); resolve(code); });
  });
}

async function rebuild(mode) {
  if (mode === 'off' || noRebuild) return;
  if (mode === 'data') {
    log('Dựng lại dữ liệu website (build-data)…');
    await runChild([path.join(ROOT, 'scripts', 'build-data.mjs')], 'build-data', 10 * 60_000);
    return;
  }
  log('Dựng lại website (npm run build)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await new Promise((resolve) => {
    const p = spawn(npm, ['run', 'build'], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', windowsHide: true });
    child = { proc: p, job: 'build' };
    let tailOut = '';
    p.stdout.on('data', (d) => { tailOut = (tailOut + d).slice(-2000); });
    p.stderr.on('data', (d) => { tailOut = (tailOut + d).slice(-2000); });
    const timer = setTimeout(() => p.kill(), 20 * 60_000);
    p.on('close', (code) => { clearTimeout(timer); child = null; log(code === 0 ? 'Website đã được dựng lại.' : `! Dựng website thất bại (mã ${code}). Website cũ vẫn giữ nguyên nếu có.\n${tailOut}`); resolve(); });
  });
}

async function tick() {
  const settings = loadSettings();
  beat();
  recoverInterrupted(settings, log);
  if (!settings.scheduler.enabled) return;
  const due = dueJobs(settings, loadState());
  if (!due.length) return;
  const lk = lockStatus(settings.scheduler.max_job_minutes);
  if (lk.held && !lk.stale) { log(`Job "${lk.lock?.job}" đang chạy (tiến trình khác) → chờ lượt sau.`); return; }
  const before = loadHistory().runs.length ? loadHistory().runs[loadHistory().runs.length - 1].id : null;
  log(`Đến hạn: ${due.map((d) => d.name).join(', ')}`);
  await runChild([path.join(ROOT, 'scripts', 'scheduler', 'cli.mjs'), 'run-due', '--trigger', 'daemon', '--max-jobs', '1'], due[0].name, (settings.scheduler.max_job_minutes + 5) * 60_000);
  const runs = loadHistory().runs;
  const idx = before ? runs.findIndex((r) => r.id === before) : -1;
  const fresh = runs.slice(idx + 1);
  const changed = fresh.some((r) => r.status === 'success' && (r.changed || r.chained));
  if (changed && fresh[fresh.length - 1]?.id !== lastRebuildRun) {
    lastRebuildRun = fresh[fresh.length - 1]?.id;
    await rebuild(settings.scheduler.site_rebuild);
  }
}

function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log(`Nhận ${sig} → dừng daemon${child ? ` (chờ tiến trình "${child.job}" kết thúc, tối đa 60 giây)` : ''}`);
  const finish = () => { try { fs.rmSync(DAEMON_FILE, { force: true }); } catch { /* bỏ qua */ } process.exit(0); };
  if (!child) return finish();
  const t = setTimeout(() => { try { child?.proc.kill(); } catch { /* bỏ qua */ } finish(); }, 60_000);
  child.proc.on('close', () => { clearTimeout(t); finish(); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log(`Daemon lập lịch khởi động (PID ${process.pid}). Cấu hình: data/settings.json · Trạng thái: npm run jobs -- status`);
const recovered = recoverInterrupted(loadSettings(), log);
if (recovered.length) log(`Đã khôi phục ${recovered.length} lượt chạy bị gián đoạn: ${recovered.join(', ')}`);
beat();
const hb = setInterval(() => beat(), 30_000);
for (;;) {
  try { await tick(); } catch (err) { log(`! Lỗi vòng lập lịch: ${err.message}`); }
  if (once || stopping) break;
  await new Promise((r) => setTimeout(r, 60_000));
}
clearInterval(hb);
if (once) { try { fs.rmSync(DAEMON_FILE, { force: true }); } catch { /* bỏ qua */ } }
