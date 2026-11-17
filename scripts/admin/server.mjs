#!/usr/bin/env node
// Trang Quản trị chạy trên máy cá nhân: npm run admin → http://localhost:4321
// Thêm/sửa/xóa repo và danh mục (ghi vào data/*.yaml), chạy đồng bộ GitHub, build website, khám phá ứng viên,
// điều khiển hệ thống tự động (lịch chạy, trọng số xếp hạng, radar, ẩn/ghim/loại trừ, kiểm tra trước xuất bản).
// Bảo mật: mặc định chỉ lắng nghe 127.0.0.1; mọi thao tác ghi yêu cầu header X-OpenKho-Admin và Origin đúng địa chỉ trang.
// Đặt ADMIN_PASSWORD (.env.local) để bắt buộc đăng nhập; bắt buộc khi mở ra mạng bằng ADMIN_HOST.
// Mọi thao tác thay đổi dữ liệu được ghi vào data/admin-actions.ndjson.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, readJson, githubToken, repoDataFile, SYNC_REPORT_FILE, CANDIDATES_FILE } from '../lib/config.mjs';
import { loadCatalog, loadCategories, saveCategories, addEntry, updateEntry, removeEntry, moveEntry, findEntry, validate, ENUMS, EDITORIAL_FIELDS } from '../lib/catalog.mjs';
import { lookupRepo, discover, dismissCandidate, DISCOVERY_PRESETS } from '../lib/discover.mjs';
import { fetchRateLimit, rateState } from '../lib/http.mjs';
import { buildData } from '../build-data.mjs';
import { createAuth, isLoopback } from './auth.mjs';
import { dashboard, radarList, moderate, moderationState, prepublish, settingsPayload } from './automation.mjs';
import { patchSettings, JOB_NAMES } from '../lib/settings.mjs';
import { forceUnlock, LOG_DIR } from '../lib/scheduler/state.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { logAdminAction, loadRadar } from '../lib/radar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.ADMIN_PORT || 4321);
const HOST = process.env.ADMIN_HOST || '127.0.0.1';
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, ...(process.env.ADMIN_ORIGIN ? [process.env.ADMIN_ORIGIN] : [])]);
const auth = createAuth();
if (!isLoopback(HOST) && !auth.required) {
  console.error(`Từ chối khởi động: ADMIN_HOST=${HOST} mở trang quản trị ra mạng nhưng chưa đặt ADMIN_PASSWORD. Đặt ADMIN_PASSWORD trong .env.local (không commit) rồi chạy lại.`);
  process.exit(1);
}
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const jobs = new Map();
let jobSeq = 0;

function json(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(JSON.stringify(data));
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length > 200_000) throw new Error('Dữ liệu gửi lên quá lớn');
  return text ? JSON.parse(text) : {};
}

