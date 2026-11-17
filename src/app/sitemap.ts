import type { MetadataRoute } from 'next';
import { getLibrary } from '@/lib/library';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const lib = getLibrary();
  const at = lib.synced_at ? new Date(lib.synced_at) : new Date();
  const ranked = lib.automation.ranking_computed_at ? new Date(lib.automation.ranking_computed_at) : at;
  const pages: MetadataRoute.Sitemap = ['/', '/xu-huong/', '/danh-muc/', '/tim-kiem/', '/bang-danh-gia/', '/phuong-phap/'].map((p) => ({
    url: absoluteUrl(p), lastModified: p === '/xu-huong/' ? ranked : at, changeFrequency: 'daily', priority: p === '/' ? 1 : 0.7,
  }));
  for (const c of lib.categories) pages.push({ url: absoluteUrl(`/danh-muc/${c.slug}/`), lastModified: at, changeFrequency: 'daily', priority: 0.8 });
  for (const a of lib.areas) if (a.count >= 5) pages.push({ url: absoluteUrl(`/xu-huong/linh-vuc/${a.slug}/`), lastModified: ranked, changeFrequency: 'daily', priority: 0.6 });
  for (const r of lib.repos) {
    if (!r.visible || r.noindex) continue;
    pages.push({ url: absoluteUrl(r.path), lastModified: r.fetched_at ? new Date(r.fetched_at) : at, changeFrequency: 'weekly', priority: 0.6 });
  }
  return pages;
}
