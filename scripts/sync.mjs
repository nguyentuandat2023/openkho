#!/usr/bin/env node
// Đồng bộ số liệu thật từ GitHub cho toàn bộ (hoặc một phần) catalog.
//   npm run sync                         → tất cả repo
//   npm run sync -- --only owner/repo    → một/vài repo (phân tách bằng dấu phẩy)
//   npm run sync -- --mode lite|full     → ép chế độ (mặc định: full nếu có GITHUB_TOKEN)
//   npm run sync -- --max-age 12         → bỏ qua repo vừa đồng bộ trong 12 giờ qua
//   npm run sync -- --fix-renames        → tự sửa tên repo trong catalog khi repo đã đổi tên
//   npm run sync -- --contributors-only [--loop]  → chỉ bổ sung số người đóng góp (dùng khi không có token)
//   npm run sync -- --force              → bỏ qua cache ETag
// Lịch tự động (khám phá repo mới, xếp hạng xu hướng…) xem `npm run jobs` và docs/04-HE-THONG-TU-DONG.md.
import { loadCatalog, validate } from './lib/catalog.mjs';
import { fetchContributors } from './lib/github.mjs';
import { fetchRateLimit, rateState, saveEtags, RateLimitError } from './lib/http.mjs';
import { argv, githubToken, readJson, writeJson, repoDataFile, sleep } from './lib/config.mjs';
import { syncCatalog } from './lib/sync-catalog.mjs';
import { buildData } from './build-data.mjs';

const log = (...a) => console.log(...a);

const v = validate();
if (v.errors.length) {
  console.error('Catalog có lỗi, hãy sửa trước khi đồng bộ:\n - ' + v.errors.join('\n - '));
  process.exit(1);
}

const catalog = loadCatalog();
const only = argv('only');
const onlyList = only && only !== true ? String(only).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (onlyList) {
  const known = new Set(catalog.map((e) => e.repo.toLowerCase()));
  const unknown = onlyList.filter((x) => !known.has(x.toLowerCase()));
  if (unknown.length === onlyList.length) {
    console.error(`Không thấy ${only} trong catalog. Thêm repo trước (npm run add -- owner/repo --category <slug>).`);
    process.exit(1);
  }
}

if (argv('contributors-only')) {
  const ids = catalog.map((e) => e.repo).filter((id) => !onlyList || onlyList.some((x) => x.toLowerCase() === id.toLowerCase()));
  await contributorsOnly(ids, new Map(ids.map((id) => [id, readJson(repoDataFile(id))])), Boolean(argv('loop')));
  process.exit(0);
}

const forced = argv('mode');
const mode = forced === 'lite' || forced === 'full' ? forced : githubToken() ? 'full' : 'lite';
if (mode === 'full' && !githubToken()) {
  console.error('Chế độ full cần GITHUB_TOKEN (đặt trong .env.local hoặc biến môi trường).');
  process.exit(1);
}

let report;
try {
  report = await syncCatalog({ only: onlyList, mode, force: Boolean(argv('force')), fixRenames: Boolean(argv('fix-renames')), maxAgeH: Number(argv('max-age', 0)), log });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.error(`\n${err.message}. Dữ liệu cũ được giữ nguyên. Thêm GITHUB_TOKEN để có 5.000 lượt/giờ.`);
    process.exit(2);
  }
  if (/\b401\b|Bad credentials/i.test(err.message)) {
    console.error('\nGITHUB_TOKEN không hợp lệ hoặc đã hết hạn. Dữ liệu cũ được giữ nguyên.\n' +
      'Tạo token mới (docs/03-HUONG-DAN-TRIEN-KHAI.md, mục 2) hoặc xóa dòng GITHUB_TOKEN trong .env.local để chạy chế độ không token.');
    process.exit(3);
  }
  throw err;
}

if (report.renamed.length) log(`Đổi tên: ${report.renamed.map((x) => `${x.from} → ${x.to}`).join(', ')}${argv('fix-renames') ? '' : ' (chạy lại với --fix-renames để tự sửa catalog)'}`);
if (report.deleted.length) log(`Không còn tồn tại: ${report.deleted.map((x) => x.id).join(', ')}`);
if (report.unverified.length) log(`Chưa kiểm tra được: ${report.unverified.length} repo (giữ dữ liệu cũ)`);

if (!argv('no-build')) {
  const s = await buildData({ quiet: true });
  log(`Đã tạo dữ liệu website: ${s.repos} repo, ${s.categories} danh mục.`);
}

async function contributorsOnly(list, prev, loop) {
  for (;;) {
    await fetchRateLimit().catch(() => null);
    const todo = list.filter((id) => prev.get(id)?.meta && !prev.get(id)?.contributors?.anon);
    if (!todo.length) { log('Tất cả repo đã có số người đóng góp.'); break; }
    const budget = Math.max(0, (rateState.core?.remaining ?? 0) - 2);
    log(`Còn ${todo.length} repo thiếu số người đóng góp · hạn mức core còn ${rateState.core?.remaining}`);
    let n = 0;
    for (const id of todo.slice(0, budget)) {
      const d = prev.get(id);
      try {
        const c = await fetchContributors(d.full_name);
        if (c && c !== 'not-modified') {
          d.contributors = c;
          writeJson(repoDataFile(id), d);
          n++;
        }
      } catch (err) {
        if (err instanceof RateLimitError) break;
      }
    }
    saveEtags();
    log(`  +${n} repo`);
    if (n) await buildData({ quiet: true });
    if (!loop) break;
    const wait = Math.max((rateState.core?.reset || Date.now() + 3600000) - Date.now() + 5000, 60000);
    log(`  Chờ ${Math.round(wait / 60000)} phút tới lượt hạn mức mới…`);
    await sleep(wait);
  }
}
