// Truy cập dữ liệu khi build (chỉ chạy phía máy chủ / lúc xuất trang tĩnh).
import fs from 'node:fs';
import path from 'node:path';
import type { CompactIndex, CompactRepo, Library, Repo } from './types';

let lib: Library | null = null;
let idx: CompactIndex | null = null;
const dev = process.env.NODE_ENV === 'development';

export function getLibrary(): Library {
  if (!lib || dev) {
    const file = path.join(process.cwd(), 'src', 'generated', 'library.json');
    if (!fs.existsSync(file)) throw new Error('Thiếu src/generated/library.json — chạy `npm run data` (hoặc `npm run sync`) trước.');
    lib = JSON.parse(fs.readFileSync(file, 'utf8')) as Library;
  }
  return lib;
}

export function getIndex(): CompactIndex {
  if (!idx || dev) idx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'index.json'), 'utf8')) as CompactIndex;
  return idx;
}

export const listed = (r: Repo) => r.visible && r.synced && r.origin === 'curated';

export function getRepoByPath(owner: string, name: string): Repo | undefined {
  const p = `/repo/${owner.toLowerCase()}/${name.toLowerCase()}/`;
  return getLibrary().repos.find((r) => r.path === p);
}

/** Giá trị params cho trang repo (tách từ đường dẫn đã sinh sẵn trong library.json). */
export function repoParams(r: Repo) {
  const [, , owner, name] = r.path.split('/');
  return { owner, name };
}

export function getCategory(slug: string) {
  return getLibrary().categories.find((c) => c.slug === slug);
}

export function compactFor(ids: Set<string> | ((r: CompactRepo) => boolean)): CompactRepo[] {
  const test = typeof ids === 'function' ? ids : (r: CompactRepo) => ids.has(r.i);
  return getIndex().repos.filter(test);
}

const byScore = (a: Repo, b: Repo) => (b.score?.total ?? 0) - (a.score?.total ?? 0);

export function topScored(n: number, filter: (r: Repo) => boolean = () => true) {
  return getLibrary().repos.filter((r) => listed(r) && !r.stats?.archived && filter(r)).sort(byScore).slice(0, n);
}

/** Đang lên: theo Trending Score 7 ngày (chỉ repo có số liệu tăng trưởng thật). */
export function trending(n: number) {
  return getLibrary().hub.trending.d7.slice(0, n);
}

export function getHub() {
  return getLibrary().hub;
}

export function getArea(slug: string) {
  return getLibrary().areas.find((a) => a.slug === slug);
}

export function areaMap() {
  return Object.fromEntries(getLibrary().areas.map((a) => [a.slug, a]));
}

export function recentlyReleased(n: number) {
  return getLibrary().repos
    .filter((r) => listed(r) && r.release?.published_at && !r.stats?.archived)
    .sort((a, b) => Date.parse(b.release!.published_at!) - Date.parse(a.release!.published_at!))
    .slice(0, n);
}

export function featured(n: number) {
  const seen = new Set<string>();
  const out: Repo[] = [];
  for (const r of getLibrary().repos.filter((x) => listed(x) && x.featured).sort(byScore)) {
    if (seen.has(r.category)) continue;
    seen.add(r.category);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

/** Repo liên quan theo lĩnh vực công nghệ (dùng cho repo tự phát hiện, chưa có danh mục biên tập). */
export function relatedByArea(repo: Repo, n: number) {
  const mine = new Map(repo.areas.map((a) => [a.slug, a.confidence]));
  if (!mine.size) return [];
  return getLibrary().repos
    .filter((r) => r.visible && r.synced && r.id !== repo.id && r.areas.some((a) => mine.has(a.slug)))
    .map((r) => ({ r, s: r.areas.reduce((acc, a) => acc + (mine.get(a.slug) ?? 0) * a.confidence, 0) + (r.score?.total ?? 0) / 200 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.r);
}

export function relatedRepos(repo: Repo, n: number) {
  return getLibrary().repos
    .filter((r) => listed(r) && r.id !== repo.id && r.categories.some((c) => repo.categories.includes(c)))
    .sort((a, b) => {
      const sa = (a.category === repo.category ? 10 : 0) + (a.score?.total ?? 0) / 10;
      const sb = (b.category === repo.category ? 10 : 0) + (b.score?.total ?? 0) / 10;
      return sb - sa;
    })
    .slice(0, n);
}
