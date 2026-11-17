// Bộ lọc & sắp xếp dùng chung (trang danh mục, tìm kiếm). Trạng thái được lưu trên URL để chia sẻ link.
import type { CompactRepo } from './types';
import { LICENSE_GROUP } from './labels';

/** Nguồn dữ liệu: lib = thư viện (biên tập + repo tự phát hiện đã có trang) · c = chỉ biên tập · r = chỉ tự phát hiện · all = tất cả */
export type Source = 'lib' | 'c' | 'r' | 'all';

export interface FilterState {
  q: string;
  src: Source;
  cat: string[];
  area: string[];
  lic: string[];
  price: string[];
  diff: string[];
  os: string[];
  use: string[];
  key: string[];
  lang: string[];
  tier: string[];
  stars: number;
  forks: number;
  upd: number;
  created: number;
  rel: boolean;
  gem: boolean;
  arch: boolean;
  del: boolean;
  sort: string;
  dir: 'desc' | 'asc';
  page: number;
}

export const DEFAULT_FILTERS: FilterState = {
  q: '', src: 'lib', cat: [], area: [], lic: [], price: [], diff: [], os: [], use: [], key: [], lang: [], tier: [],
  stars: 0, forks: 0, upd: 0, created: 0, rel: false, gem: false, arch: false, del: false, sort: 'score', dir: 'desc', page: 1,
};

const LISTS = ['cat', 'area', 'lic', 'price', 'diff', 'os', 'use', 'key', 'lang', 'tier'] as const;
const NUMS = ['stars', 'forks', 'upd', 'created'] as const;
const BOOLS = ['rel', 'gem', 'arch', 'del'] as const;
const SOURCES: Source[] = ['lib', 'c', 'r', 'all'];
export type ListKey = (typeof LISTS)[number];

/** Tên tham số URL (giữ "new" cho lọc "tạo trong vòng N ngày" để link ngắn gọn). */
const URL_NAME: Record<string, string> = { created: 'new' };
const urlName = (k: string) => URL_NAME[k] || k;

export const needsRadar = (f: FilterState) => f.src === 'all' || f.src === 'r';

export function parseParams(search: string, base: FilterState): FilterState {
  const sp = new URLSearchParams(search);
  const f: FilterState = { ...base };
  if (sp.has('q')) f.q = (sp.get('q') || '').slice(0, 120);
  const src = sp.get('src') as Source | null;
  if (src && SOURCES.includes(src)) f.src = src;
  for (const k of LISTS) if (sp.has(k)) f[k] = (sp.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const k of NUMS) if (sp.has(urlName(k))) f[k] = Math.max(0, Number(sp.get(urlName(k))) || 0);
  for (const k of BOOLS) if (sp.has(k)) f[k] = sp.get(k) === '1';
  if (sp.has('sort')) f.sort = (sp.get('sort') || base.sort) === 'trend' ? 'trend7' : sp.get('sort') || base.sort;
  if (sp.get('dir') === 'asc' || sp.get('dir') === 'desc') f.dir = sp.get('dir') as 'asc' | 'desc';
  if (sp.has('page')) f.page = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
  return f;
}

