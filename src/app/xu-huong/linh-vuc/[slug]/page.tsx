import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArea, getLibrary } from '@/lib/library';
import { num } from '@/lib/format';
import Tabs from '@/components/Tabs';
import FreshnessNote from '@/components/FreshnessNote';
import { HubList } from '@/components/HubCardRow';
import { CategoryIcon } from '@/components/Icon';

export const dynamicParams = false;

export function generateStaticParams() {
  return getLibrary().areas.map((a) => ({ slug: a.slug }));
}

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const a = getArea(slug);
  if (!a) return {};
  const lists = getLibrary().area_lists[slug];
  return {
    title: `${a.name} (${a.en}): repository GitHub đang lên và chất lượng cao`,
    description: `${a.description} ${num(lists?.count ?? 0)} repository đang được theo dõi, xếp theo điểm xu hướng và chất lượng, cập nhật tự động.`,
    alternates: { canonical: `/xu-huong/linh-vuc/${slug}/` },
    // Lĩnh vực quá ít repo → không lập chỉ mục (tránh trang mỏng)
    robots: (lists?.count ?? 0) < 5 ? { index: false, follow: true } : undefined,
  };
}

export default async function AreaPage({ params }: P) {
  const { slug } = await params;
  const lib = getLibrary();
  const a = getArea(slug);
  if (!a) notFound();
  const lists = lib.area_lists[slug];
  const areaNames = Object.fromEntries(lib.areas.map((x) => [x.slug, x.name]));
  const others = lib.areas.filter((x) => x.slug !== slug);
  return (
    <div className="page pt-8">
      <nav aria-label="Đường dẫn" className="text-sm text-ink-3">
        <Link href="/xu-huong/" className="hover:text-ink">Xu hướng</Link> <span aria-hidden="true">/</span>{' '}
        <Link href="/xu-huong/#linh-vuc" className="hover:text-ink">Lĩnh vực</Link>
      </nav>
      <header className="mt-4 max-w-3xl">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          <CategoryIcon name={a.icon} size={30} className="flex-none text-ink-3" />
          {a.name}
        </h1>
        <p lang="en" className="mt-1 text-sm text-ink-3">{a.en}</p>
        <p className="mt-3 text-lg text-ink-2">{a.description}</p>
        <p className="mt-2 text-sm text-ink-2"><span className="tnum font-semibold text-ink">{num(lists.count)}</span> repository đang theo dõi thuộc lĩnh vực này (một repo có thể thuộc nhiều lĩnh vực).</p>
      </header>
      <div className="mt-4"><FreshnessNote a={lib.automation} compact /></div>

      <div className="mt-8 max-w-4xl">
        <Tabs label="Danh sách" tabs={[
          { key: 'trending', label: 'Đang lên (7 ngày)', badge: String(lists.trending.length), content: <HubList items={lists.trending} metric={{ kind: 'trending', window: 'd7' }} ranked areaNames={areaNames} empty="Chưa có repo nào trong lĩnh vực này có đủ số liệu tăng trưởng 7 ngày." /> },
          { key: 'top', label: 'Chất lượng cao', badge: String(lists.top_rated.length), content: <HubList items={lists.top_rated} metric={{ kind: 'quality' }} ranked areaNames={areaNames} empty="Chưa có repo đủ độ phủ dữ liệu để xếp hạng chất lượng." /> },
          { key: 'new', label: 'Mới (90 ngày)', badge: String(lists.newest.length), content: <HubList items={lists.newest} metric={{ kind: 'stars' }} ranked areaNames={areaNames} empty="Chưa phát hiện repo mới trong 90 ngày." /> },
          { key: 'popular', label: 'Phổ biến', badge: String(lists.popular.length), content: <HubList items={lists.popular} metric={{ kind: 'stars' }} ranked areaNames={areaNames} empty="Chưa có dữ liệu." /> },
        ]} />
        <p className="mt-6 text-sm"><Link className="link" href={`/tim-kiem/?src=all&area=${slug}`}>Tìm và lọc tất cả repo thuộc lĩnh vực {a.name}</Link></p>
      </div>

      <section aria-labelledby="h-other" className="mt-14">
        <h2 id="h-other" className="text-lg font-bold">Lĩnh vực khác</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((x) => <li key={x.slug}><Link className="chip" href={`/xu-huong/linh-vuc/${x.slug}/`}>{x.name} <span className="tnum text-ink-3">{num(x.count)}</span></Link></li>)}
        </ul>
      </section>
    </div>
  );
}
