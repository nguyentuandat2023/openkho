#!/usr/bin/env node
// Kiểm thử đầu-cuối trên bản build tĩnh (cần `npm run build`).
// Tự khởi động máy chủ tĩnh, mở Chrome/Edge có sẵn trên máy (playwright-core) và kiểm tra các chức năng chính.
//   npm run test:e2e            → chạy đầy đủ
//   npm run test:e2e -- --all   → kiểm tra tràn ngang trên TẤT CẢ trang repo (chậm hơn)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, argv, readJson } from '../lib/config.mjs';
import { findBrowser } from './browser.mjs';

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;
const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'));
if (!lib || !fs.existsSync(path.join(ROOT, 'out', 'index.html'))) {
  console.error('Chưa có bản build. Chạy `npm run build` trước.');
  process.exit(1);
}

const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('đang chạy') && resolve()));

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✖ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', hasTouch: true });

// Repo catalog (biên tập) — các kiểm thử cũ; repo tự phát hiện có kiểm thử riêng ở mục 9
const visible = lib.repos.filter((r) => r.visible && (r.origin || 'curated') === 'curated');
const radarPages = lib.repos.filter((r) => r.origin === 'radar');
const pick = (id) => lib.repos.find((r) => r.id.toLowerCase() === id.toLowerCase());

console.log('\n1) Mọi trang đều tải được');
await test('Các trang chính, danh mục và toàn bộ trang repo trả về 200', async () => {
  const urls = ['/', '/xu-huong/', '/danh-muc/', '/tim-kiem/', '/yeu-thich/', '/bang-danh-gia/', '/phuong-phap/', '/sitemap.xml', '/robots.txt', '/data/index.json', '/data/radar.json',
    ...lib.categories.map((c) => `/danh-muc/${c.slug}/`), ...lib.areas.map((a) => `/xu-huong/linh-vuc/${a.slug}/`), ...lib.repos.map((r) => r.path)];
  const bad = [];
  for (let i = 0; i < urls.length; i += 16) {
    const res = await Promise.all(urls.slice(i, i + 16).map(async (u) => [u, (await fetch(BASE + u)).status]));
    for (const [u, s] of res) if (s !== 200) bad.push(`${u} → ${s}`);
  }
  assert(!bad.length, `Lỗi: ${bad.slice(0, 10).join(', ')}`);
  console.log(`      (${urls.length} địa chỉ)`);
});
await test('Trang không tồn tại trả về 404 có nội dung tiếng Việt', async () => {
  const r = await fetch(`${BASE}/khong-ton-tai/`);
  assert(r.status === 404, `status ${r.status}`);
  assert((await r.text()).includes('Không tìm thấy trang'), 'thiếu nội dung 404');
});
await test('Sitemap liệt kê đủ trang repo đang hiển thị', async () => {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const n = (xml.match(/<url>/g) || []).length;
  assert(n >= visible.length + lib.categories.length, `sitemap có ${n} url, cần ≥ ${visible.length + lib.categories.length}`);
  assert(xml.includes('/xu-huong/'), 'thiếu trang Xu hướng');
  const leaked = radarPages.filter((r) => r.noindex && xml.includes(`${r.path}</loc>`));
  assert(!leaked.length, `trang repo tự phát hiện "noindex" lọt vào sitemap: ${leaked.slice(0, 3).map((r) => r.path).join(', ')}`);
});

console.log('\n2) Không lỗi console / request hỏng');
await test('Trang chủ, danh mục, chi tiết, tìm kiếm không có lỗi', async () => {
  const p = await desktop.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`console ${m.text()}`); });
  p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push(`${r.status()} ${r.url()}`); });
  for (const u of ['/', '/danh-muc/ai-video-image/', pick('n8n-io/n8n').path, '/tim-kiem/?q=video', '/bang-danh-gia/', '/yeu-thich/', '/phuong-phap/']) {
    await p.goto(BASE + u, { waitUntil: 'networkidle' });
  }
  await p.close();
  assert(!errs.length, errs.slice(0, 6).join('\n'));
});

