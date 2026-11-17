'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownWideNarrow, Download } from 'lucide-react';
import type { CompactRepo, TierKey } from '@/lib/types';
import { asset } from '@/lib/site';
import { compact, date } from '@/lib/format';
import { TIER } from '@/lib/labels';
import { fold } from '@/lib/search';
import LicenseStamp from './LicenseStamp';

type Cat = { slug: string; short: string; name: string; hue: number };
const CRIT = ['Phổ biến', 'Chất lượng', 'Ứng dụng', 'Cập nhật', 'Tài liệu', 'Cộng đồng'];
const CRIT_MAX = [20, 20, 20, 15, 15, 10];
type Col = 'score' | 'name' | 'stars' | 'forks' | 'updated' | `b${number}`;

/** Bảng đánh giá chất lượng toàn bộ thư viện, sắp xếp theo từng cột, xuất CSV mở bằng Excel. */
export default function EvaluationTable({ initial, categories, total }: { initial: CompactRepo[]; categories: Cat[]; total: number }) {
  const [rows, setRows] = useState<CompactRepo[]>(initial);
  const [full, setFull] = useState(false);
  const [cat, setCat] = useState('');
  const [tier, setTier] = useState('');
  const [q, setQ] = useState('');
  const [col, setCol] = useState<Col>('score');
  const [asc, setAsc] = useState(false);
  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c.short])), [categories]);

  useEffect(() => {
    fetch(asset('/data/index.json')).then((r) => r.json()).then((j) => { setRows(j.repos.filter((r: CompactRepo) => r.v && r.sc !== null && r.og === 'c')); setFull(true); }).catch(() => {});
  }, []);

  const list = useMemo(() => {
    const fq = fold(q.trim());
    const val = (r: CompactRepo): number | string => {
      if (col === 'name') return r.n.toLowerCase();
      if (col === 'stars') return r.st ?? -1;
      if (col === 'forks') return r.fk ?? -1;
      if (col === 'updated') return r.lu ? Date.parse(r.lu) : 0;
      if (col.startsWith('b')) return r.b?.[Number(col.slice(1))] ?? -1;
      return r.sc ?? -1;
    };
    return rows
      .filter((r) => (!cat || r.c.includes(cat)) && (!tier || r.tr === tier) && (!fq || fold(`${r.n} ${r.o} ${r.s}`).includes(fq)))
      .sort((a, b) => { const x = val(a); const y = val(b); const d = x < y ? -1 : x > y ? 1 : 0; return asc ? d : -d; });
  }, [rows, cat, tier, q, col, asc]);

  const sortBy = (c: Col) => { if (c === col) setAsc(!asc); else { setCol(c); setAsc(c === 'name'); } };
  const Th = ({ c, children, className = '' }: { c: Col; children: React.ReactNode; className?: string }) => (
    <th scope="col" className={`whitespace-nowrap px-2 py-2 font-semibold ${className}`} aria-sort={col === c ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sortBy(c)} className="inline-flex items-center gap-1 hover:text-ink">
        {children}{col === c && <ArrowDownWideNarrow size={13} className={asc ? 'rotate-180' : ''} aria-hidden="true" />}
      </button>
    </th>
  );

  const exportCsv = () => {
    const head = ['Hạng', 'Dự án', 'Chủ sở hữu', 'Link GitHub', 'Danh mục', 'Điểm', ...CRIT.map((c, i) => `${c} (/${CRIT_MAX[i]})`), 'Xếp loại', 'Sao', 'Fork', 'Người đóng góp', 'Commit gần nhất', 'Giấy phép', 'Phiên bản mới nhất', 'Ngày phát hành', 'Mô tả'];
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = list.map((r, i) => [i + 1, r.n, r.o, `https://github.com/${r.i}`, r.c.map((c) => catName[c]).join(' / '), r.sc, ...(r.b || []), r.tr ? TIER[r.tr].label : '', r.st, r.fk, r.ct ?? '', r.lu?.slice(0, 10), r.ls, r.rt ?? '', r.rl?.slice(0, 10) ?? '', r.s || r.d].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `openkho-bang-danh-gia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-ink-2">Lọc theo tên
          <input type="search" className="field w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: whisper" />
        </label>
        <label className="grid gap-1 text-sm text-ink-2">Danh mục
          <select className="field w-56" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">Xếp loại
          <select className="field w-44" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Tất cả</option>
            {(Object.keys(TIER) as TierKey[]).map((t) => <option key={t} value={t}>{TIER[t].label}</option>)}
          </select>
        </label>
        <button type="button" className="btn ml-auto" onClick={exportCsv} disabled={!full}><Download size={16} aria-hidden="true" /> Tải bảng (CSV cho Excel)</button>
      </div>
      <p className="mt-3 text-sm text-ink-2" aria-live="polite">{full ? <>Đang hiển thị <span className="tnum font-semibold text-ink">{list.length}</span> / {total} dự án.</> : 'Đang tải toàn bộ bảng…'}</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[1000px] text-sm">
          <caption className="sr-only">Bảng đánh giá chất lượng các dự án</caption>
          <thead className="bg-surface-2 text-left text-xs text-ink-2">
            <tr>
              <th scope="col" className="px-2 py-2 text-right font-semibold">#</th>
              <Th c="name" className="min-w-[200px]">Dự án</Th>
              <th scope="col" className="px-2 py-2 font-semibold">Danh mục</th>
              <Th c="score" className="text-right">Điểm</Th>
              {CRIT.map((c, i) => <Th key={c} c={`b${i}`} className="text-right">{c}</Th>)}
              <Th c="stars" className="text-right">Sao</Th>
              <Th c="forks" className="text-right">Fork</Th>
              <Th c="updated">Commit gần nhất</Th>
              <th scope="col" className="px-2 py-2 font-semibold">Giấy phép</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.i} className="border-t border-line hover:bg-surface">
                <td className="tnum px-2 py-2 text-right text-ink-3">{i + 1}</td>
                <td className="px-2 py-2"><Link href={r.p ?? `https://github.com/${r.i}`} className="font-semibold hover:text-gold">{r.n}</Link><span className="block text-xs text-ink-3">{r.o}</span></td>
                <td className="px-2 py-2 text-xs text-ink-2">{catName[r.c[0]]}</td>
                <td className="tnum px-2 py-2 text-right font-bold">{r.sc}<span className="block text-[0.6875rem] font-medium text-ink-3">{r.tr ? TIER[r.tr].label : ''}</span></td>
                {(r.b || []).map((v, j) => <td key={j} className="tnum px-2 py-2 text-right">{v === null ? '—' : String(v).replace('.', ',')}</td>)}
                <td className="tnum px-2 py-2 text-right">{compact(r.st)}</td>
                <td className="tnum px-2 py-2 text-right">{compact(r.fk)}</td>
                <td className="tnum px-2 py-2">{date(r.lu)}</td>
                <td className="px-2 py-1"><LicenseStamp cls={r.lc} name={r.ls} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
