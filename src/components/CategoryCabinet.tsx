import Link from 'next/link';
import type { Category } from '@/lib/types';
import { CategoryIcon } from './Icon';

/** "Tủ ngăn kéo": mỗi danh mục là một ngăn có nhãn và số dự án. */
export default function CategoryCabinet({ categories, active }: { categories: Category[]; active?: string }) {
  return (
    <nav aria-label="Danh mục" className="cabinet">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/danh-muc/${c.slug}/`}
              className="drawer h-full"
              style={{ ['--h' as string]: c.hue }}
              aria-current={active === c.slug ? 'page' : undefined}
              title={c.name}
            >
              <span className="flex items-center justify-between gap-2 text-ink-3">
                <span style={{ color: `oklch(var(--hue-l) var(--hue-c) ${c.hue})` }}>
                  <CategoryIcon name={c.icon} size={17} />
                </span>
                <span className="tnum text-xs">{c.count}</span>
              </span>
              <span className="drawer-label">{c.short}</span>
              <span className="drawer-pull" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