export function toSearch(f: FilterState, base: FilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.src !== base.src) sp.set('src', f.src);
  for (const k of LISTS) if (f[k].join(',') !== base[k].join(',') && f[k].length) sp.set(k, f[k].join(','));
  for (const k of NUMS) if (f[k] !== base[k]) sp.set(urlName(k), String(f[k]));
  for (const k of BOOLS) if (f[k] !== base[k]) sp.set(k, f[k] ? '1' : '0');
  if (f.sort !== base.sort) sp.set('sort', f.sort);
  if (f.dir !== base.dir) sp.set('dir', f.dir);
  if (f.page > 1) sp.set('page', String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const DAY = 86400000;

/** Giá trị dùng để sắp xếp; null = không có dữ liệu (luôn xếp cuối, không đoán). */
function sortValue(r: CompactRepo, sort: string): number | null {
  switch (sort) {
    case 'score': return r.sc;
    case 'stars': return r.st;
    case 'forks': return r.fk;
    case 'updated': return r.lu ? Date.parse(r.lu) : null;
    case 'release': return r.rl ? Date.parse(r.rl) : null;
    case 'created': return r.cr ? Date.parse(r.cr) : null;
    case 'added': return r.ad ? Date.parse(r.ad) : null;
    case 'trend1': return r.t1;
    case 'trend7': return r.t7;
    case 'trend30': return r.t30;
    case 'growth1': return r.g1;
    case 'growth7': return r.g7;
    case 'growth30': return r.g30;
    default: return null;
  }
}

/** Sắp xếp theo xu hướng/tăng trưởng thì chỉ giữ repo có số liệu cho kỳ đó. */
export function requiresValue(sort: string) {
  return /^(trend|growth)(1|7|30)$/.test(sort);
}

/** Kiểm tra một repo theo mọi bộ lọc, trừ nhóm `skip` (dùng để đếm số lượng cho từng lựa chọn). */
export function matches(r: CompactRepo, f: FilterState, skip: string | null = null, now = Date.now()): boolean {
  if (!f.del && !r.v) return false;
  if (!f.arch && r.ar && skip !== 'arch') return false;
  if (skip !== 'src') {
    if (f.src === 'c' && r.og !== 'c') return false;
    if (f.src === 'r' && r.og !== 'r') return false;
    if (f.src === 'lib' && r.og === 'r' && !r.p) return false;
  }
  if (skip !== 'cat' && f.cat.length && !f.cat.some((c) => r.c.includes(c))) return false;
  if (skip !== 'area' && f.area.length && !f.area.some((a) => r.ae.includes(a))) return false;
  if (skip !== 'lic' && f.lic.length) {
    const ok = f.lic.some((g) => LICENSE_GROUP.find((x) => x.key === g)?.classes.includes(r.lc));
    if (!ok) return false;
  }
  if (skip !== 'price' && f.price.length && !(r.pr && f.price.includes(r.pr))) return false;
  if (skip !== 'diff' && f.diff.length && !(r.df && f.diff.includes(r.df))) return false;
  if (skip !== 'os' && f.os.length && !f.os.every((o) => r.pf.includes(o as never))) return false;
  if (skip !== 'use' && f.use.length && !f.use.some((u) => r.dp.includes(u as never))) return false;
  if (skip !== 'key' && f.key.length && !(r.ak && f.key.includes(r.ak))) return false;
  if (skip !== 'lang' && f.lang.length && !(r.l && f.lang.includes(r.l))) return false;
  if (skip !== 'tier' && f.tier.length && !(r.tr && f.tier.includes(r.tr))) return false;
  if (f.stars && (r.st ?? 0) < f.stars) return false;
  if (f.forks && (r.fk ?? 0) < f.forks) return false;
  if (f.upd && (!r.lu || now - Date.parse(r.lu) > f.upd * DAY)) return false;
  if (f.created && (!r.cr || now - Date.parse(r.cr) > f.created * DAY)) return false;
  if (f.rel && !r.rt) return false;
  if (f.gem && !r.gem) return false;
  if (requiresValue(f.sort) && sortValue(r, f.sort) === null) return false;
  return true;
}

export function sortRepos(list: CompactRepo[], sort: string, relevance?: Map<string, number>, dir: 'asc' | 'desc' = 'desc'): CompactRepo[] {
  const arr = [...list];
  const tie = (a: CompactRepo, b: CompactRepo) => (b.sc ?? 0) - (a.sc ?? 0) || a.n.localeCompare(b.n);
  const flip = dir === 'asc' ? -1 : 1;
  if (sort === 'relevance') {
    if (relevance) return arr.sort((a, b) => flip * ((relevance.get(b.i) ?? 0) * (1 + (b.sc ?? 50) / 200) - (relevance.get(a.i) ?? 0) * (1 + (a.sc ?? 50) / 200)));
    return arr.sort(tie);
  }
  if (sort === 'name') return arr.sort((a, b) => flip * a.n.localeCompare(b.n, 'vi'));
  // Repo có tín hiệu bất thường xếp sau cùng khi sắp theo tăng trưởng
  const damp = (r: CompactRepo) => (/^(trend|growth)/.test(sort) && r.an ? 1 : 0);
  return arr.sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === null && vb === null) return tie(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return damp(a) - damp(b) || flip * (vb - va) || tie(a, b);
  });
}

export function activeCount(f: FilterState, base: FilterState): number {
  let n = 0;
  if (f.src !== base.src) n++;
  for (const k of LISTS) if (f[k].join(',') !== base[k].join(',')) n += f[k].length || 1;
  for (const k of NUMS) if (f[k] !== base[k]) n++;
  for (const k of BOOLS) if (f[k] !== base[k]) n++;
  return n;
}