console.log('\n3) Hiển thị trên điện thoại (390px) – không tràn ngang');
await test('Không trang nào rộng hơn màn hình', async () => {
  const p = await mobile.newPage();
  const repoPages = argv('all') ? visible.map((r) => r.path) : [
    ...visible.filter((r) => r.license.display.length > 22).slice(0, 8).map((r) => r.path),
    ...visible.filter((r) => r.readme?.sections?.install?.html?.includes('<table')).slice(0, 4).map((r) => r.path),
    ...visible.slice(0, 12).map((r) => r.path),
  ];
  const urls = ['/', '/xu-huong/', `/xu-huong/linh-vuc/${lib.areas[0].slug}/`, '/danh-muc/', ...lib.categories.slice(0, 6).map((c) => `/danh-muc/${c.slug}/`), '/tim-kiem/', '/tim-kiem/?src=all&sort=trend7', '/yeu-thich/', '/bang-danh-gia/', '/phuong-phap/', ...new Set(repoPages), ...radarPages.slice(0, 6).map((r) => r.path)];
  const bad = [];
  for (const u of urls) {
    await p.goto(BASE + u, { waitUntil: 'domcontentloaded' });
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (w[0] > w[1] + 1) bad.push(`${u} (${w[0]}px)`);
  }
  await p.close();
  assert(!bad.length, `Tràn ngang: ${bad.join(', ')}`);
  console.log(`      (${urls.length} trang)`);
});
await test('Menu điện thoại mở được và có liên kết điều hướng', async () => {
  const p = await mobile.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Mở menu' }).click();
  await p.locator('#mobile-nav').getByRole('link', { name: 'Bảng đánh giá' }).click();
  await p.waitForURL(/bang-danh-gia/);
  await p.close();
});
await test('Bộ lọc trên điện thoại mở dạng hộp thoại và áp dụng được', async () => {
  const p = await mobile.newPage();
  await p.goto(BASE + '/danh-muc/ai-video-image/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Bộ lọc/ }).click();
  const dlg = p.getByRole('dialog', { name: 'Bộ lọc' });
  await dlg.getByRole('button', { name: /^Dễ cài/ }).click();
  await dlg.getByRole('button', { name: /^Xem \d+ kết quả/ }).click();
  await p.waitForFunction(() => location.search.includes('diff=easy'));
  await p.close();
});

console.log('\n4) Tìm kiếm');
async function searchTop(q) {
  const p = await desktop.newPage();
  await p.goto(`${BASE}/tim-kiem/?q=${encodeURIComponent(q)}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !document.body.innerText.includes('Đang tải chỉ mục'));
  const names = await p.locator('section[aria-label="Kết quả"] article h3').allInnerTexts();
  await p.close();
  return names;
}
await test('Gõ không dấu "tach nen anh" tìm ra công cụ tách nền (rembg)', async () => {
  const names = await searchTop('tach nen anh');
  assert(names.slice(0, 5).includes('rembg'), `Top: ${names.slice(0, 5).join(', ')}`);
});
await test('Tìm theo tên "n8n" → n8n đứng đầu', async () => {
  const names = await searchTop('n8n');
  assert(names[0] === 'n8n', `Top: ${names.slice(0, 3).join(', ')}`);
});
await test('Tìm theo chức năng tiếng Việt "giọng đọc tiếng Việt" ra VieNeu-TTS', async () => {
  const names = await searchTop('giọng đọc tiếng Việt');
  assert(names.slice(0, 5).includes('VieNeu-TTS'), `Top: ${names.slice(0, 5).join(', ')}`);
});
await test('Tìm theo tác giả "microsoft" ra các dự án của Microsoft', async () => {
  const names = await searchTop('microsoft');
  assert(names.includes('PowerToys') && names.includes('markitdown'), `Kết quả: ${names.slice(0, 8).join(', ')}`);
});
await test('Gõ sai nhẹ "comfyiu" vẫn ra ComfyUI', async () => {
  const names = await searchTop('comfyiu');
  assert(names.slice(0, 3).includes('ComfyUI'), `Top: ${names.slice(0, 3).join(', ')}`);
});
await test('Ô tìm kiếm trang chủ chuyển sang trang Tìm kiếm với từ khóa', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.fill('#hero-q', 'chatbot');
  await p.press('#hero-q', 'Enter');
  await p.waitForURL(/tim-kiem\/\?q=chatbot/);
  await p.waitForFunction(() => document.querySelectorAll('section[aria-label="Kết quả"] article').length > 0);
  await p.close();
});
await test('Phím tắt "/" đưa con trỏ vào ô tìm kiếm', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/danh-muc/ai-agents/', { waitUntil: 'networkidle' });
  await p.keyboard.press('/');
  const focused = await p.evaluate(() => document.activeElement?.getAttribute('type'));
  await p.close();
  assert(focused === 'search', `focus: ${focused}`);
});

console.log('\n5) Bộ lọc và sắp xếp');
await test('Lọc "Dễ cài" + "Windows" chỉ còn dự án thỏa cả hai; URL lưu bộ lọc', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/danh-muc/ai-video-image/', { waitUntil: 'networkidle' });
  const aside = p.locator('aside[aria-label="Bộ lọc"]');
  await aside.getByRole('button', { name: /^Dễ cài/ }).click();
  await aside.getByRole('button', { name: /^Windows/ }).click();
  await p.waitForFunction(() => location.search.includes('diff=easy') && location.search.includes('os=windows'));
  const rows = await p.locator('section[aria-label="Kết quả"] article').count();
  const ids = await p.locator('section[aria-label="Kết quả"] article h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const expected = lib.repos.filter((r) => r.visible && !r.stats?.archived && r.categories.includes('ai-video-image') && r.difficulty === 'easy' && r.platforms.includes('windows'));
  assert(rows === expected.length, `Có ${rows} dòng, mong đợi ${expected.length}`);
  assert(ids.every((h) => expected.some((r) => h.endsWith(r.path))), 'Có dự án không thỏa bộ lọc');
  await p.reload({ waitUntil: 'networkidle' });
  const after = await p.locator('section[aria-label="Kết quả"] article').count();
  assert(after === rows, `Sau khi tải lại còn ${after} dòng`);
  await p.close();
});
await test('Sắp xếp "Nhiều sao nhất" cho thứ tự giảm dần', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/danh-muc/chatbot-llm/?sort=stars', { waitUntil: 'networkidle' });
  const hrefs = await p.locator('section[aria-label="Kết quả"] article h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const stars = hrefs.map((h) => lib.repos.find((r) => h.endsWith(r.path))?.stats?.stars ?? -1);
  await p.close();
  assert(stars.length > 5 && stars.every((s, i) => i === 0 || s <= stars[i - 1]), `Thứ tự: ${stars.slice(0, 6).join(', ')}`);
});
await test('Bộ lọc giấy phép "Dùng thương mại thoải mái" loại bỏ AGPL/fair-code', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/tim-kiem/?lic=free', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !document.body.innerText.includes('Đang tải chỉ mục'));
  const stamps = await p.locator('section[aria-label="Kết quả"] article .stamp').allInnerTexts();
  await p.close();
  assert(stamps.length > 20 && stamps.every((s) => /Dùng thương mại|Dùng được/.test(s)), `Có con dấu khác: ${[...new Set(stamps)].join(' | ')}`);
});
await test('Mặc định ẩn dự án đã lưu trữ; bật "Hiện cả dự án đã lưu trữ" thì hiện', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/danh-muc/ai-automation/', { waitUntil: 'networkidle' });
  const before = await p.locator('section[aria-label="Kết quả"] article', { hasText: 'Đã lưu trữ' }).count();
  await p.locator('aside[aria-label="Bộ lọc"]').getByLabel('Hiện cả dự án đã lưu trữ').check();
  const after = await p.locator('section[aria-label="Kết quả"] article', { hasText: 'Đã lưu trữ' }).count();
  await p.close();
  assert(before === 0 && after >= 1, `trước ${before}, sau ${after}`);
});

console.log('\n6) Trang chi tiết & tải về');
await test('n8n: đủ nút GitHub, ZIP, bản phát hành, tài liệu; link đúng nguồn chính chủ', async () => {
  const r = pick('n8n-io/n8n');
  const p = await desktop.newPage();
  await p.goto(BASE + r.path, { waitUntil: 'networkidle' });
  const panel = p.locator('aside[aria-label="Tải về và liên kết"]');
  const gh = await panel.getByRole('link', { name: 'Xem mã nguồn trên GitHub' }).getAttribute('href');
  const zip = await panel.getByRole('link', { name: /Tải ZIP mã nguồn/ }).getAttribute('href');
  const rel = await panel.getByRole('link', { name: /Bản phát hành/ }).getAttribute('href');
  const hrefs = await panel.locator('a').evaluateAll((as) => as.map((a) => a.href));
  await p.close();
  assert(gh === 'https://github.com/n8n-io/n8n', gh);
  assert(zip === `https://github.com/n8n-io/n8n/archive/refs/heads/${r.branch}.zip`, zip);
  assert(rel.startsWith('https://github.com/n8n-io/n8n/releases/tag/'), rel);
  assert(hrefs.every((h) => /^https:\/\/(github\.com|[^/]*n8n\.io)/.test(h)), `Link lạ: ${hrefs.filter((h) => !/github\.com|n8n\.io/.test(h)).join(', ')}`);
});
await test('Dự án đã lưu trữ hiển thị cảnh báo rõ ràng', async () => {
  const r = lib.repos.find((x) => x.stats?.archived);
  assert(r, 'không có dự án lưu trữ để kiểm tra');
  const p = await desktop.newPage();
  await p.goto(BASE + r.path, { waitUntil: 'networkidle' });
  const alert = await p.getByRole('alert').first().innerText();
  await p.close();
  assert(/lưu trữ/i.test(alert), alert);
});
await test('Số liệu trang chi tiết khớp dữ liệu đồng bộ và có thời điểm lấy', async () => {
  const r = pick('ollama/ollama');
  const p = await desktop.newPage();
  await p.goto(BASE + r.path, { waitUntil: 'networkidle' });
  const text = await p.locator('#so-lieu').innerText();
  await p.close();
  assert(text.includes(r.stats.stars.toLocaleString('vi-VN')), 'số sao không khớp');
  assert(/Lấy lúc \d{2}:\d{2}, \d{2}\/\d{2}\/\d{4}/.test(text), 'thiếu thời điểm lấy dữ liệu');
});
await test('Nội dung README đã được làm sạch (không script/onerror, link tuyệt đối)', async () => {
  const bad = [];
  for (const r of lib.repos) {
    for (const s of Object.values(r.readme?.sections || {})) {
      if (!s) continue;
      // Chỉ xét thuộc tính trong thẻ HTML (không bắt nhầm chữ "session_id=" trong khối code)
      if (/<script\b|<iframe\b|<[a-z][^>]*\son\w+\s*=|(?:href|src)="\s*javascript:/i.test(s.html)) bad.push(`${r.id}: mã nguy hiểm`);
      const outsideCode = s.html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
      const rel = outsideCode.match(/(?:href|src)="(?!https?:|mailto:)[^"]*"/);
      if (rel) bad.push(`${r.id}: link tương đối ${rel[0]}`);
    }
  }
  assert(!bad.length, bad.slice(0, 5).join('\n'));
});

console.log('\n7) Yêu thích & bộ sưu tập');
await test('Lưu dự án → số đếm trên header tăng → trang Yêu thích liệt kê', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/danh-muc/chatbot-llm/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Lưu ollama/ollama vào Yêu thích' }).click();
  await p.getByRole('button', { name: 'Lưu open-webui/open-webui vào Yêu thích' }).click();
  await p.getByRole('link', { name: /Yêu thích \(2 dự án\)/ }).waitFor();
  await p.goto(BASE + '/yeu-thich/', { waitUntil: 'networkidle' });
  const names = await p.locator('article h3').allInnerTexts();
  assert(names.includes('ollama') && names.includes('open-webui'), names.join(', '));
  await p.getByRole('tab', { name: /Bộ sưu tập/ }).click();
  await p.fill('#new-col', 'Bộ AI chạy local');
  await p.getByRole('button', { name: 'Tạo bộ sưu tập' }).click();
  await p.getByRole('tab', { name: /Đã lưu/ }).click();
  await p.locator('article').filter({ has: p.locator('h3', { hasText: /^ollama$/ }) })
    .locator('xpath=following-sibling::div[1]').getByRole('button', { name: 'Bộ AI chạy local' }).click();
  await p.getByRole('tab', { name: /Bộ sưu tập/ }).click();
  const col = await p.getByRole('region', { name: 'Bộ AI chạy local' }).innerText();
  assert(col.includes('ollama'), 'bộ sưu tập chưa có ollama');
  // Dữ liệu còn sau khi tải lại trang
  await p.reload({ waitUntil: 'networkidle' });
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('openkho:favorites:v1')));
  assert(Object.keys(stored.favorites).length === 2 && stored.collections[0].repos.length === 1, JSON.stringify(stored).slice(0, 200));
  await p.close();
});
await test('Link chia sẻ bộ sưu tập mở được ở trình duyệt khác và lưu lại', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/yeu-thich/', { waitUntil: 'networkidle' });
  const token = await p.evaluate(() => {
    const json = JSON.stringify({ n: 'Gợi ý video', r: ['Comfy-Org/ComfyUI', 'upscayl/upscayl'] });
    return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  const fresh = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const q = await fresh.newPage();
  await q.goto(`${BASE}/yeu-thich/?share=${token}`, { waitUntil: 'networkidle' });
  await q.getByText('Bộ sưu tập được chia sẻ: “Gợi ý video” (2 dự án)').waitFor();
  await q.getByRole('button', { name: 'Lưu bộ sưu tập này' }).click();
  const stored = await q.evaluate(() => JSON.parse(localStorage.getItem('openkho:favorites:v1')));
  await fresh.close();
  await p.close();
  assert(stored.collections[0].name === 'Gợi ý video' && stored.collections[0].repos.length === 2, JSON.stringify(stored));
});

console.log('\n8) Giao diện');
await test('Nút chuyển giao diện đổi sáng/tối và nhớ lựa chọn', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const t0 = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.getByRole('button', { name: /Giao diện theo hệ thống/ }).click();
  const t1 = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.reload({ waitUntil: 'networkidle' });
  const t2 = await p.evaluate(() => document.documentElement.dataset.theme);
  await ctx.close();
  assert(t0 === 'light' && t1 === 'dark' && t2 === 'dark', `${t0} → ${t1} → ${t2}`);
});
await test('Bảng đánh giá tải đủ dữ liệu và sắp xếp theo cột', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/bang-danh-gia/', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.innerText.includes('Đang hiển thị'));
  const n = await p.locator('tbody tr').count();
  await p.getByRole('button', { name: 'Sao', exact: true }).click();
  const first = await p.locator('tbody tr').first().locator('td').nth(1).innerText();
  await p.close();
  const top = [...visible].filter((r) => r.score).sort((a, b) => b.stats.stars - a.stats.stars)[0];
  assert(n === visible.filter((r) => r.score).length, `bảng có ${n} dòng`);
  assert(first.startsWith(top.name), `dòng đầu ${first}, mong đợi ${top.name}`);
});

