import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processReadme, sanitize, findVideos } from '../lib/readme.mjs';

const ctx = { full_name: 'acme/tool', branch: 'main', path: 'README.md' };

test('trích đúng mục Cài đặt / Sử dụng / Tính năng theo tiêu đề', () => {
  const md = `# Tool\n\nIntro text.\n\n## ✨ Features\n- Fast and simple tool for everyone\n- Works offline on any device\n\n## Installation\n\n\`\`\`bash\npip install tool\n\`\`\`\n\n### From source\nClone the repo and run the build script.\n\n## Usage\n\nRun \`tool --help\` to see every available option and flag.\n\n## License\nMIT`;
  const r = processReadme(md, ctx);
  assert.equal(r.sections.install.title, 'Installation');
  assert.match(r.sections.install.html, /pip install tool/);
  assert.match(r.sections.install.html, /From source/, 'mục con phải nằm trong mục cài đặt');
  assert.doesNotMatch(r.sections.install.html, /tool --help/, 'không lấn sang mục Usage');
  assert.equal(r.sections.usage.title, 'Usage');
  assert.equal(r.sections.features.title, 'Features');
});

test('nhận diện tiêu đề viết bằng HTML và tiếng Trung', () => {
  const md = `<h2 align="center">快速开始</h2>\n\n运行以下命令即可安装并启动本项目的全部服务组件。\n\n\`\`\`\ndocker compose up -d\n\`\`\`\n\n<h2>其他</h2>\nabc`;
  const r = processReadme(md, ctx);
  assert.ok(r.sections.install, 'phải tìm thấy mục 快速开始');
  assert.match(r.sections.install.html, /docker compose up -d/);
  assert.ok(r.cjk_ratio > 0.3);
  assert.equal(r.docker_mentioned, true);
});

test('loại bỏ huy hiệu (badge) và chuyển link tương đối thành tuyệt đối', () => {
  const md = `## Getting started\n\n[![build](https://img.shields.io/badge/build-passing-green)](https://ci.example)\n\nSee [the docs](docs/setup.md#step-2) and ![shot](./img/screen.png) or [top](#usage).\n\n<img src="assets/logo.png" width="120">`;
  const html = processReadme(md, ctx).sections.install.html;
  assert.doesNotMatch(html, /shields\.io/);
  assert.match(html, /href="https:\/\/github\.com\/acme\/tool\/blob\/main\/docs\/setup\.md#step-2"/);
  assert.match(html, /src="https:\/\/raw\.githubusercontent\.com\/acme\/tool\/main\/img\/screen\.png"/);
  assert.match(html, /src="https:\/\/raw\.githubusercontent\.com\/acme\/tool\/main\/assets\/logo\.png"/);
  assert.match(html, /href="https:\/\/github\.com\/acme\/tool#usage"/);
  assert.match(html, /rel="nofollow noopener noreferrer"/);
});

test('chặn mã độc trong README (XSS)', () => {
  const evil = `<p>Hi</p><script>alert(1)</script><img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)">click</a><iframe src="https://evil.example"></iframe><div style="position:fixed">x</div>`;
  const out = sanitize(evil, ctx);
  assert.doesNotMatch(out, /<script|onerror|javascript:|<iframe|style=/i);
  assert.match(out, /<p>Hi<\/p>/);
});

test('ảnh dạng github.com/.../blob/... được đổi sang raw để hiển thị được', () => {
  const out = sanitize('<img src="https://github.com/acme/tool/blob/main/a.gif?raw=true">', ctx);
  assert.match(out, /src="https:\/\/raw\.githubusercontent\.com\/acme\/tool\/main\/a\.gif"/);
});

test('README tiếng Việt: "Cài đặt" và "Hướng dẫn sử dụng"', () => {
  const md = `## Cài đặt\n\nTải bộ cài từ trang Releases rồi chạy file setup.exe để cài đặt.\n\n## Hướng dẫn sử dụng\n\nMở ứng dụng, chọn tệp cần xử lý và bấm nút Bắt đầu để chạy.`;
  const r = processReadme(md, ctx);
  assert.equal(r.sections.install.title, 'Cài đặt');
  assert.equal(r.sections.usage.title, 'Hướng dẫn sử dụng');
});

test('tìm video YouTube trong README (tối đa 3, không trùng)', () => {
  const v = findVideos('Demo: https://www.youtube.com/watch?v=dQw4w9WgXcQ and https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/embed/abcdefghijk');
  assert.deepEqual(v.map((x) => x.id), ['dQw4w9WgXcQ', 'abcdefghijk']);
});
