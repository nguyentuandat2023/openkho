import Link from 'next/link';
import { ArrowUpRight, Clock, GitFork, Gem, Pin, Star } from 'lucide-react';
import type { HubCard, WindowKey } from '@/lib/types';
import { compact } from '@/lib/format';
import { METHOD, WINDOW_LABEL, signedNum, spanText } from '@/lib/trend-labels';
import LicenseStamp from './LicenseStamp';
import RelativeTime from './RelativeTime';

export type Metric =
  | { kind: 'trending'; window: WindowKey }
  | { kind: 'growth'; window: WindowKey }
  | { kind: 'quality' }
  | { kind: 'gem' }
  | { kind: 'stars' }
  | { kind: 'created' }
  | { kind: 'activity' };

function MetricBox({ c, m }: { c: HubCard; m: Metric }) {
  if (m.kind === 'trending') {
    const s = c[m.window === 'd1' ? 't1' : m.window === 'd7' ? 't7' : 't30'];
    const g = c.g[m.window];
    return (
      <div className="text-right">
        <p className="tnum text-lg font-bold leading-none" title="Trending Score (0–100)">{s === null ? '—' : Math.round(s)}</p>
        <p className="mt-1 text-[0.6875rem] text-ink-3">điểm xu hướng</p>
        {g && <p className="tnum mt-0.5 text-xs font-semibold text-ok">{signedNum(g.gained)} sao</p>}
      </div>
    );
  }
  if (m.kind === 'growth') {
    const g = c.g[m.window];
    if (!g) return null;
    return (
      <div className="text-right">
        <p className="tnum text-base font-bold leading-none text-ok">{signedNum(g.delta)}</p>
        <p className="mt-1 text-[0.6875rem] text-ink-3" title={METHOD[g.method].help}>sao · {spanText(g.span_hours)}</p>
        <p className="text-[0.6875rem] text-ink-3">{METHOD[g.method].label}</p>
      </div>
    );
  }
  if (m.kind === 'quality') {
    return (
      <div className="text-right">
        <p className="tnum text-lg font-bold leading-none">{c.q ?? '—'}<span className="text-xs font-medium text-ink-3">/100</span></p>
        <p className="mt-1 text-[0.6875rem] text-ink-3">chất lượng</p>
        {c.qc !== null && <p className="tnum text-[0.6875rem] text-ink-3">độ phủ {Math.round(c.qc * 100)}%</p>}
      </div>
    );
  }
  if (m.kind === 'gem') {
    return (
      <div className="text-right" title="Quality Score không tính nhóm Mức độ phổ biến">
        <p className="tnum text-lg font-bold leading-none">{c.gq === null ? '—' : Math.round(c.gq)}<span className="text-xs font-medium text-ink-3">/100</span></p>
        <p className="mt-1 text-[0.6875rem] text-ink-3">chất lượng*</p>
        <p className="tnum text-[0.6875rem] text-ink-3">{compact(c.st)} sao</p>
      </div>
    );
  }
  if (m.kind === 'stars') {
    return (
      <div className="text-right">
        <p className="tnum text-base font-bold leading-none">{compact(c.st)}</p>
        <p className="mt-1 text-[0.6875rem] text-ink-3">sao</p>
      </div>
    );
  }
  if (m.kind === 'created') {
    return (
      <div className="text-right text-xs text-ink-2">
        <p className="text-[0.6875rem] text-ink-3">tạo</p>
        <p className="font-semibold"><RelativeTime iso={c.cr} /></p>
      </div>
    );
  }
  return (
    <div className="text-right">
      <p className="tnum text-base font-bold leading-none" title={c.c90e ? 'Ước tính từ nhịp 20 commit gần nhất (feed Atom chỉ trả 20 mục)' : undefined}>{c.c90 === null ? '—' : `${c.c90e ? '≈' : ''}${c.c90.toLocaleString('vi-VN')}`}</p>
      <p className="mt-1 text-[0.6875rem] text-ink-3">commit/90 ngày{c.c90e ? ' (ước tính)' : ''}</p>
    </div>
  );
}

