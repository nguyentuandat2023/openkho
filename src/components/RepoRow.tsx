import Link from 'next/link';
import { ArrowUpRight, Clock, GitFork, Star } from 'lucide-react';
import type { CompactRepo } from '@/lib/types';
import { compact } from '@/lib/format';
import { DIFFICULTY } from '@/lib/labels';
import ScoreSeal from './ScoreSeal';
import LicenseStamp from './LicenseStamp';
import FavoriteButton from './FavoriteButton';
import RelativeTime from './RelativeTime';

export interface CatLite { slug: string; short: string; hue: number }
export interface RowMetric { value: string; label: string }

/** Một dòng repo trong danh sách (dùng chung cho trang danh mục, tìm kiếm, yêu thích). */
export default function RepoRow({ r, cats, showCategory = false, metric }: { r: CompactRepo; cats?: Record<string, CatLite>; showCategory?: boolean; metric?: RowMetric }) {
  const primary = cats?.[r.c[0]];
  const linkCls = 'outline-none after:absolute after:inset-0 after:rounded-lg hover:text-gold focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-[var(--focus)]';
  return (
    <article className="relative flex gap-3 border-b border-line py-4 sm:gap-4">
      <img src={r.av} alt="" width={40} height={40} loading="lazy" decoding="async" className="h-10 w-10 flex-none rounded-lg bg-surface-2 object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.0625rem] font-semibold leading-snug">
              {r.p ? (
                <Link href={r.p} className={linkCls}>{r.n}</Link>
              ) : (
                <a href={`https://github.com/${r.i}`} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`} aria-label={`${r.n} (mở trên GitHub)`}>
                  {r.n}<ArrowUpRight size={14} aria-hidden="true" className="text-ink-3" />
                </a>
              )}
            </h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[0.8125rem] text-ink-3">
              <span className="truncate">{r.o}</span>
              {showCategory && primary && (
                <span className="inline-flex flex-none items-center gap-1.5" style={{ ['--h' as string]: primary.hue }}>
                  <span className="hue-dot" aria-hidden="true" />
                  {primary.short}
                </span>
              )}
            </p>
          </div>
          {metric ? (
            <div className="relative z-10 flex-none text-right">
              <p className="tnum text-base font-bold leading-none text-ok">{metric.value}</p>
              <p className="mt-1 max-w-[9rem] text-[0.6875rem] leading-tight text-ink-3">{metric.label}</p>
            </div>
          ) : <ScoreSeal score={r.sc} tier={r.tr} size={42} />}
        </div>
        <p className="clamp-2 mt-1.5 text-[0.9375rem] text-ink-2">{r.s || r.d}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-2">
          {r.st !== null && (
            <span className="tnum inline-flex items-center gap-1" title="Số sao trên GitHub">
              <Star size={14} aria-hidden="true" /> {compact(r.st)}
              <span className="sr-only">sao</span>
            </span>
          )}
          {r.fk !== null && (
            <span className="tnum inline-flex items-center gap-1" title="Số fork">
              <GitFork size={14} aria-hidden="true" /> {compact(r.fk)}
              <span className="sr-only">fork</span>
            </span>
          )}
          {r.lu && (
            <span className="inline-flex items-center gap-1" title="Commit gần nhất">
              <Clock size={14} aria-hidden="true" /> <RelativeTime iso={r.lu} />
            </span>
          )}
          {r.df && <span className="text-ink-3">{DIFFICULTY[r.df]}</span>}
          <LicenseStamp cls={r.lc} name={r.ls} compact />
          {r.ar && <span className="stamp tone-warn">Đã lưu trữ</span>}
          {!r.v && <span className="stamp tone-danger">Không còn tồn tại</span>}
          {r.an && <span className="stamp tone-warn">Cần lưu ý số sao</span>}
          {r.og === 'r' && <span className="stamp tone-info" title="Tự động phát hiện qua GitHub Search API, chưa qua biên tập">Tự phát hiện</span>}
          {r.gem && <span className="stamp tone-gold">Viên ngọc ẩn</span>}
        </div>
      </div>
      <FavoriteButton id={r.i} className="relative z-10 -mr-1 self-start" />
    </article>
  );
}
