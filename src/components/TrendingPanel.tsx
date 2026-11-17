import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { Automation, Repo, WindowKey } from '@/lib/types';
import { dateTime, num } from '@/lib/format';
import { COMPONENT_HELP, METHOD, WINDOW_LABEL, signedNum, spanText } from '@/lib/trend-labels';
import Tabs from './Tabs';

const KEYS: WindowKey[] = ['d1', 'd7', 'd30'];

/** Điểm xu hướng 3 kỳ của một repo: điểm, độ phủ, từng thành phần, lý do (số liệu thật), cảnh báo, phần thiếu. */
export default function TrendingPanel({ r, a }: { r: Repo; a: Automation }) {
  const t = r.trending;
  const tabs = KEYS.map((w) => {
    const x = t?.[w] || null;
    const label = WINDOW_LABEL[w];
    let content: React.ReactNode;
    if (!x) {
      content = (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
          Chưa đo được tăng trưởng {label.long}: cần hai lần đồng bộ cách nhau đúng kỳ (hoặc repo được tạo trong kỳ). Không có điểm nào được ước đoán.
        </p>
      );
    } else {
      const g = x.growth;
      content = (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-ink-3">Trending Score</p>
              <p className="tnum text-3xl font-extrabold leading-none">{x.score === null ? '—' : Math.round(x.score)}<span className="text-base font-semibold text-ink-3">/100</span></p>
            </div>
            {g && (
              <div>
                <p className="text-xs text-ink-3">Số sao thay đổi</p>
                <p className="tnum text-xl font-bold text-ok">{signedNum(g.delta)} <span className="text-sm font-medium text-ink-2">trong {spanText(g.span_hours)}</span></p>
              </div>
            )}
            <div>
              <p className="text-xs text-ink-3">Độ phủ dữ liệu</p>
              <p className="tnum text-xl font-bold">{Math.round(x.coverage * 100)}%</p>
            </div>
          </div>
          {g && (
            <p className="text-xs text-ink-3">
              Cách đo: {METHOD[g.method].label} — {METHOD[g.method].help} Từ <span className="tnum">{dateTime(g.from)}</span> đến <span className="tnum">{dateTime(g.to)}</span>
              {g.base_stars !== null && g.method !== 'created_in_window' && <> · đầu kỳ <span className="tnum">{num(g.base_stars)}</span> sao</>}.
            </p>
          )}
          {x.insufficient && (
            <p className="rounded-lg bg-surface-2 p-3 text-sm">Độ phủ dữ liệu {Math.round(x.coverage * 100)}% thấp hơn ngưỡng {Math.round(a.min_coverage * 100)}% nên repo chưa được xếp hạng trong kỳ này.</p>
          )}
          {x.warnings.map((wn) => (
            <p key={wn} role="note" className="flex gap-2 rounded-lg border border-warn bg-warn-soft p-3 text-sm"><AlertTriangle size={16} className="mt-0.5 flex-none text-warn" aria-hidden="true" />{wn}</p>
          ))}
          {x.reasons.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">Vì sao repo có điểm này</h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-2">{x.reasons.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-2">
            {a.components.map((c) => {
              const v = x.components[c.key];
              if (!v) return null;
              return (
                <div key={c.key} title={COMPONENT_HELP[c.key]}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{c.label} <span className="text-xs text-ink-3">· trọng số {Math.round(v.weight)}%</span></span>
                    <span className="tnum font-semibold">{v.value === null ? <span className="font-normal text-ink-3">không đủ dữ liệu</span> : `${Math.round(v.value)}/100`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    {v.value !== null && <div className="h-full rounded-full bg-gold" style={{ width: `${v.value}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
          {x.missing.length > 0 && <p className="text-xs text-ink-3">Chưa có dữ liệu: {x.missing.join(', ')} — phần này không được tính, điểm tính trên phần có dữ liệu.</p>}
        </div>
      );
    }
    return { key: w, label: label.tab, badge: x?.score != null ? String(Math.round(x.score)) : '—', content };
  });
  const initial = t?.d7 ? 1 : t?.d30 ? 2 : t?.d1 ? 0 : 1;
  return (
    <div>
      <Tabs label="Kỳ tính điểm xu hướng" tabs={tabs} initial={initial} />
      <p className="mt-4 text-xs text-ink-3">
        Trending Score tách biệt với Quality Score: đo đà phát triển hiện tại, không phải chất lượng tổng thể. Tính lúc <span className="tnum">{dateTime(a.ranking_computed_at)}</span>.{' '}
        <Link className="link" href="/phuong-phap/#xu-huong">Công thức đầy đủ</Link>
        {r.rank_prev && <> · Hôm qua xếp hạng #{r.rank_prev} theo điểm 7 ngày.</>}
      </p>
    </div>
  );
}
