'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heart, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { useFavorites } from '@/lib/favorites';

export const NAV = [
  { href: '/xu-huong/', label: 'Xu hướng' },
  { href: '/danh-muc/', label: 'Danh mục' },
  { href: '/tim-kiem/', label: 'Tìm kiếm' },
  { href: '/bang-danh-gia/', label: 'Bảng đánh giá' },
  { href: '/phuong-phap/', label: 'Phương pháp' },
];

export function NavLinks() {
  const path = usePathname() || '/';
  return (
    <nav aria-label="Điều hướng chính" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV.map((n) => {
          const on = path.startsWith(n.href.replace(/\/$/, ''));
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={on ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-[0.9375rem] font-medium hover:bg-surface-2 ${on ? 'text-ink underline decoration-[var(--gold)] decoration-2 underline-offset-[6px]' : 'text-ink-2'}`}>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function FavLink() {
  const s = useFavorites();
  const n = Object.keys(s.favorites).length;
  return (
    <Link href="/yeu-thich/" className="btn btn-ghost btn-sm relative" aria-label={`Yêu thích${n ? ` (${n} dự án)` : ''}`}>
      <Heart size={18} aria-hidden="true" />
      <span className="hidden sm:inline">Yêu thích</span>
      {n > 0 && <span className="tnum min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-bold text-accent-ink">{n}</span>}
    </Link>
  );
}

type Mode = 'system' | 'light' | 'dark';
const KEY = 'openkho-theme';

function apply(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => {
    let saved: Mode = 'system';
    try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') saved = v; } catch {}
    setMode(saved);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { let cur: string | null = null; try { cur = localStorage.getItem(KEY); } catch {} if (cur !== 'light' && cur !== 'dark') apply('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const next: Record<Mode, Mode> = { system: 'dark', dark: 'light', light: 'system' };
  const label: Record<Mode, string> = { system: 'Giao diện theo hệ thống', dark: 'Giao diện tối', light: 'Giao diện sáng' };
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        const m = next[mode];
        setMode(m);
        try { if (m === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch {}
        apply(m);
      }}
      aria-label={`${label[mode]}. Bấm để chuyển sang ${label[next[mode]].toLowerCase()}`}
      title={label[mode]}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="md:hidden">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Đóng menu' : 'Mở menu'}>
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Điều hướng chính" className="absolute inset-x-0 top-full border-b border-line bg-bg shadow-lg">
          <ul className="page grid py-2">
            {[{ href: '/', label: 'Trang chủ' }, ...NAV, { href: '/yeu-thich/', label: 'Yêu thích' }].map((n) => (
              <li key={n.href}><Link href={n.href} className="block rounded-lg px-2 py-3 font-medium hover:bg-surface-2">{n.label}</Link></li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Phím tắt "/" để tìm kiếm. */
export function Shortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('main input[type="search"]');
      if (input) input.focus();
      else router.push('/tim-kiem/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return null;
}
