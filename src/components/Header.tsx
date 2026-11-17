import Link from 'next/link';
import { Search } from 'lucide-react';
import { site } from '@/lib/site';
import { FavLink, MobileMenu, NavLinks, Shortcuts, ThemeToggle } from './HeaderClient';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect x="2.5" y="4.5" width="27" height="23" rx="4.5" fill="var(--accent)" />
      <rect x="8.5" y="9.5" width="15" height="6.5" rx="1.2" fill="none" stroke="var(--accent-ink)" strokeWidth="1.7" />
      <rect x="12" y="20.5" width="8" height="2.6" rx="1.3" fill="var(--accent-ink)" />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--bg)_90%,transparent)] backdrop-blur-md">
      <div className="page relative flex h-16 items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 text-[1.1875rem] font-extrabold tracking-tight" aria-label={`${site.name} – trang chủ`}>
          <LogoMark />
          <span>{site.name}</span>
        </Link>
        <div className="ml-4 hidden md:block"><NavLinks /></div>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/tim-kiem/" className="btn btn-ghost btn-sm md:hidden" aria-label="Tìm kiếm">
            <Search size={18} aria-hidden="true" />
          </Link>
          <FavLink />
          <ThemeToggle />
          <MobileMenu />
        </div>
        <Shortcuts />
      </div>
    </header>
  );
}
