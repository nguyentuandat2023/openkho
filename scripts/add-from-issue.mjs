#!/usr/bin/env node
// Dùng trong GitHub Actions: đọc nội dung issue "Đề xuất repository" (biến môi trường ISSUE_BODY),
// kiểm tra repo trên GitHub, thêm vào catalog. Ghi kết quả vào GITHUB_OUTPUT để workflow phản hồi.
import fs from 'node:fs';
import { addEntry, loadCategories, validate, removeEntry } from './lib/catalog.mjs';
import { lookupRepo } from './lib/discover.mjs';

function output(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  const v = String(value).replace(/\r/g, '');
  if (file) fs.appendFileSync(file, v.includes('\n') ? `${key}<<__EOF__\n${v}\n__EOF__\n` : `${key}=${v}\n`);
  else console.log(`${key}: ${v}`);
}

/** Issue form của GitHub tạo nội dung dạng "### Tiêu đề\n\ngiá trị". */
function parseIssue(body) {
  const out = {};
  const parts = String(body || '').split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const [title, ...rest] = p.split('\n');
    const val = rest.join('\n').trim();
    out[title.trim()] = val === '_No response_' ? '' : val;
  }
  return out;
}

const f = parseIssue(process.env.ISSUE_BODY);
const repoInput = f['Link GitHub của repository'] || '';
const catRaw = f['Danh mục chính'] || '';
const summary = (f['Mô tả ngắn bằng tiếng Việt'] || '').slice(0, 400);
const slug = catRaw.split(/\s+[—-]\s+/)[0].trim();

const fail = (msg) => { output('added', 'false'); output('message', `❌ ${msg}`); console.error(msg); process.exit(0); };

if (!loadCategories().some((c) => c.slug === slug)) fail(`Danh mục không hợp lệ: "${catRaw}".`);
const info = await lookupRepo(repoInput);
if (!info.ok) fail(info.error);
if (info.exists) fail(`${info.repo.full_name} đã có trong thư viện.`);
addEntry(slug, info.repo.full_name, { summary: summary || undefined });
const v = validate();
if (v.errors.length) {
  removeEntry(info.repo.full_name);
  fail(`Dữ liệu chưa hợp lệ: ${v.errors.join('; ')}`);
}
output('added', 'true');
output('repo', info.repo.full_name);
output('message', `✅ Đã thêm **${info.repo.full_name}** vào danh mục \`${slug}\` (${info.repo.stars.toLocaleString('vi-VN')} sao, giấy phép ${info.repo.license || 'chưa rõ'}${info.repo.archived ? ', ⚠ repo đã lưu trữ' : ''}). Số liệu sẽ được đồng bộ và website tự cập nhật trong vài phút.`);
console.log(`Đã thêm ${info.repo.full_name} → ${slug}`);
