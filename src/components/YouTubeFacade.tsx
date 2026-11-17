'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';

/** Chỉ tải trình phát YouTube khi người xem bấm (trang nhẹ hơn, không gửi dữ liệu cho YouTube trước khi cần). */
export default function YouTubeFacade({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <iframe
        className="aspect-video w-full rounded-xl border border-line"
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }
  return (
    <button type="button" onClick={() => setOn(true)} className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-line bg-surface-2" aria-label={`Phát video: ${title}`}>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg"><Play size={24} aria-hidden="true" fill="currentColor" /></span>
      </span>
    </button>
  );
}
