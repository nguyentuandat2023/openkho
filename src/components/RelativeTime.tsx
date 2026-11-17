'use client';
import { useEffect, useState } from 'react';
import { ago, date } from '@/lib/format';

/** Hiển thị ngày tuyệt đối khi build; sau khi tải trang mới tính "x ngày trước" theo giờ người xem. */
export default function RelativeTime({ iso, prefix = '', absolute = false }: { iso: string | null | undefined; prefix?: string; absolute?: boolean }) {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => { if (iso) setRel(ago(iso)); }, [iso]);
  if (!iso) return <span>—</span>;
  return (
    <time dateTime={iso} title={date(iso)} suppressHydrationWarning>
      {prefix}
      {rel && !absolute ? rel : date(iso)}
    </time>
  );
}
