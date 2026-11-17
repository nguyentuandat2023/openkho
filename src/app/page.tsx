import Link from 'next/link';
import { Search } from 'lucide-react';
import { featured, getIndex, getLibrary, recentlyReleased, topScored, trending } from '@/lib/library';
import { asset } from '@/lib/site';
import { date, dateTime } from '@/lib/format';
import type { CompactRepo, Repo } from '@/lib/types';
import CategoryCabinet from '@/components/CategoryCabinet';
import FeaturedTile from '@/components/FeaturedTile';
import RankingTabs, { type RankItem } from '@/components/RankingTabs';
import RepoRow from '@/components/RepoRow';

const QUICK = [
  ['tạo video ngắn', 'tạo video ngắn bằng AI'],
  ['chatbot tài liệu', 'chatbot tài liệu'],
  ['thay Google Analytics', 'analytics'],
  ['tách nền ảnh', 'tách nền'],
  ['giọng đọc tiếng Việt', 'tiếng Việt'],
  ['n8n', 'n8n'],
  ['CRM', 'crm'],
];

export default function Home() {
  const lib = getLibrary();
  const idx = getIndex();
  const byId = new Map(idx.repos.map((r) => [r.i, r]));
  const cats = Object.fromEntries(lib.categories.map((c) => [c.slug, c]));
  const catLite = Object.fromEntries(lib.categories.map((c) => [c.slug, { slug: c.slug, short: c.short, hue: c.hue }]));
  const item = (r: Repo, metric?: string, metricNote?: string): RankItem => ({
    id: r.id, path: r.path, name: r.name, owner: r.owner, avatar: r.avatar_url, summary: r.summary || r.description || '',
    score: r.score?.total ?? null, tier: r.score?.tier ?? null, metric, metricNote,
  });
  const compactOf = (list: Repo[]) => list.map((r) => byId.get(r.id)).filter(Boolean) as CompactRepo[];

  const feat = featured(8);
  const top = topScored(10);
  const tr = trending(10);
  const fresh = recentlyReleased(10);
  const easy = topScored(6, (r) => r.difficulty === 'easy' && r.deploy.some((d) => d === 'desktop' || d === 'local') && r.platforms.includes('windows') && (r.applicability ?? 0) >= 4);
  const mkt = topScored(6, (r) => r.categories.some((c) => c === 'ai-marketing' || c === 'marketing-seo') && (r.applicability ?? 0) >= 4);

  return (
    <>
      <section className="page pb-12 pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <h1 className="text-[clamp(2.05rem,1.35rem+2.7vw,3.5rem)] font-extrabold leading-[1.14] tracking-[-0.02em]">
            Tìm công cụ mã nguồn mở phù hợp, dựa trên số liệu thật
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
            <span className="tnum">{lib.stats.visible}</span> dự án trên GitHub được tuyển chọn cho marketing, AI, tự động hóa và vận hành doanh nghiệp.
            Mỗi dự án có điểm đánh giá, quyền dùng thương mại và link tải từ nguồn chính chủ.
          </p>
          <form action={asset('/tim-kiem/')} method="get" role="search" className="mt-8 flex gap-2">
            <label htmlFor="hero-q" className="sr-only">Bạn cần công cụ để làm gì?</label>
            <div className="relative flex-1">
              <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
              <input id="hero-q" name="q" type="search" required placeholder="Bạn cần làm gì? Ví dụ: tách nền ảnh sản phẩm"
                className="field h-14 rounded-xl pl-12 text-base" autoComplete="off" enterKeyHint="search" />
            </div>
            <button type="submit" className="btn btn-primary h-14 rounded-xl px-6 text-base">Tìm</button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Thử tìm:</span>
            {QUICK.map(([label, q]) => (
              <Link key={label} href={`/tim-kiem/?q=${encodeURIComponent(q)}`} className="chip">{label}</Link>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-2">
            Số liệu lấy từ GitHub lúc <span className="tnum font-semibold text-ink">{dateTime(lib.synced_at)}</span>.{' '}
            <Link href="/phuong-phap/" className="link">Xem cách chấm điểm</Link>
          </p>
        </div>
      </section>

      <section className="page" aria-labelledby="h-cabinet">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="h-cabinet" className="text-2xl font-bold">Tủ danh mục</h2>
          <Link href="/danh-muc/" className="link text-sm">Mô tả từng danh mục</Link>
        </div>
        <CategoryCabinet categories={lib.categories} />
      </section>

      <section className="page mt-20" aria-labelledby="h-featured">
        <h2 id="h-featured" className="text-2xl font-bold">Biên tập chọn</h2>
        <p className="mt-1 max-w-2xl text-ink-2">Mỗi danh mục một công cụ nên thử trước, ưu tiên dễ dùng và dùng được cho công việc kinh doanh.</p>
        <ul className="mt-10 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {feat.map((r) => <li key={r.id}><FeaturedTile r={r} cat={cats[r.category]} /></li>)}
        </ul>
      </section>

      <section className="page mt-20 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div aria-labelledby="h-rank">
          <h2 id="h-rank" className="mb-4 text-2xl font-bold">Bảng xếp hạng</h2>
          <RankingTabs tabs={[
            { key: 'top', label: 'Đánh giá cao nhất', note: 'Theo điểm tổng hợp 6 tiêu chí (thang 100).', items: top.map((r) => item(r)), moreHref: '/tim-kiem/?sort=score', showScore: true },
            {
              key: 'trend', label: 'Đang lên',
              note: 'Theo Trending Score 7 ngày: số sao tăng thật trong kỳ, hoạt động mã nguồn, cộng đồng, tài liệu. Gồm cả repo hệ thống tự phát hiện trên GitHub.',
              items: tr.map((c) => ({
                id: c.i, path: c.p, external: c.u, name: c.n, owner: c.o, avatar: c.av, summary: c.d, score: null, tier: null,
                metric: `${Math.round(c.t7 ?? 0)} điểm`, metricNote: c.g.d7 ? `+${c.g.d7.gained.toLocaleString('vi-VN')} sao/7 ngày` : undefined,
              })),
              moreHref: '/xu-huong/', moreLabel: 'Xem trang Xu hướng',
              empty: 'Chưa đủ số liệu tăng trưởng 7 ngày — hệ thống đang đo, không ước đoán.',
            },
            { key: 'fresh', label: 'Vừa phát hành', note: 'Phiên bản ổn định mới nhất theo ngày phát hành trên GitHub.', items: fresh.map((r) => item(r, r.release!.tag.length > 18 ? `${r.release!.tag.slice(0, 17)}…` : r.release!.tag, date(r.release!.published_at))), moreHref: '/tim-kiem/?sort=release' },
          ]} />
        </div>
        <div className="grid content-start gap-12">
          <div aria-labelledby="h-easy">
            <h2 id="h-easy" className="text-xl font-bold">Dễ cài trên máy tính Windows</h2>
            <p className="mt-1 text-sm text-ink-2">Có bộ cài hoặc chạy được trên máy cá nhân, không cần máy chủ.</p>
            <div className="mt-2">{compactOf(easy).map((r) => <RepoRow key={r.i} r={r} cats={catLite} showCategory />)}</div>
          </div>
        </div>
      </section>

      <section className="page mt-20" aria-labelledby="h-mkt">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="h-mkt" className="text-2xl font-bold">Đề xuất cho đội marketing</h2>
            <p className="mt-1 text-ink-2">Video ngắn, mạng xã hội, email, đo lường và SEO.</p>
          </div>
          <Link href="/tim-kiem/?cat=ai-marketing,marketing-seo" className="link text-sm">Xem tất cả công cụ marketing</Link>
        </div>
        <div className="mt-2 grid gap-x-10 md:grid-cols-2">
          {compactOf(mkt).map((r) => <RepoRow key={r.i} r={r} cats={catLite} showCategory />)}
        </div>
      </section>

      <section className="page mt-20">
        <div className="panel grid gap-6 p-6 sm:p-8 md:grid-cols-3">
          <div>
            <h2 className="text-lg font-bold">Số liệu có nguồn và thời điểm</h2>
            <p className="mt-2 text-sm text-ink-2">Sao, fork, người đóng góp, giấy phép và bản phát hành được lấy tự động từ GitHub. Mỗi trang dự án ghi rõ lúc lấy dữ liệu.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold">Không chỉ đếm sao</h2>
            <p className="mt-2 text-sm text-ink-2">Số sao chỉ chiếm 15/100 điểm. Phần còn lại là chất lượng, mức độ cập nhật, tài liệu, cộng đồng và giá trị ứng dụng thực tế.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold">Cảnh báo rõ ràng</h2>
            <p className="mt-2 text-sm text-ink-2">Dự án đã ngừng phát triển, đổi tên, không còn tồn tại hoặc có giấy phép hạn chế đều được đánh dấu trước khi bạn tải về.</p>
          </div>
        </div>
      </section>
    </>
  );
}
