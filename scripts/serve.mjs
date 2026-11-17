#!/usr/bin/env node
// Máy chủ tĩnh nhỏ để xem bản build (thư mục out/) trên máy: npm start → http://localhost:3000
//   --port 3000   cổng
//   --host 0.0.0.0  cho phép máy khác trong mạng LAN truy cập (mặc định chỉ máy này)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, argv } from './lib/config.mjs';

const OUT = path.join(ROOT, 'out');
const port = Number(argv('port', process.env.PORT || 3000));
const host = argv('host', '127.0.0.1');
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('Chưa có bản build. Chạy `npm run build` trước.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};

function send(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  if (file.includes(`${path.sep}_next${path.sep}static${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  res.writeHead(status, headers);
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (base) {
    if (!p.startsWith(base)) { res.writeHead(302, { Location: `${base}/` }); return res.end(); }
    p = p.slice(base.length) || '/';
  }
  const file = path.normalize(path.join(OUT, p));
  if (!file.startsWith(OUT)) { res.writeHead(403); return res.end(); }
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: `${base}${p}/` }); return res.end(); }
      const idx = path.join(file, 'index.html');
      if (fs.existsSync(idx)) return send(res, idx);
    } else return send(res, file);
  } catch { /* không có file */ }
  if (!path.extname(p) && fs.existsSync(`${file}.html`)) return send(res, `${file}.html`);
  if (!path.extname(p) && fs.existsSync(path.join(file, 'index.html'))) { res.writeHead(301, { Location: `${base}${p}/` }); return res.end(); }
  send(res, path.join(OUT, '404.html'), 404);
}).listen(port, host, () => {
  console.log(`Website đang chạy tại http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${base}/  (Ctrl+C để dừng)`);
});
