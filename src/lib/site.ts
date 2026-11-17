import config from '../../site.config.json';
import type { SiteConfig } from './types';

export const site = config as SiteConfig;
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** Đường dẫn tới file trong thư mục public/ có tính basePath (Link của Next tự xử lý, fetch/img thì không). */
export const asset = (p: string) => `${basePath}${p}`;
export const absoluteUrl = (p: string) => `${site.url.replace(/\/$/, '')}${basePath}${p}`;
export const proposeUrl = site.githubRepo
  ? `https://github.com/${site.githubRepo}/issues/new?template=de-xuat-repo.yml`
  : null;