function startJob(label, args) {
  for (const j of jobs.values()) if (j.status === 'running') throw new Error(`Đang chạy "${j.label}" — đợi xong rồi thử lại.`);
  const id = String(++jobSeq);
  const job = { id, label, status: 'running', log: [], startedAt: new Date().toISOString(), listeners: new Set() };
  const proc = spawn(args[0], args.slice(1), { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' }, shell: process.platform === 'win32' && args[0] === 'npm' });
  const push = (line) => {
    job.log.push(line);
    if (job.log.length > 2000) job.log.shift();
    for (const l of job.listeners) l.write(`data: ${JSON.stringify(line)}\n\n`);
  };
  const onData = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(push);
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('close', (code) => {
    job.status = code === 0 ? 'done' : 'failed';
    job.finishedAt = new Date().toISOString();
    push(code === 0 ? '✔ Hoàn tất.' : `✖ Kết thúc với mã lỗi ${code}.`);
    for (const l of job.listeners) { l.write(`event: end\ndata: ${JSON.stringify(job.status)}\n\n`); l.end(); }
  });
  jobs.set(id, job);
  return job;
}

function state() {
  const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'), null);
  const byKey = new Map((lib?.repos || []).map((r) => [r.key.toLowerCase(), r]));
  const entries = loadCatalog().map((e) => {
    const r = byKey.get(e.repo.toLowerCase());
    const raw = readJson(repoDataFile(e.repo));
    const out = { category: e.category };
    for (const k of ['repo', ...EDITORIAL_FIELDS]) if (e[k] !== undefined) out[k] = e[k];
    return {
      ...out,
      live: r ? {
        full_name: r.full_name, path: r.path, status: r.status, score: r.score ? Math.round(r.score.total) : null, tier: r.score?.tier || null,
        stars: r.stats?.stars ?? null, license: r.license.display, fetched_at: r.fetched_at, flags: (r.score?.flags || []).map((f) => f.key),
        description: r.description, avatar: r.avatar_url,
      } : raw ? { status: raw.status, fetched_at: raw.fetched_at } : null,
    };
  });
  return {
    token: Boolean(githubToken()),
    rate: rateState,
    categories: loadCategories(),
    entries,
    enums: ENUMS,
    report: readJson(SYNC_REPORT_FILE, null),
    library: lib ? { generated_at: lib.generated_at, synced_at: lib.synced_at, stats: lib.stats } : null,
    candidates: readJson(CANDIDATES_FILE, { items: [] }).items.slice(0, 200),
    presets: DISCOVERY_PRESETS,
    built: fs.existsSync(path.join(ROOT, 'out', 'index.html')) ? fs.statSync(path.join(ROOT, 'out', 'index.html')).mtime.toISOString() : null,
    jobs: [...jobs.values()].map(({ id, label, status, startedAt, finishedAt }) => ({ id, label, status, startedAt, finishedAt })).reverse().slice(0, 10),
  };
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function route(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  if (m !== 'GET') {
    const origin = req.headers.origin;
    if (req.headers['x-openkho-admin'] !== '1' || (origin && !ORIGINS.has(origin))) return json(res, 403, { error: 'Yêu cầu không hợp lệ' });
  }
  if (m === 'GET' && (p === '/' || p === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    return res.end(fs.readFileSync(path.join(HERE, 'index.html')));
  }
  if (m === 'GET' && p === '/favicon.ico') { res.writeHead(204, SECURITY_HEADERS); return res.end(); }
  if (m === 'GET' && p === '/api/session') return json(res, 200, { required: auth.required, ok: auth.ok(req) });
  if (m === 'POST' && p === '/api/login') {
    const b = await body(req);
    const r = auth.login(req, b.password);
    if (!r.ok) { logAdminAction('login_failed', req.socket?.remoteAddress || '', {}, 'unknown'); return json(res, r.status, { error: r.error }); }
    logAdminAction('login', req.socket?.remoteAddress || '', {});
    return json(res, 200, { ok: true }, r.cookie ? { 'Set-Cookie': r.cookie } : {});
  }
  if (m === 'POST' && p === '/api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': auth.logoutCookie() });
  if (p.startsWith('/api/') && !auth.ok(req)) return json(res, 401, { error: 'Cần đăng nhập', login: true });
  if (m === 'GET' && p === '/api/state') {
    await fetchRateLimit().catch(() => null);
    return json(res, 200, state());
  }
  if (m === 'GET' && p === '/api/lookup') {
    return json(res, 200, await lookupRepo(url.searchParams.get('repo')));
  }
  if (m === 'POST' && p === '/api/repos') {
    const b = await body(req);
    const info = await lookupRepo(b.repo);
    if (!info.ok) return json(res, 400, { error: info.error });
    if (info.exists) return json(res, 409, { error: `${info.repo.full_name} đã có trong thư viện` });
    if (!loadCategories().some((c) => c.slug === b.category)) return json(res, 400, { error: 'Chọn danh mục chính' });
    addEntry(b.category, info.repo.full_name, b.fields || {});
    logAdminAction('repo_add', info.repo.full_name, { category: b.category });
    const v = validate();
    if (v.errors.length) {
      removeEntry(info.repo.full_name);
      return json(res, 400, { error: `Dữ liệu chưa hợp lệ: ${v.errors.join('; ')}` });
    }
    const job = startJob(`Đồng bộ ${info.repo.full_name}`, [process.execPath, 'scripts/sync.mjs', '--only', info.repo.full_name]);
    return json(res, 200, { ok: true, repo: info.repo.full_name, job: job.id });
  }
  const repoMatch = p.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
  if (repoMatch) {
    const id = `${decodeURIComponent(repoMatch[1])}/${decodeURIComponent(repoMatch[2])}`;
    const entry = findEntry(id);
    if (!entry) return json(res, 404, { error: `Không có ${id} trong thư viện` });
    if (m === 'PUT') {
      const b = await body(req);
      const before = JSON.stringify(entry);
      if (b.category && b.category !== entry.category) moveEntry(id, b.category);
      updateEntry(id, b.fields || {}, { replace: true });
      logAdminAction('repo_update', id, { category: b.category || entry.category, fields: Object.keys(b.fields || {}) });
      const v = validate();
      if (v.errors.length) return json(res, 400, { error: `Đã lưu nhưng còn lỗi: ${v.errors.join('; ')}`, before });
      await buildData({ quiet: true });
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      removeEntry(id);
      fs.rmSync(repoDataFile(id), { force: true });
      logAdminAction('repo_delete', id, {});
      await buildData({ quiet: true });
      return json(res, 200, { ok: true });
    }
  }
  if (m === 'POST' && p === '/api/categories') {
    const b = await body(req);
    if (!SLUG_RE.test(b.slug || '')) return json(res, 400, { error: 'Slug chỉ gồm chữ thường không dấu, số và gạch ngang (vd. ai-video)' });
    if (!b.name?.trim()) return json(res, 400, { error: 'Cần tên danh mục' });
    const list = loadCategories();
    const item = { slug: b.slug, name: b.name.trim(), short: (b.short || b.name).trim(), description: (b.description || '').trim(), icon: b.icon || 'sparkles', hue: Number(b.hue) || 210 };
    const i = list.findIndex((c) => c.slug === b.slug);
    if (i >= 0) list[i] = { ...list[i], ...item };
    else list.push(item);
    saveCategories(list);
    logAdminAction(i >= 0 ? 'category_update' : 'category_add', b.slug, { name: item.name });
    await buildData({ quiet: true });
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/categories/reorder') {
    const { slugs } = await body(req);
    const list = loadCategories();
    const sorted = slugs.map((s) => list.find((c) => c.slug === s)).filter(Boolean);
    if (sorted.length !== list.length) return json(res, 400, { error: 'Danh sách không khớp' });
    saveCategories(sorted);
    await buildData({ quiet: true });
    return json(res, 200, { ok: true });
  }
  const catDel = p.match(/^\/api\/categories\/([a-z0-9-]+)$/);
  if (m === 'DELETE' && catDel) {
    const slug = catDel[1];
    const used = loadCatalog().filter((e) => e.category === slug || (e.also || []).includes(slug));
    if (used.length) return json(res, 400, { error: `Danh mục còn ${used.length} repo — chuyển hoặc xóa các repo trước.` });
    saveCategories(loadCategories().filter((c) => c.slug !== slug));
    logAdminAction('category_delete', slug, {});
    const file = path.join(ROOT, 'data', 'catalog', `${slug}.yaml`);
    if (fs.existsSync(file)) fs.rmSync(file);
    await buildData({ quiet: true });
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/jobs/sync') {
    const b = await body(req);
    const args = [process.execPath, 'scripts/sync.mjs'];
    if (b.only) args.push('--only', String(b.only));
    if (b.fixRenames) args.push('--fix-renames');
    return json(res, 200, { job: startJob(b.only ? `Đồng bộ ${b.only}` : 'Đồng bộ toàn bộ thư viện', args).id });
  }
  if (m === 'POST' && p === '/api/jobs/build') {
    return json(res, 200, { job: startJob('Build website', ['npm', 'run', 'build']).id });
  }
  if (m === 'POST' && p === '/api/jobs/validate') {
    return json(res, 200, validate());
  }
  const jobMatch = p.match(/^\/api\/jobs\/(\d+)(\/stream)?$/);
  if (m === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) return json(res, 404, { error: 'Không có tác vụ' });
    if (!jobMatch[2]) return json(res, 200, { id: job.id, label: job.label, status: job.status, log: job.log });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    for (const line of job.log) res.write(`data: ${JSON.stringify(line)}\n\n`);
    if (job.status !== 'running') { res.write(`event: end\ndata: ${JSON.stringify(job.status)}\n\n`); return res.end(); }
    job.listeners.add(res);
    req.on('close', () => job.listeners.delete(res));
    return;
  }
  // ---------------- Hệ thống tự động
  if (m === 'GET' && p === '/api/dashboard') {
    await fetchRateLimit().catch(() => null);
    return json(res, 200, dashboard(rateState));
  }
  if (m === 'GET' && p === '/api/settings') return json(res, 200, settingsPayload());
  if (m === 'PUT' && p === '/api/settings') {
    const b = await body(req);
    const before = loadSettings();
    const r = patchSettings(b.patch || {});
    logAdminAction('settings_update', 'settings', { patch: b.patch, before_weights: before.trending.weights, after_weights: r.settings.trending.weights });
    return json(res, 200, { ok: true, settings: r.settings, warnings: r.warnings });
  }
  if (m === 'POST' && p === '/api/jobs/run') {
    const b = await body(req);
    if (!JOB_NAMES.includes(b.job)) return json(res, 400, { error: 'Job không hợp lệ' });
    logAdminAction('job_run', b.job, {});
    const job = startJob(`Chạy job ${b.job}`, [process.execPath, 'scripts/scheduler/cli.mjs', 'run', b.job, '--trigger', 'manual']);
    return json(res, 200, { job: job.id });
  }
  if (m === 'POST' && p === '/api/jobs/run-due') {
    logAdminAction('job_run_due', 'scheduler', {});
    return json(res, 200, { job: startJob('Chạy các job đến hạn', [process.execPath, 'scripts/scheduler/cli.mjs', 'run-due', '--trigger', 'manual']).id });
  }
  if (m === 'POST' && p === '/api/scheduler/unlock') {
    const b = await body(req);
    const r = forceUnlock(Boolean(b.force), loadSettings().scheduler.max_job_minutes);
    if (r.ok) logAdminAction('scheduler_unlock', r.lock?.job || '-', { force: Boolean(b.force) });
    return json(res, r.ok ? 200 : 409, r.ok ? r : { error: r.message });
  }
  const logMatch = p.match(/^\/api\/run-log\/([0-9A-Za-z_-]+)$/);
  if (m === 'GET' && logMatch) {
    const file = path.join(LOG_DIR, `${logMatch[1]}.log`);
    if (!fs.existsSync(file)) return json(res, 404, { error: 'Không có nhật ký (đã dọn hoặc chạy trên máy khác)' });
    return json(res, 200, { lines: fs.readFileSync(file, 'utf8').split('\n').slice(-400) });
  }
  if (m === 'GET' && p === '/api/radar') {
    const sp = url.searchParams;
    return json(res, 200, radarList({ q: sp.get('q') || '', filter: sp.get('filter') || 'all', sort: sp.get('sort') || 't7', page: Math.max(1, Number(sp.get('page')) || 1) }));
  }
  if (m === 'GET' && p === '/api/moderation') return json(res, 200, moderationState());
  if (m === 'POST' && p === '/api/moderation') {
    const b = await body(req);
    moderate({ action: String(b.action), target: String(b.target || ''), reason: String(b.reason || '') });
    await buildData({ quiet: true });
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/radar/promote') {
    const b = await body(req);
    const rr = loadRadar().repos[String(b.gid)];
    if (!rr) return json(res, 404, { error: 'Không có repo này trong radar' });
    if (!loadCategories().some((c) => c.slug === b.category)) return json(res, 400, { error: 'Chọn danh mục chính' });
    if (findEntry(rr.full_name)) return json(res, 409, { error: `${rr.full_name} đã có trong thư viện` });
    addEntry(b.category, rr.full_name, {});
    logAdminAction('radar_promote', rr.full_name, { gid: rr.github_id, category: b.category });
    const job = startJob(`Đồng bộ ${rr.full_name}`, [process.execPath, 'scripts/sync.mjs', '--only', rr.full_name]);
    return json(res, 200, { ok: true, job: job.id });
  }
  if (m === 'GET' && p === '/api/prepublish') return json(res, 200, prepublish());
  if (m === 'POST' && p === '/api/publish/build') {
    const pre = prepublish();
    if (!pre.ok) return json(res, 409, { error: 'Kiểm tra trước xuất bản chưa đạt — xem tab Kiểm tra.', checks: pre.checks });
    logAdminAction('site_build', 'website', {});
    return json(res, 200, { job: startJob('Build website (đã qua kiểm tra)', ['npm', 'run', 'build']).id });
  }

  if (m === 'POST' && p === '/api/discover') {
    const b = await body(req);
    return json(res, 200, { items: await discover(String(b.query || '').slice(0, 256)) });
  }
  if (m === 'POST' && p === '/api/candidates/dismiss') {
    const b = await body(req);
    dismissCandidate(String(b.full_name));
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Không tìm thấy' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    await route(req, res, url);
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
}).listen(PORT, HOST, () => {
  console.log(`Trang Quản trị: http://${isLoopback(HOST) ? 'localhost' : HOST}:${PORT}  (${isLoopback(HOST) ? 'chỉ truy cập được từ máy này' : 'mở ra mạng — bắt buộc đăng nhập'}${auth.required ? ', có mật khẩu' : ''} · Ctrl+C để dừng)`);
});
