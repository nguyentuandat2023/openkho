import { date, num } from '@/lib/format';

/**
 * Biểu đồ số sao theo ngày — chỉ vẽ các lần đo THẬT (mỗi ngày một điểm: lần đo cuối ngày).
 * Không nội suy điểm thiếu: đoạn nối giữa hai lần đo cách xa nhau được vẽ nét đứt.
 * Dựng sẵn thành SVG khi build (không cần JavaScript).
 */
export default function StarChart({ points, name }: { points: [number, number][]; name: string }) {
  if (!points || points.length < 2) return null;
  const W = 640;
  const H = 200;
  const P = { l: 56, r: 12, t: 14, b: 28 };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08;
  y0 = Math.max(0, y0 - pad);
  y1 += pad;
  const sx = (t: number) => P.l + ((t - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const DAY = 86400000;
  const segs: { d: string; dashed: boolean }[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ta, va] = points[i - 1];
    const [tb, vb] = points[i];
    segs.push({ d: `M${sx(ta).toFixed(1)},${sy(va).toFixed(1)}L${sx(tb).toFixed(1)},${sy(vb).toFixed(1)}`, dashed: tb - ta > 1.5 * DAY });
  }
  const ticks = [y0, (y0 + y1) / 2, y1].map((v) => Math.round(v));
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last[1] - first[1];
  const summary = `Số sao của ${name}: ${num(first[1])} ngày ${date(new Date(first[0]).toISOString())}, ${num(last[1])} ngày ${date(new Date(last[0]).toISOString())} (${delta >= 0 ? 'tăng' : 'giảm'} ${num(Math.abs(delta))}), ${points.length} lần đo.`;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={P.l - 8} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" className="tnum">{v.toLocaleString('vi-VN')}</text>
          </g>
        ))}
        {segs.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke="var(--gold)" strokeWidth="2.25" strokeLinecap="round" strokeDasharray={s.dashed ? '5 5' : undefined} />
        ))}
        {points.map(([t, v]) => <circle key={t} cx={sx(t)} cy={sy(v)} r={points.length > 60 ? 1.6 : 3} fill="var(--gold)" />)}
        <text x={P.l} y={H - 8} fontSize="11" fill="var(--ink-3)">{date(new Date(first[0]).toISOString())}</text>
        <text x={W - P.r} y={H - 8} fontSize="11" fill="var(--ink-3)" textAnchor="end">{date(new Date(last[0]).toISOString())}</text>
      </svg>
      <figcaption className="mt-2 text-xs text-ink-3">
        {points.length} lần đo thật (mỗi ngày giữ lần đo cuối cùng, giờ UTC). Nét đứt: giữa hai lần đo cách nhau hơn một ngày — không có số liệu ở giữa, không nội suy.
      </figcaption>
      <table className="sr-only">
        <caption>Số sao theo ngày đo</caption>
        <thead><tr><th>Ngày</th><th>Số sao</th></tr></thead>
        <tbody>{points.map(([t, v]) => <tr key={t}><td>{date(new Date(t).toISOString())}</td><td>{v}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
