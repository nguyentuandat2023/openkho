#!/usr/bin/env node
// Hậu xử lý bản build tĩnh (out/):
// Next.js 16 ghi các file "segment prefetch" dạng thư mục lồng nhau (__next.danh-muc/$d$slug/__PAGE__.txt)
// nhưng trình duyệt lại yêu cầu tên phẳng (__next.danh-muc.$d$slug.__PAGE__.txt). Trên hosting tĩnh thông thường
// điều này gây lỗi 404 khi tải trước trang. Script tạo thêm bản sao tên phẳng để mọi hosting tĩnh đều hoạt động.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/config.mjs';

const OUT = path.join(ROOT, 'out');
let made = 0;

function flatten(dir, prefix, target) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const name = `${prefix}.${ent.name}`;
    if (ent.isDirectory()) flatten(full, name, target);
    else {
      const dest = path.join(target, name);
      if (!fs.existsSync(dest)) { fs.copyFileSync(full, dest); made++; }
    }
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    if (ent.name.startsWith('__next.')) flatten(full, ent.name, dir);
    else if (ent.name !== '_next') walk(full);
  }
}

if (!fs.existsSync(OUT)) {
  console.error('Không thấy thư mục out/ — chạy next build trước.');
  process.exit(1);
}
walk(OUT);
// Một số hosting (GitHub Pages) bỏ qua thư mục bắt đầu bằng "_" nếu không tắt Jekyll
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`Hậu xử lý xong: tạo ${made} file prefetch tên phẳng.`);
