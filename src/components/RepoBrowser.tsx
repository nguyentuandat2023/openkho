'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CompactRepo } from '@/lib/types';
import { DEFAULT_FILTERS, activeCount, matches, needsRadar, parseParams, requiresValue, sortRepos, toSearch, type FilterState, type ListKey, type Source } from '@/lib/filters';
import { buildIndex, runSearch } from '@/lib/search';
import { API_KEY_SHORT, DEPLOY_SHORT, DIFFICULTY, LICENSE_GROUP, PLATFORM, PRICING, SORTS, SOURCE_LABEL, TIER } from '@/lib/labels';
import { asset } from '@/lib/site';
import RepoRow, { type CatLite, type RowMetric } from './RepoRow';

type Cat = CatLite & { name: string };
type AreaLite = { slug: string; name: string };

interface Props {
  initial: CompactRepo[];
  categories: Cat[];
  areas?: AreaLite[];
  lockedCategory?: string;
  fetchIndex?: boolean;
  pageSize?: number;
  searchPlaceholder?: string;
  autoFocus?: boolean;
}

type Group = { key: ListKey; label: string; options: [string, string][]; test: (r: CompactRepo, v: string) => boolean };

const STAR_STEPS = [0, 100, 1000, 5000, 10000, 50000, 100000];
const FORK_STEPS = [0, 100, 1000, 5000, 10000];
const UPD_STEPS: [number, string][] = [[0, 'Bất kỳ lúc nào'], [7, 'Trong 7 ngày'], [30, 'Trong 30 ngày'], [90, 'Trong 3 tháng'], [365, 'Trong 1 năm']];
const NEW_STEPS: [number, string][] = [[0, 'Bất kỳ lúc nào'], [7, 'Trong 7 ngày'], [30, 'Trong 30 ngày'], [90, 'Trong 90 ngày'], [365, 'Trong 1 năm']];
const SOURCES: Source[] = ['lib', 'c', 'r', 'all'];

function metricFor(r: CompactRepo, sort: string): RowMetric | undefined {
  const m = sort.match(/^(trend|growth)(1|7|30)$/);
  if (!m) return undefined;
  const w = m[2] as '1' | '7' | '30';
  const label = w === '1' ? '24 giờ' : `${w} ngày`;
  if (m[1] === 'trend') {
    const v = r[`t${w}` as 't1' | 't7' | 't30'];
    return v === null ? undefined : { value: String(Math.round(v)), label: `xu hướng ${label}` };
  }
  const g = r[`g${w}` as 'g1' | 'g7' | 'g30'];
  const method = r.gm[w === '1' ? 0 : w === '7' ? 1 : 2];
  return g === null ? undefined : { value: `+${g.toLocaleString('vi-VN')}`, label: `sao · ${label}${method === 'c' ? ' (tạo trong kỳ)' : method === 'g' ? ' (đếm lượt gắn sao)' : ''}` };
}

function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, cur - 1);
  const to = Math.min(total - 1, cur + 1);
  if (from > 2) out.push('…');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push('…');
  out.push(total);
  return out;
}

