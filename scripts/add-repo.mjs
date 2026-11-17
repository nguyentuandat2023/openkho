#!/usr/bin/env node
// Thêm repo vào thư viện bằng dòng lệnh (không cần sửa mã nguồn):
//   npm run add -- owner/repo --category ai-agents [--summary "Mô tả tiếng Việt"] [--no-sync]
//   npm run add -- https://github.com/owner/repo --category video-media
// Repo được kiểm tra trên GitHub trước khi thêm; sau đó đồng bộ số liệu cho riêng repo đó.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { addEntry, loadCategories } from './lib/catalog.mjs';
import { lookupRepo } from './lib/discover.mjs';
import { ROOT, argv } from './lib/config.mjs';

const input = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== argv('category') && a !== argv('summary'));
if (!input) {
  console.log('Cách dùng: npm run add -- owner/repo --category <slug> [--summary "..."]');
  console.log('Danh mục:', loadCategories().map((c) => c.slug).join(', '));
  process.exit(1);
}
const info = await lookupRepo(input);
if (!info.ok) { console.error(`✖ ${info.error}`); process.exit(1); }
if (info.exists) { console.error(`✖ ${info.repo.full_name} đã có trong thư viện.`); process.exit(1); }
const cats = loadCategories().map((c) => c.slug);
const category = argv('category') || info.suggest[0];
if (!category || !cats.includes(category)) {
  console.error(`✖ Cần --category hợp lệ. Gợi ý theo topic: ${info.suggest.join(', ') || '(không có)'}\n  Danh mục: ${cats.join(', ')}`);
  process.exit(1);
}
const r = info.repo;
if (info.renamed) console.log(`ℹ Repo đã đổi tên → dùng tên mới ${r.full_name}`);
if (r.archived) console.log('⚠ Repo đã được lưu trữ (archived) — vẫn thêm nhưng sẽ hiển thị cảnh báo.');
addEntry(category, r.full_name, { summary: typeof argv('summary') === 'string' ? argv('summary') : undefined });
console.log(`✔ Đã thêm ${r.full_name} vào danh mục ${category} (${r.stars.toLocaleString('vi-VN')} sao, giấy phép ${r.license || 'không rõ'}).`);
if (!argv('no-sync')) {
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sync.mjs'), '--only', r.full_name], { stdio: 'inherit' });
}
console.log('Bổ sung mô tả tiếng Việt, ứng dụng, độ khó… trong trang Quản trị (npm run admin) hoặc file data/catalog/' + category + '.yaml');
