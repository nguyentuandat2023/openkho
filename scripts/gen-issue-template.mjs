#!/usr/bin/env node
// Sinh lại form "Đề xuất repository" (.github/ISSUE_TEMPLATE/de-xuat-repo.yml) theo danh sách danh mục hiện tại.
// Chạy lại sau khi thêm/đổi danh mục: node scripts/gen-issue-template.mjs
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT } from './lib/config.mjs';
import { loadCategories } from './lib/catalog.mjs';

const form = {
  name: 'Đề xuất repository',
  description: 'Đề xuất thêm một dự án mã nguồn mở trên GitHub vào thư viện',
  title: '[Đề xuất] ',
  labels: ['de-xuat'],
  body: [
    { type: 'markdown', attributes: { value: 'Cảm ơn bạn! Quản trị viên sẽ xem xét; khi được gắn nhãn **duyet**, dự án tự động được thêm và đồng bộ số liệu.' } },
    { type: 'input', id: 'repo', attributes: { label: 'Link GitHub của repository', placeholder: 'https://github.com/owner/ten-repo' }, validations: { required: true } },
    { type: 'dropdown', id: 'category', attributes: { label: 'Danh mục chính', options: loadCategories().map((c) => `${c.slug} — ${c.name}`) }, validations: { required: true } },
    { type: 'textarea', id: 'summary', attributes: { label: 'Mô tả ngắn bằng tiếng Việt', description: '1–2 câu: dự án làm được gì, dùng cho ai.' } },
    { type: 'textarea', id: 'reason', attributes: { label: 'Vì sao nên thêm?', description: 'Bạn đã dùng thử chưa? Ứng dụng thực tế là gì?' } },
    { type: 'checkboxes', id: 'confirm', attributes: { label: 'Xác nhận', options: [{ label: 'Tôi đã xem giấy phép của dự án và đây là repository chính thức (không phải bản sao/fork không rõ nguồn).', required: true }] } },
  ],
};
const out = path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'de-xuat-repo.yml');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `# Sinh tự động bởi scripts/gen-issue-template.mjs – chạy lại khi thay đổi danh mục\n${YAML.stringify(form, { lineWidth: 0 })}`);
console.log(`Đã ghi ${path.relative(ROOT, out)} (${loadCategories().length} danh mục).`);