export default function RepoBrowser({ initial, categories, areas = [], lockedCategory, fetchIndex = false, pageSize = 24, searchPlaceholder, autoFocus }: Props) {
  const base: FilterState = useMemo(() => ({ ...DEFAULT_FILTERS }), []);
  const [docs, setDocs] = useState<CompactRepo[]>(initial);
  const [radar, setRadar] = useState<CompactRepo[] | null>(null);
  const [radarState, setRadarState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loading, setLoading] = useState(fetchIndex);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<FilterState>(base);
  const [qInput, setQInput] = useState('');
  const [open, setOpen] = useState(false);
  const hydrated = useRef(false);
  const inputId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Đọc bộ lọc từ URL khi tải trang
  useEffect(() => {
    const parsed = parseParams(window.location.search, base);
    setF(parsed);
    setQInput(parsed.q);
    hydrated.current = true;
  }, [base]);

  // Trang tìm kiếm: tải chỉ mục thư viện
  useEffect(() => {
    if (!fetchIndex) return;
    let alive = true;
    fetch(asset('/data/index.json'))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { if (alive) { setDocs(j.repos); setLoading(false); } })
      .catch((e) => { if (alive) { setError(`Không tải được chỉ mục tìm kiếm (${e.message}). Tải lại trang để thử lại.`); setLoading(false); } });
    return () => { alive = false; };
  }, [fetchIndex]);

  // Repo tự phát hiện chưa có trang riêng: chỉ tải khi người dùng chọn nguồn "Tự phát hiện" hoặc "Tất cả"
  useEffect(() => {
    if (!fetchIndex || !needsRadar(f) || radar || radarState === 'loading') return;
    setRadarState('loading');
    fetch(asset('/data/radar.json'))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { setRadar(j.repos); setRadarState('idle'); })
      .catch(() => setRadarState('error'));
  }, [fetchIndex, f, radar, radarState]);

  // Gõ tìm kiếm: chờ người dùng dừng gõ một chút
  useEffect(() => {
    const t = setTimeout(() => setF((p) => (p.q === qInput ? p : { ...p, q: qInput, page: 1 })), 160);
    return () => clearTimeout(t);
  }, [qInput]);

  // Ghi bộ lọc lên URL (để chia sẻ/đánh dấu trang)
  useEffect(() => {
    if (!hydrated.current) return;
    const url = `${window.location.pathname}${toSearch(f, base)}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
  }, [f, base]);

  // Hộp lọc trên điện thoại
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const allDocs = useMemo(() => (radar && needsRadar(f) ? [...docs, ...radar] : docs), [docs, radar, f]);
  const names = useMemo(() => ({ ...Object.fromEntries(categories.map((c) => [c.slug, c.name])), ...Object.fromEntries(areas.map((a) => [`a:${a.slug}`, a.name])) }), [categories, areas]);
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c])), [categories]);
  const ms = useMemo(() => buildIndex(allDocs, names), [allDocs, names]);
  const rel = useMemo(() => (f.q.trim() ? runSearch(ms, f.q, allDocs) : null), [ms, f.q, allDocs]);
  const scope = useMemo(() => allDocs.filter((r) => (!lockedCategory || r.c.includes(lockedCategory)) && (!rel || rel.has(r.i))), [allDocs, lockedCategory, rel]);
  const sortKey = f.q.trim() && f.sort === base.sort ? 'relevance' : f.sort;
  const results = useMemo(() => sortRepos(scope.filter((r) => matches(r, f)), sortKey, rel ?? undefined, f.dir), [scope, f, rel, sortKey]);

  const languages = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allDocs) if (r.l && (!lockedCategory || r.c.includes(lockedCategory))) m.set(r.l, (m.get(r.l) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n]) => [n, n] as [string, string]);
  }, [allDocs, lockedCategory]);

  const groups: Group[] = useMemo(() => {
    const g: Group[] = [];
    if (!lockedCategory) g.push({ key: 'cat', label: 'Danh mục biên tập', options: categories.map((c) => [c.slug, c.short]), test: (r, v) => r.c.includes(v) });
    if (areas.length) g.push({ key: 'area', label: 'Lĩnh vực công nghệ (tự động)', options: areas.map((a) => [a.slug, a.name]), test: (r, v) => r.ae.includes(v) });
    g.push(
      { key: 'lic', label: 'Giấy phép (dùng thương mại)', options: LICENSE_GROUP.map((x) => [x.key, x.label]), test: (r, v) => Boolean(LICENSE_GROUP.find((x) => x.key === v)?.classes.includes(r.lc)) },
      { key: 'price', label: 'Chi phí', options: Object.entries(PRICING), test: (r, v) => r.pr === v },
      { key: 'diff', label: 'Độ khó cài đặt', options: Object.entries(DIFFICULTY), test: (r, v) => r.df === v },
      { key: 'os', label: 'Nền tảng hỗ trợ', options: Object.entries(PLATFORM), test: (r, v) => r.pf.includes(v as never) },
      { key: 'use', label: 'Cách sử dụng', options: Object.entries(DEPLOY_SHORT), test: (r, v) => r.dp.includes(v as never) },
      { key: 'key', label: 'Khóa API dịch vụ AI', options: Object.entries(API_KEY_SHORT), test: (r, v) => r.ak === v },
      { key: 'tier', label: 'Xếp hạng chất lượng', options: Object.entries(TIER).map(([k, v]) => [k, v.label]), test: (r, v) => r.tr === v },
      { key: 'lang', label: 'Ngôn ngữ lập trình', options: languages, test: (r, v) => r.l === v },
    );
    return g;
  }, [categories, areas, lockedCategory, languages]);

  const counts = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const g of groups) {
      const pool = scope.filter((r) => matches(r, f, g.key));
      out[g.key] = Object.fromEntries(g.options.map(([v]) => [v, pool.filter((r) => g.test(r, v)).length]));
    }
    return out;
  }, [groups, scope, f]);

  const set = (patch: Partial<FilterState>) => setF((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));
  const toggle = (k: ListKey, v: string) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v], page: 1 }));
  const nActive = activeCount(f, base);
  const clear = () => { setF({ ...base, q: f.q, sort: f.sort, dir: f.dir }); };

  const panel = (idp: string) => (
    <div className="space-y-6">
      {!lockedCategory && fetchIndex && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Nguồn</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {SOURCES.map((s) => (
              <button key={s} type="button" className="chip justify-center" aria-pressed={f.src === s} title={SOURCE_LABEL[s].help} onClick={() => set({ src: s })}>
                {SOURCE_LABEL[s].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{SOURCE_LABEL[f.src].help}.{radarState === 'loading' && ' Đang tải danh sách repo tự phát hiện…'}{radarState === 'error' && ' Không tải được danh sách repo tự phát hiện.'}</p>
        </fieldset>
      )}
      {groups.map((g) => (
        <fieldset key={g.key}>
          <legend className="mb-2 text-sm font-semibold">{g.label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {g.options.map(([v, label]) => {
              const on = f[g.key].includes(v);
              const n = counts[g.key]?.[v] ?? 0;
              if (!on && n === 0 && g.key !== 'tier') return null;
              return (
                <button key={v} type="button" className="chip" aria-pressed={on} onClick={() => toggle(g.key, v)}>
                  <span>{label}</span>
                  <span className="tnum text-ink-3">{n}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">Mức độ phổ biến và thời gian</legend>
        <label className="grid gap-1 text-sm text-ink-2">
          Số sao tối thiểu
          <select className="field" value={f.stars} onChange={(e) => set({ stars: Number(e.target.value) })} id={`${idp}-stars`}>
            {STAR_STEPS.map((s) => <option key={s} value={s}>{s ? `Từ ${s.toLocaleString('vi-VN')} sao` : 'Tất cả'}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">
          Số fork tối thiểu
          <select className="field" value={f.forks} onChange={(e) => set({ forks: Number(e.target.value) })}>
            {FORK_STEPS.map((s) => <option key={s} value={s}>{s ? `Từ ${s.toLocaleString('vi-VN')} fork` : 'Tất cả'}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">
          Có commit/push mã mới
          <select className="field" value={f.upd} onChange={(e) => set({ upd: Number(e.target.value) })}>
            {UPD_STEPS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">
          Repo được tạo
          <select className="field" value={f.created} onChange={(e) => set({ created: Number(e.target.value) })}>
            {NEW_STEPS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </label>
      </fieldset>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 font-semibold">Khác</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.gem} onChange={(e) => set({ gem: e.target.checked })} className="h-4 w-4 accent-[var(--gold)]" /> Chỉ “viên ngọc ẩn”</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.rel} onChange={(e) => set({ rel: e.target.checked })} className="h-4 w-4 accent-[var(--gold)]" /> Chỉ dự án có bản phát hành</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.arch} onChange={(e) => set({ arch: e.target.checked })} className="h-4 w-4 accent-[var(--gold)]" /> Hiện cả dự án đã lưu trữ</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.del} onChange={(e) => set({ del: e.target.checked })} className="h-4 w-4 accent-[var(--gold)]" /> Hiện dự án không còn tồn tại</label>
      </fieldset>
    </div>
  );

  const chips: { label: string; onRemove: () => void }[] = [];
  if (f.src !== base.src) chips.push({ label: `Nguồn: ${SOURCE_LABEL[f.src].label}`, onRemove: () => set({ src: base.src }) });
  for (const g of groups) for (const v of f[g.key]) chips.push({ label: g.options.find((o) => o[0] === v)?.[1] || v, onRemove: () => toggle(g.key, v) });
  if (f.stars) chips.push({ label: `≥ ${f.stars.toLocaleString('vi-VN')} sao`, onRemove: () => set({ stars: 0 }) });
  if (f.forks) chips.push({ label: `≥ ${f.forks.toLocaleString('vi-VN')} fork`, onRemove: () => set({ forks: 0 }) });
  if (f.upd) chips.push({ label: `Mã mới ${UPD_STEPS.find((u) => u[0] === f.upd)?.[1].toLowerCase() || ''}`, onRemove: () => set({ upd: 0 }) });
  if (f.created) chips.push({ label: `Tạo ${NEW_STEPS.find((u) => u[0] === f.created)?.[1].toLowerCase() || `trong ${f.created} ngày`}`, onRemove: () => set({ created: 0 }) });
  if (f.gem) chips.push({ label: 'Viên ngọc ẩn', onRemove: () => set({ gem: false }) });
  if (f.rel) chips.push({ label: 'Có bản phát hành', onRemove: () => set({ rel: false }) });
  if (f.arch) chips.push({ label: 'Gồm cả đã lưu trữ', onRemove: () => set({ arch: false }) });
  if (f.del) chips.push({ label: 'Gồm cả không còn tồn tại', onRemove: () => set({ del: false }) });

  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(f.page, pages);
  const shown = results.slice((page - 1) * pageSize, page * pageSize);
  const goPage = (p: number) => { set({ page: p }); topRef.current?.scrollIntoView({ block: 'start' }); };
  const sortLabel = SORTS.find((s) => s.key === sortKey)?.label || '';

  return (
    <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10">
      <aside className="hidden lg:block" aria-label="Bộ lọc">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8 pr-2">{panel('d')}</div>
      </aside>

      <section aria-label="Kết quả" className="min-w-0">
        <div ref={topRef} className="scroll-mt-24 flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="sr-only">Tìm dự án</label>
          <div className="relative min-w-0 flex-1 basis-64">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              id={inputId}
              type="search"
              value={qInput}
              autoFocus={autoFocus}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={searchPlaceholder || 'Tìm theo tên, chức năng, công nghệ, chủ sở hữu…'}
              className="field pl-10"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <button type="button" className="btn lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
            <SlidersHorizontal size={16} aria-hidden="true" /> Bộ lọc{nActive ? ` (${nActive})` : ''}
          </button>
          <div className="flex flex-none items-center gap-1">
            <label className="sr-only" htmlFor={`${inputId}-sort`}>Sắp xếp</label>
            <select id={`${inputId}-sort`} className="field w-auto min-w-[11rem] flex-none" value={sortKey} onChange={(e) => set({ sort: e.target.value })}>
              {SORTS.filter((s) => s.key !== 'relevance' || f.q.trim()).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" className="btn btn-sm h-[2.6rem]" onClick={() => set({ dir: f.dir === 'desc' ? 'asc' : 'desc' })}
              aria-label={`Đảo chiều sắp xếp (đang ${f.dir === 'desc' ? 'theo thứ tự mặc định' : 'đảo ngược'})`} title={f.dir === 'desc' ? 'Thứ tự mặc định — bấm để đảo ngược' : 'Đang đảo ngược — bấm để trở lại'}>
              {f.dir === 'desc' ? <ArrowDownWideNarrow size={17} aria-hidden="true" /> : <ArrowUpNarrowWide size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="font-semibold">
            {loading ? 'Đang tải chỉ mục…' : <><span className="tnum">{results.length.toLocaleString('vi-VN')}</span> dự án</>}
          </span>
          {f.q.trim() && !loading && <span className="text-ink-2">khớp với “{f.q.trim()}”</span>}
          {requiresValue(sortKey) && <span className="text-ink-3">· chỉ gồm repo có số liệu cho “{sortLabel.toLowerCase()}”</span>}
          {chips.map((c) => (
            <button key={c.label} type="button" onClick={c.onRemove} className="chip" aria-label={`Bỏ lọc ${c.label}`}>
              {c.label} <X size={13} aria-hidden="true" />
            </button>
          ))}
          {chips.length > 0 && <button type="button" onClick={clear} className="link text-sm">Xóa bộ lọc</button>}
        </div>

        {error && <p className="mt-6 rounded-lg border border-line bg-danger-soft p-4 text-sm text-danger">{error}</p>}

        <div className="mt-2">
          {shown.map((r) => <RepoRow key={r.i} r={r} cats={catMap} showCategory={!lockedCategory} metric={metricFor(r, sortKey)} />)}
        </div>

        {!loading && !error && results.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-line-strong p-6">
            <p className="font-semibold">Không có dự án nào khớp.</p>
            <p className="mt-1 text-sm text-ink-2">
              {requiresValue(sortKey)
                ? 'Chưa có repo nào đủ số liệu tăng trưởng cho kỳ này — số liệu chỉ có sau khi hệ thống đo đủ thời gian. Thử kỳ dài hơn hoặc chọn nguồn “Tất cả”.'
                : 'Thử bỏ bớt bộ lọc, gõ từ khóa ngắn hơn hoặc tìm theo chức năng, ví dụ “video”, “chatbot”, “tách nền”.'}
            </p>
            {chips.length > 0 && <button type="button" onClick={clear} className="btn btn-sm mt-3">Xóa bộ lọc</button>}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Phân trang" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="Trang trước">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            {pageList(page, pages).map((p, i) => p === '…'
              ? <span key={`e${i}`} className="px-1 text-ink-3" aria-hidden="true">…</span>
              : <button key={p} type="button" className={`btn btn-sm tnum min-w-[2.5rem] ${p === page ? 'btn-primary' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => goPage(p)}>{p}</button>)}
            <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => goPage(page + 1)} aria-label="Trang sau">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <span className="tnum w-full text-center text-xs text-ink-3">Trang {page}/{pages} · {((page - 1) * pageSize + 1).toLocaleString('vi-VN')}–{Math.min(page * pageSize, results.length).toLocaleString('vi-VN')} trong {results.length.toLocaleString('vi-VN')}</span>
          </nav>
        )}
      </section>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Bộ lọc" className="fixed inset-0 z-50 flex flex-col bg-bg lg:hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-lg font-bold">Bộ lọc</h2>
            <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Đóng bộ lọc">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">{panel('m')}</div>
          <div className="flex gap-2 border-t border-line px-4 py-3">
            {chips.length > 0 && <button type="button" className="btn" onClick={clear}>Xóa bộ lọc</button>}
            <button type="button" className="btn btn-primary flex-1" onClick={() => setOpen(false)}>
              Xem {results.length.toLocaleString('vi-VN')} kết quả
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
