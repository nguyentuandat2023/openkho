'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import ScoreSeal from './ScoreSeal';
import type { TierKey } from '@/lib/types';

export interface RankItem {
  id: string;
  path: string | null;
  /** Link ngoài (GitHub) khi repo chưa có trang riêng */
  external?: string;
  name: string;
  owner: string;
  avatar: string;
  summary: string;
  score: number | null;
  tier: TierKey | null;
  metric?: string;
  metricNote?: string;
}

export interface RankTab {
  key: string;
  label: string;
  note: string;
  items: RankItem[];
  moreHref: string;
  moreLabel?: string;
  showScore?: boolean;
  empty?: string;
}

/** Bảng xếp hạng nhiều tab (thứ hạng là một trình tự nên có đánh số). */
export default function RankingTabs({ tabs }: { tabs: RankTab[] }) {
  const [active, setActive] = useState(0);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else return;
    e.preventDefault();
    setActive(n);
    refs.current[n]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label="Bảng xếp hạng" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`${uid}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${uid}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active === i ? 'bg-raised text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${uid}-panel-${i}`} aria-labelledby={`${uid}-tab-${i}`} hidden={active !== i} className="mt-3">
          <p className="text-sm text-ink-2">{t.note}</p>
          {t.items.length === 0 && t.empty && <p className="mt-3 rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">{t.empty}</p>}
          <ol className="mt-2">
            {t.items.map((r, idx) => (
              <li key={r.id} className="relative grid grid-cols-[1.75rem_36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3">
                <span className="tnum text-right text-sm font-bold text-ink-3">{idx + 1}</span>
                <img src={r.avatar} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 rounded-lg bg-surface-2 object-cover" />
                <div className="min-w-0">
                  {r.path
                    ? <Link href={r.path} className="font-semibold after:absolute after:inset-0 hover:text-gold">{r.name}</Link>
                    : <a href={r.external} target="_blank" rel="noopener noreferrer" aria-label={`${r.name} (mở trên GitHub)`} className="font-semibold after:absolute after:inset-0 hover:text-gold">{r.name} <span aria-hidden="true" className="text-ink-3">↗</span></a>}
                  <p className="truncate text-sm text-ink-3">{r.summary}</p>
                </div>
                <div className="text-right">
                  {t.showScore ? <ScoreSeal score={r.score} tier={r.tier} size={38} /> : (
                    <>
                      <p className="tnum text-sm font-semibold">{r.metric}</p>
                      {r.metricNote && <p className="tnum text-xs text-ink-3">{r.metricNote}</p>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <Link href={t.moreHref} className="link mt-3 inline-block text-sm">{t.moreLabel || 'Xem đầy đủ trong Tìm kiếm'}</Link>
        </div>
      ))}
    </div>
  );
}
