'use client';
import { useId, useRef, useState, type ReactNode } from 'react';

export interface TabDef { key: string; label: string; badge?: string; content: ReactNode }

/**
 * Tab đơn giản: nội dung mọi tab được dựng sẵn phía máy chủ (HTML tĩnh, tốt cho SEO);
 * JavaScript chỉ bật/tắt tab đang xem. Hỗ trợ bàn phím (← →, Home, End).
 */
export default function Tabs({ tabs, label, initial = 0 }: { tabs: TabDef[]; label: string; initial?: number }) {
  const [active, setActive] = useState(initial);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(n);
    refs.current[n]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`${uid}-t-${t.key}`}
            aria-selected={i === active}
            aria-controls={`${uid}-p-${t.key}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${i === active ? 'bg-raised text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.label}
            {t.badge && <span className={`tnum ml-1.5 text-xs font-medium text-ink-3`}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${uid}-p-${t.key}`} aria-labelledby={`${uid}-t-${t.key}`} hidden={i !== active} className="mt-3">
          {t.content}
        </div>
      ))}
    </div>
  );
}
