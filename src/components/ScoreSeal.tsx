import { TIER } from '@/lib/labels';
import type { TierKey } from '@/lib/types';

const TONE_VAR: Record<string, string> = { gold: 'var(--gold)', ok: 'var(--ok)', info: 'var(--info)', warn: 'var(--warn)' };

/** Con dấu điểm: vòng tròn thể hiện điểm /100, màu theo hạng. */
export default function ScoreSeal({ score, tier, size = 44, showLabel = false }: { score: number | null; tier: TierKey | null; size?: number; showLabel?: boolean }) {
  if (score === null || !tier) {
    return <span className="tnum text-xs text-ink-3" title="Chưa đồng bộ số liệu">—</span>;
  }
  const t = TIER[tier];
  const r = 19;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 100));
  return (
    <span className="inline-flex items-center gap-2" title={`Điểm ${Math.round(score)}/100 – ${t.label}`}>
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden="true">
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={TONE_VAR[t.tone]} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(pct * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 22 22)" />
        </svg>
        <span className="tnum absolute font-bold" style={{ fontSize: size * 0.34 }}>
          {Math.round(score)}
          <span className="sr-only"> điểm trên 100, hạng {t.label}</span>
        </span>
      </span>
      {showLabel && <span className="text-sm font-semibold" style={{ color: TONE_VAR[t.tone] }}>{t.label}</span>}
    </span>
  );
}