console.log('\n9) Xu hướng và repo tự động phát hiện');
await test('Trang Xu hướng: tiêu đề, thời điểm đồng bộ, đủ các mục, chuyển tab kỳ', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/xu-huong/', { waitUntil: 'networkidle' });
  const text = await p.locator('main').innerText();
  for (const h of ['Đang thịnh hành', 'Tăng sao nhanh nhất', 'Mới & đang lên', 'Viên ngọc ẩn', 'Chất lượng cao nhất', 'Hoạt động gần đây', 'Phổ biến nhất', 'Khám phá theo lĩnh vực']) assert(text.includes(h), `thiếu mục "${h}"`);
  assert(text.includes('Discover the Best & Trending GitHub Repositories'), 'thiếu dòng tiếng Anh');
  assert(/Đồng bộ từ GitHub lúc \d{2}:\d{2}/.test(text), 'thiếu thời điểm đồng bộ');
  const sec = p.locator('#dang-thinh-hanh');
  await sec.getByRole('tab', { name: /Tháng này/ }).click();
  const panel = sec.locator('[role=tabpanel]:not([hidden])');
  const rows = await panel.locator('li').count();
  const d1 = lib.hub.windows.d1.scored;
  await sec.getByRole('tab', { name: /Hôm nay/ }).click();
  const today = await sec.locator('[role=tabpanel]:not([hidden])').innerText();
  await p.close();
  assert(rows === Math.min(12, lib.hub.trending.d30.length), `tab Tháng này có ${rows} dòng`);
  if (d1 === 0) assert(today.includes('Chưa đủ số liệu') && today.includes('Không có số liệu nào được ước đoán'), 'kỳ chưa đủ dữ liệu phải ghi rõ, không ước đoán');
});
await test('Repo chưa có trang riêng mở thẳng GitHub; repo spam bị loại khỏi mọi danh sách', async () => {
  const cards = [...Object.values(lib.hub.trending).flat(), ...Object.values(lib.hub.fastest).flat(), ...Object.values(lib.hub.new_rising).flat(), ...lib.hub.popular];
  const ext = cards.filter((c) => !c.p);
  assert(ext.every((c) => c.u === `https://github.com/${c.i}`), 'link ngoài phải trỏ tới GitHub');
  const dq = readJson(path.join(ROOT, 'data', 'jobs', 'data-quality.json'), { suppressed_clusters: [] });
  const spam = new Set(dq.suppressed_clusters.flatMap((c) => c.repos.map((x) => x.toLowerCase())));
  const idx = readJson(path.join(ROOT, 'public', 'data', 'radar.json'), { repos: [] }).repos.concat(readJson(path.join(ROOT, 'public', 'data', 'index.json'), { repos: [] }).repos);
  const leak = [...cards.map((c) => c.i), ...idx.map((r) => r.i)].filter((i) => spam.has(i.toLowerCase()));
  assert(!leak.length, `repo nghi spam xuất hiện: ${leak.slice(0, 3).join(', ')}`);
});
await test('Mọi điểm xu hướng hiển thị đều có phương pháp đo tăng trưởng', async () => {
  for (const r of lib.repos) for (const w of Object.values(r.trending || {})) {
    if (w && w.score !== null) assert(w.growth && w.growth.method && w.growth.from && w.growth.to, `${r.full_name} có điểm nhưng thiếu phương pháp`);
  }
});
await test('Tìm kiếm "Thịnh hành tuần này" gồm repo tự phát hiện, giảm dần, đảo chiều được, phân trang', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/tim-kiem/?src=all&sort=trend7', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => /\d+ dự án/.test(document.body.innerText) && !document.body.innerText.includes('Đang tải'));
  await p.waitForTimeout(300);
  const vals = async () => (await p.locator('article p.tnum.text-ok').allInnerTexts()).map((x) => Number(x.replace(/\D/g, '')));
  const v = await vals();
  const total = Number((await p.getByText(/^\d[\d.]* dự án$/).first().innerText()).replace(/\D/g, ''));
  assert(v.length > 0 && v.every((x, i) => i === 0 || v[i - 1] >= x), `thứ tự: ${v.slice(0, 6)}`);
  assert(total === lib.hub.windows.d7.scored, `${total} kết quả, mong đợi ${lib.hub.windows.d7.scored}`);
  assert(await p.getByText('Tự phát hiện').first().isVisible(), 'thiếu nhãn Tự phát hiện');
  await p.getByRole('button', { name: /Đảo chiều sắp xếp/ }).click();
  const r = await vals();
  assert(r.every((x, i) => i === 0 || r[i - 1] <= x), `đảo chiều: ${r.slice(0, 6)}`);
  assert(p.url().includes('dir=asc'), 'URL lưu chiều sắp xếp');
  if (total > 24) {
    const first = await p.locator('article h3').first().innerText();
    await p.getByRole('button', { name: '2', exact: true }).click();
    await p.waitForTimeout(200);
    assert(p.url().includes('page=2'), 'URL lưu trang');
    assert((await p.locator('article h3').first().innerText()) !== first, 'trang 2 khác trang 1');
  }
  await p.close();
});
await test('Nguồn mặc định chỉ gồm thư viện; chọn "Tự phát hiện" chỉ còn repo radar', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + '/tim-kiem/?src=r', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => /\d+ dự án/.test(document.body.innerText) && !document.body.innerText.includes('Đang tải'));
  await p.waitForTimeout(300);
  const n = Number((await p.getByText(/^\d[\d.]* dự án$/).first().innerText()).replace(/\D/g, ''));
  await p.close();
  const radarCount = lib.stats.radar_tracked - (readJson(path.join(ROOT, 'data', 'jobs', 'data-quality.json'), { suppressed_clusters: [] }).suppressed_clusters.reduce((a, c) => a + c.repos.length, 0));
  assert(n > 0 && n <= radarCount, `${n} repo radar (tối đa ${radarCount})`);
});
await test('Trang lĩnh vực có danh sách và liên kết lọc', async () => {
  const area = lib.areas.find((a) => a.count > 20);
  const p = await desktop.newPage();
  await p.goto(BASE + `/xu-huong/linh-vuc/${area.slug}/`, { waitUntil: 'networkidle' });
  const t = await p.locator('main').innerText();
  const items = await p.locator('[role=tabpanel]:not([hidden]) li').count();
  await p.close();
  assert(t.includes(area.name), 'thiếu tên lĩnh vực');
  assert(items > 0, 'không có repo');
});
await test('Trang repo tự phát hiện: nhãn rõ ràng, noindex, có mục Xu hướng, không đoán điểm biên tập', async () => {
  const r = radarPages.find((x) => x.noindex);
  if (!r) return;
  const p = await desktop.newPage();
  await p.goto(BASE + r.path, { waitUntil: 'networkidle' });
  const t = await p.locator('main').innerText();
  const robots = await p.locator('meta[name="robots"]').getAttribute('content');
  await p.close();
  assert(t.includes('tự động phát hiện'), 'thiếu nhãn tự phát hiện');
  assert(/noindex/.test(robots || ''), `robots = ${robots}`);
  assert(t.includes('Xu hướng') && t.includes('Trending Score'), 'thiếu mục Xu hướng');
  assert(t.includes('không áp dụng'), 'tiêu chí biên tập phải ghi "không áp dụng"');
});
await test('Trang repo catalog có mục Xu hướng; không còn quy tắc đoán 50% cho dữ liệu thiếu', async () => {
  const p = await desktop.newPage();
  await p.goto(BASE + pick('n8n-io/n8n').path, { waitUntil: 'networkidle' });
  const t = await p.locator('main').innerText();
  await p.goto(BASE + '/phuong-phap/', { waitUntil: 'networkidle' });
  const m = await p.locator('main').innerText();
  await p.close();
  assert(t.includes('Xu hướng') && t.includes('độ phủ dữ liệu'), 'thiếu mục Xu hướng/độ phủ');
  assert(!/trung tính 50%/.test(t + m), 'còn mô tả đoán 50%');
  assert(m.includes('Trending Score') && m.includes('Không nội suy'), 'trang phương pháp thiếu công thức xu hướng');
});

await browser.close();
server.kill();
console.log(`\n${passed} kiểm thử đạt, ${failures.length} lỗi.`);
process.exit(failures.length ? 1 : 0);
