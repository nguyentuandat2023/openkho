// Định dạng số và ngày theo thói quen người Việt (12,3k · 16/11/2026 · giờ Việt Nam).

const TZ = 'Asia/Ho_Chi_Minh';

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('vi-VN');
}

/** 1234 → "1,2k"; 1234567 → "1,2 tr". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',')}k`;
  }
  const v = n / 1_000_000;
  return `${v.toFixed(1).replace(/\.0$/, '').replace('.', ',')} tr`;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${t}, ${date(iso)}`;
}

/** "3 ngày trước" – chỉ dùng phía trình duyệt (xem RelativeTime) để không lệch với thời điểm build. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  const d = Math.round(s / 86400);
  if (d < 31) return `${d} ngày trước`;
  if (d < 365) return `${Math.round(d / 30)} tháng trước`;
  const y = d / 365;
  return `${y >= 2 ? Math.round(y) : y.toFixed(1).replace('.', ',')} năm trước`;
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1).replace('.', ',')} ${u[i]}`;
}

export function perDay(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 100) return `${Math.round(v).toLocaleString('vi-VN')}`;
  return v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}
