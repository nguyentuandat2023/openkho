'use client';
import { Heart } from 'lucide-react';
import { fav, useFavorites } from '@/lib/favorites';

export default function FavoriteButton({ id, label = false, className = '' }: { id: string; label?: boolean; className?: string }) {
  const state = useFavorites();
  const on = Boolean(state.favorites[id]);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); fav.toggle(id); }}
      aria-pressed={on}
      aria-label={on ? `Bỏ lưu ${id}` : `Lưu ${id} vào Yêu thích`}
      title={on ? 'Bỏ khỏi Yêu thích' : 'Lưu vào Yêu thích'}
      className={`${label ? 'btn' : 'inline-grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-2'} ${className}`}
    >
      <Heart size={18} strokeWidth={1.9} aria-hidden="true" fill={on ? 'var(--danger)' : 'none'} color={on ? 'var(--danger)' : 'currentColor'} />
      {label && <span>{on ? 'Đã lưu' : 'Lưu'}</span>}
    </button>
  );
}