/** Một dòng repo trên trang Xu hướng. Repo chưa có trang riêng → link thẳng tới GitHub (mở tab mới). */
export default function HubCardRow({ c, metric, rank, areaNames }: { c: HubCard; metric: Metric; rank?: number; areaNames?: Record<string, string> }) {
  const external = !c.p;
  const linkCls = 'outline-none after:absolute after:inset-0 after:rounded-lg hover:text-gold focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-[var(--focus)]';
  return (
    <li className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-3.5">
      <div className="flex items-center gap-2">
        {rank !== undefined && <span className="tnum w-5 text-right text-sm font-bold text-ink-3">{rank}</span>}
        <img src={c.av} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 flex-none rounded-lg bg-surface-2 object-cover" />
      </div>
      <div className="min-w-0">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[0.9875rem] font-semibold leading-snug">
          {external ? (
            <a href={c.u} target="_blank" rel="noopener noreferrer" className={`${linkCls} truncate`} aria-label={`${c.o}/${c.n} (mở trên GitHub)`}>
              <span className="font-normal text-ink-3">{c.o}/</span>{c.n}
            </a>
          ) : (
            <Link href={c.p!} className={`${linkCls} truncate`}><span className="font-normal text-ink-3">{c.o}/</span>{c.n}</Link>
          )}
          {external && <ArrowUpRight size={14} className="flex-none text-ink-3" aria-hidden="true" />}
          {c.pin && <Pin size={13} className="flex-none text-gold" aria-label="Biên tập viên ghim" />}
        </h3>
        {c.d && <p className="clamp-2 mt-0.5 text-sm text-ink-2">{c.d}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="tnum inline-flex items-center gap-1"><Star size={13} aria-hidden="true" />{compact(c.st)}<span className="sr-only"> sao</span></span>
          <span className="tnum inline-flex items-center gap-1"><GitFork size={13} aria-hidden="true" />{compact(c.fk)}<span className="sr-only"> fork</span></span>
          {c.l && <span>{c.l}</span>}
          {c.lu && (
            <span className="inline-flex items-center gap-1" title={c.la === 'commit' ? 'Commit gần nhất trên nhánh chính' : 'Lần push mã gần nhất (chưa xác minh commit nhánh chính)'}>
              <Clock size={13} aria-hidden="true" />{c.la === 'commit' ? 'commit' : 'push'} <RelativeTime iso={c.lu} />
            </span>
          )}
          <LicenseStamp cls={c.lc} name={c.ls} compact />
          {c.og === 'radar' && <span className="stamp tone-info" title="Hệ thống tự động phát hiện qua GitHub Search API, chưa qua biên tập">Tự phát hiện</span>}
          {c.gem && <span className="stamp tone-gold inline-flex items-center gap-1" title={c.gem}><Gem size={11} aria-hidden="true" />Viên ngọc ẩn</span>}
          {c.an && <span className="stamp tone-warn" title="Tăng sao bất thường so với fork/người đóng góp — điểm tăng trưởng đã bị giảm trọng số">Cần kiểm chứng</span>}
          {c.ar && <span className="stamp tone-warn">Đã lưu trữ</span>}
          {areaNames && c.ae.slice(0, 2).map((a) => areaNames[a] && <span key={a} className="text-ink-3">#{areaNames[a]}</span>)}
        </div>
      </div>
      <div className="relative z-10 min-w-[4.5rem] pt-0.5"><MetricBox c={c} m={metric} /></div>
    </li>
  );
}

export function HubList({ items, metric, empty, ranked = false, areaNames }: { items: HubCard[]; metric: Metric; empty: React.ReactNode; ranked?: boolean; areaNames?: Record<string, string> }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-ink-2">{empty}</div>;
  return (
    <ol className="list-none">
      {items.map((c, i) => <HubCardRow key={c.i} c={c} metric={metric} rank={ranked ? i + 1 : undefined} areaNames={areaNames} />)}
    </ol>
  );
}

export const windowLabel = (w: WindowKey) => WINDOW_LABEL[w];
