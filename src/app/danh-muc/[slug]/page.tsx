import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compactFor, getCategory, getLibrary } from '@/lib/library';
import { sortRepos } from '@/lib/filters';
import { dateTime } from '@/lib/format';
import { CategoryIcon } from '@/components/Icon';
import RepoBrowser from '@/components/RepoBrowser';

export const dynamicParams = false;

export function generateStaticParams() {
  return getLibrary().categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getCategory(slug);
  if (!c) return {};
  return {
    title: `${c.name} – ${c.count} dự án mã nguồn mở`,
    description: c.description,
    alternates: { canonical: `/danh-muc/${c.slug}/` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lib = getLibrary();
  const c = getCategory(slug);
  if (!c) notFound();
  const docs = sortRepos(compactFor((r) => r.c.includes(slug)), 'score');
  const cats = lib.categories.map(({ slug: s, short, hue, name }) => ({ slug: s, short, hue, name }));
  const others = lib.categories.filter((x) => x.slug !== slug);
  return (
    <div className="page pt-8">
      <nav aria-label="Đường dẫn" className="text-sm text-ink-3">
        <Link href="/" className="hover:text-ink">Trang chủ</Link> <span aria-hidden="true">/</span>{' '}
        <Link href="/danh-muc/" className="hover:text-ink">Danh mục</Link>
      </nav>
      <header className="mt-4 flex items-start gap-4" style={{ ['--h' as string]: c.hue }}>
        <span className="mt-1 hidden h-12 w-12 flex-none place-items-center rounded-xl bg-surface-2 sm:grid" style={{ color: `oklch(var(--hue-l) var(--hue-c) ${c.hue})` }}>
          <CategoryIcon name={c.icon} size={24} />
        </span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{c.name}</h1>
          <p className="mt-2 max-w-3xl text-ink-2">{c.description}</p>
          <p className="mt-2 text-sm text-ink-3">
            <span className="tnum font-semibold text-ink">{c.count}</span> dự án. Số liệu cập nhật lúc <span className="tnum">{dateTime(lib.synced_at)}</span>.
          </p>
        </div>
      </header>
      <div className="mt-8">
        <RepoBrowser initial={docs} categories={cats} areas={lib.areas.map(({ slug: s, name }) => ({ slug: s, name }))} lockedCategory={slug} searchPlaceholder={`Tìm trong ${c.short}…`} />
      </div>
      <nav aria-label="Danh mục khác" className="mt-16 border-t border-line pt-6">
        <h2 className="text-lg font-bold">Danh mục khác</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/danh-muc/${o.slug}/`} className="chip" style={{ ['--h' as string]: o.hue }}>
                <span className="hue-dot" aria-hidden="true" /> {o.short} <span className="tnum text-ink-3">{o.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
