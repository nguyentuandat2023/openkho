#!/usr/bin/env node
// Kiểm tra mọi liên kết trên website: trang GitHub, link tải ZIP, link bản phát hành, link tài liệu/demo.
//   npm run check-links            → kiểm tra toàn bộ
//   npm run check-links -- --limit 50
// Kết quả lưu ở .cache/link-report.json. Mã thoát 1 nếu link GitHub/tải về bị hỏng.
import path from 'node:path';
import { ROOT, CACHE_DIR, readJson, writeJson, pMap, argv, sleep } from './lib/config.mjs';

const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'));
if (!lib) { console.error('Chạy `npm run data` trước.'); process.exit(1); }
const limit = Number(argv('limit', 0)) || Infinity;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; openkho-link-check/1.0)' };

async function check(url, { expectRedirectTo } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const manual = Boolean(expectRedirectTo);
      let r = await fetch(url, { method: 'HEAD', redirect: manual ? 'manual' : 'follow', headers: UA, signal: AbortSignal.timeout(25_000) });
      if (!manual && [403, 405, 501].includes(r.status)) r = await fetch(url, { method: 'GET', redirect: 'follow', headers: UA, signal: AbortSignal.timeout(25_000) });
      if (r.status === 429) { await sleep(Number(r.headers.get('retry-after') || 20) * 1000); continue; }
      if (manual) {
        const loc = r.headers.get('location') || '';
        return { ok: r.status >= 300 && r.status < 400 && loc.includes(expectRedirectTo), status: r.status, location: loc };
      }
      return { ok: r.status < 400, status: r.status, final: r.url };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: 0, error: e.cause?.code || e.message };
      await sleep(1500 * (attempt + 1));
    }
  }
  return { ok: false, status: 429 };
}

const repos = lib.repos.filter((r) => r.visible && r.synced).slice(0, limit);
const jobs = [];
for (const r of repos) {
  jobs.push({ repo: r.id, kind: 'github', url: r.links.github, critical: true });
  if (r.links.zip) jobs.push({ repo: r.id, kind: 'zip', url: r.links.zip, critical: true, expectRedirectTo: 'codeload.github.com' });
  if (r.links.release) jobs.push({ repo: r.id, kind: 'release', url: r.links.release, critical: true });
  if (r.links.zip_release) jobs.push({ repo: r.id, kind: 'zip_release', url: r.links.zip_release, critical: true, expectRedirectTo: 'codeload.github.com' });
  for (const k of ['docs', 'demo', 'video']) if (r.links[k]) jobs.push({ repo: r.id, kind: k, url: r.links[k], critical: false });
  for (const [os, a] of Object.entries(r.downloads_by_os || {})) jobs.push({ repo: r.id, kind: `asset-${os}`, url: a.url, critical: true, expectRedirectTo: 'objects.githubusercontent.com' });
}
console.log(`Kiểm tra ${jobs.length} liên kết của ${repos.length} dự án…`);
let done = 0;
const results = await pMap(jobs, async (j) => {
  const res = await check(j.url, { expectRedirectTo: j.expectRedirectTo });
  if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
  return { ...j, ...res };
}, 6);

const broken = results.filter((x) => !x.ok && x.critical);
const external = results.filter((x) => !x.ok && !x.critical);
const byKind = {};
for (const x of results) {
  byKind[x.kind] ||= { total: 0, ok: 0 };
  byKind[x.kind].total++;
  if (x.ok) byKind[x.kind].ok++;
}
writeJson(path.join(CACHE_DIR, 'link-report.json'), { checked_at: new Date().toISOString(), byKind, broken, external });
console.log('\nKết quả theo loại liên kết:');
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(12)} ${v.ok}/${v.total} hoạt động`);
if (broken.length) {
  console.log(`\n✖ ${broken.length} liên kết GitHub/tải về hỏng:`);
  for (const b of broken) console.log(`  ${b.repo} [${b.kind}] ${b.status} ${b.url}${b.location ? ` → ${b.location}` : ''}`);
}
if (external.length) {
  console.log(`\n⚠ ${external.length} liên kết tài liệu/demo bên ngoài không phản hồi (có thể do website chặn trình kiểm tra tự động):`);
  for (const b of external) console.log(`  ${b.repo} [${b.kind}] ${b.status || b.error} ${b.url}`);
}
console.log(broken.length ? '' : '\n✔ Toàn bộ liên kết GitHub và link tải về hoạt động.');
process.exit(broken.length ? 1 : 0);
