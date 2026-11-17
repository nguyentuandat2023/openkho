import type { Metadata } from 'next';
import Link from 'next/link';
import { getLibrary, topScored } from '@/lib/library';
import { CategoryIcon } from '@/components/Icon';
import CategoryCabinet from '@/components/CategoryCabinet';

export const metadata: Metadata = {
  title: 'Danh mục công nghệ',
  description: 'Tất cả danh mục của thư viện: AI, tự động hóa, marketing, video, thiết kế, CRM, thương mại điện tử, tự host, lập trình và hơn thế nữa.',
  alternates: { canonical: '/danh-muc/' },
};

export default function CategoriesPage() {
  const lib = getLibrary();
  return (
    <div className="page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Danh mục</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        {lib.categories.length} danh mục, gồm 20 nhóm theo yêu cầu và 2 nhóm bổ sung (Giọng nói AI, Học tập). Một dự án có thể thuộc nhiều danh mục.
      </p>
      <div className="mt-8"><CategoryCabinet categories={lib.categories} /></div>
      <ul className="mt-14 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
        {lib.categories.map((c) => {
          const top = topScored(3, (r) => r.categories.includes(c.slug));
          return (
            <li key={c.slug} className="border-t border-line pt-6" style={{ ['--h' as string]: c.hue }}>
              <div className="flex items-start gap-3">
                <span className="mt-1 grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2" style={{ color: `oklch(var(--hue-l) var(--hue-c) ${c.hue})` }}>
                  <CategoryIcon name={c.icon} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold"><Link href={`/danh-muc/${c.slug}/`} className="hover:text-gold">{c.name}</Link></h2>
                  <p className="mt-1 text-[0.9375rem] text-ink-2">{c.description}</p>
                  <p className="mt-3 text-sm text-ink-3"><span className="tnum font-semibold text-ink">{c.count}</span> dự án. Điểm cao nhất:</p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {top.map((r) => <li key={r.id}><Link className="link" href={r.path}>{r.name}</Link></li>)}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
