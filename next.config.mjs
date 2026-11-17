// Website xuất ra trang tĩnh (thư mục out/) → triển khai được lên mọi hosting tĩnh miễn phí
// (Cloudflare Pages, GitHub Pages, Netlify, Vercel…). BASE_PATH dùng khi đặt website trong thư mục con,
// ví dụ GitHub Pages dạng https://ten-ban.github.io/openkho → BASE_PATH=/openkho
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
