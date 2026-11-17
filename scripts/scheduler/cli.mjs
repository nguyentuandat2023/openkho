#!/usr/bin/env node
// Điều khiển bộ lập lịch từ dòng lệnh (npm run jobs -- <lệnh>):
//   status                 Trạng thái từng job, khóa, daemon, lần chạy tới
//   due                    Liệt kê job đến hạn (mã thoát 0 = có job đến hạn, 10 = không có)
//   run <job>              Chạy ngay một job (discover | refresh | rank | reevaluate | cleanup | ai_analyze)
//   run-due [--max-jobs N] Chạy các job đến hạn (dùng cho GitHub Actions / cron)
//   history [--limit N]    Lịch sử các lượt chạy
//   unlock [--force]       Gỡ khóa treo
// Tùy chọn chung: --trigger <tên> (ghi vào lịch sử), --json (xuất JSON)
import { argv } from '../lib/config.mjs';
import { loadSettings, JOB_NAMES, JOB_LABELS } from '../lib/settings.mjs';
import { loadState, loadHistory, dueInfo, dueJobs, lockStatus, forceUnlock, daemonStatus } from '../lib/scheduler/state.mjs';
import { runJob, runDue, recoverInterrupted } from '../lib/scheduler/runner.mjs';

const cmd = process.argv[2] || 'status';
const json = Boolean(argv('json'));
const settings = loadSettings();
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: settings.timezone, hour12: false }) : '—');

switch (cmd) {
  case 'status': {
    recoverInterrupted(settings, console.log);
    const state = loadState();
    const lk = lockStatus(settings.scheduler.max_job_minutes);
    const dm = daemonStatus();
    const rows = JOB_NAMES.map((n) => {
      const st = state.jobs[n];
      const d = dueInfo(n, settings, state);
      return { job: n, label: JOB_LABELS[n], enabled: settings.scheduler.jobs[n].enabled, interval_hours: settings.scheduler.jobs[n].interval_hours, last_status: st.last_status || null, last_success_at: st.last_success_at || null, next_at: d.next_at || null, due: d.due, note: d.reason, failures: st.consecutive_failures || 0 };
    });
    if (json) { console.log(JSON.stringify({ scheduler_enabled: settings.scheduler.enabled, lock: lk, daemon: dm, jobs: rows }, null, 1)); break; }
    console.log(`Bộ lập lịch: ${settings.scheduler.enabled ? 'BẬT' : 'TẮT'} · múi giờ ${settings.timezone}`);
    console.log(`Daemon: ${dm.running ? `đang chạy (PID ${dm.pid}, heartbeat ${fmt(dm.heartbeat_at)})` : 'không chạy'}`);
    console.log(`Khóa: ${lk.held ? `${lk.lock?.job} (PID ${lk.lock?.pid}, ${lk.age_min} phút${lk.stale ? ', TREO' : ''})` : 'trống'}`);
    for (const r of rows) {
      console.log(`- ${r.job.padEnd(11)} ${r.enabled ? '' : '[tắt] '}mỗi ${r.interval_hours} giờ · lần cuối: ${r.last_status || 'chưa chạy'} · thành công: ${fmt(r.last_success_at)} · tiếp theo: ${fmt(r.next_at)}${r.due ? ' (ĐẾN HẠN)' : ''}${r.failures ? ` · lỗi liên tiếp ${r.failures}` : ''}`);
    }
    break;
  }
  case 'due': {
    const due = dueJobs(settings, loadState());
    if (json) console.log(JSON.stringify(due));
    else console.log(due.length ? `Đến hạn: ${due.map((d) => d.name).join(', ')}` : 'Không có job đến hạn');
    process.exitCode = due.length ? 0 : 10;
    break;
  }
  case 'run': {
    const name = process.argv[3];
    if (!JOB_NAMES.includes(name)) { console.error(`Cần tên job: ${JOB_NAMES.join(' | ')}`); process.exit(1); }
    const entry = await runJob(name, { settings, trigger: argv('trigger', 'cli') });
    if (json) console.log(JSON.stringify(entry));
    process.exitCode = entry.status === 'success' ? 0 : entry.status === 'skipped' ? 4 : entry.status === 'deferred' ? 2 : 1;
    break;
  }
  case 'run-due': {
    const only = argv('only') && argv('only') !== true ? String(argv('only')).split(',') : null;
    const ran = await runDue({ settings, trigger: argv('trigger', 'schedule'), maxJobs: Number(argv('max-jobs', 3)), only });
    console.log(ran.length ? `Đã chạy: ${ran.map((r) => `${r.job}=${r.status}`).join(', ')}` : 'Không có job đến hạn.');
    if (json) console.log(JSON.stringify(ran.map(({ id, job, status, changed, summary }) => ({ id, job, status, changed, summary }))));
    process.exitCode = ran.some((r) => r.status === 'failed' || r.status === 'timeout') ? 1 : 0;
    break;
  }
  case 'history': {
    const runs = loadHistory().runs.slice(-Number(argv('limit', 20))).reverse();
    if (json) { console.log(JSON.stringify(runs, null, 1)); break; }
    for (const r of runs) console.log(`${fmt(r.started_at)}  ${r.job.padEnd(11)} ${String(r.status).padEnd(11)} ${r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : ''}  ${r.summary || r.error || ''}`.trimEnd());
    break;
  }
  case 'unlock': {
    const res = forceUnlock(Boolean(argv('force')), settings.scheduler.max_job_minutes);
    console.log(res.message);
    process.exitCode = res.ok ? 0 : 1;
    break;
  }
  default:
    console.error(`Lệnh không hợp lệ: ${cmd}. Dùng: status | due | run <job> | run-due | history | unlock`);
    process.exitCode = 1;
}
