import Link from 'next/link';
import { Star } from 'lucide-react';
import type { Category, Repo } from '@/lib/types';
import { compact } from '@/lib/format';
import { DIFFICULTY } from '@/lib/labels';
import ScoreSeal from './ScoreSeal';
import LicenseStamp from './LicenseStamp';

/** Thẻ "mục lục" cho dự án biên tập chọn: tab màu trên cùng cho biết danh mục. */
export default function FeaturedTile({ r, cat }: { r: Repo; cat?: Category }) {
  return (
    <article className="relative flex h-full flex-col rounded-b-xl rounded-tr-xl border border-line bg-surface p-5 pt-6 transition-colors hover:border-line-strong" style={{ ['--h' as string]: cat?.hue ?? 210 }}>
      <span className="absolute -top-px left-[-1px] inline-flex -translate-y-full items-center gap-1.5 rounded-t-md border border-b-0 border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2">
        <span className="hue-dot" aria-hidden="true" />
        {cat?.short}
      </span>
      <div className="flex items-start justify-between gap-3">
        <img src={r.avatar_url} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 rounded-xl bg-surface-2 object-cover" />
        <ScoreSeal score={r.score?.total ?? null} tier={r.score?.tier ?? null} />
      </div>
      <h3 className="mt-4 text-lg font-bold leading-snug">
        <Link href={r.path} className="after:absolute after:inset-0 hover:text-gold">{r.name}</Link>
      </h3>
      <p className="text-[0.8125rem] text-ink-3">{r.owner}</p>
      <p className="clamp-3 mt-2 text-[0.9375rem] text-ink-2">{r.summary || r.description}</p>
      {r.use_cases[0] && <p className="mt-3 text-sm"><span className="text-ink-3">Dùng để </span>{r.use_cases[0].charAt(0).toLowerCase() + r.use_cases[0].slice(1)}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[0.8125rem] text-ink-2">
        <LicenseStamp cls={r.license.class} name={r.license.display} compact />
        {r.stats && <span className="tnum inline-flex items-center gap-1"><Star size={13} aria-hidden="true" /> {compact(r.stats.stars)}</span>}
        {r.difficulty && <span>{DIFFICULTY[r.difficulty]}</span>}
      </div>
    </article>
  );
}
