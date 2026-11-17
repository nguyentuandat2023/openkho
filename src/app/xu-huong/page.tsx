import type { Metadata } from 'next';
import Link from 'next/link';
import { Gem, Pin } from 'lucide-react';
import { getLibrary } from '@/lib/library';
import { dateTime, num } from '@/lib/format';
import { WINDOW_LABEL } from '@/lib/trend-labels';
import type { HubCard, WindowKey } from '@/lib/types';
import Tabs from '@/components/Tabs';
import FreshnessNote from '@/components/FreshnessNote';
import { HubList } from '@/components/HubCardRow';
import { CategoryIcon as Icon } from '@/components/Icon';
import { absoluteUrl } from '@/lib/site';

/** Dữ liệu có cấu trúc (schema.org ItemList) cho danh sách đang thịnh hành. */
function itemListLd(items: HubCard[]) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Repository GitHub đang thịnh hành (7 ngày)',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: items.length,
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: `${c.o}/${c.n}`, url: c.p ? absoluteUrl(c.p) : c.u })),
  }).replace(/</g, '\\u003c');
}

export const metadata: Metadata = {
  title: 'Xu hướng GitHub: repository mới nổi, tăng sao nhanh, chất lượng cao',
  description: 'Khám phá repository GitHub đang lên, mới nổi và chất lượng cao — tự động cập nhật từ GitHub API, điểm xu hướng có công thức công khai, không bịa số liệu tăng trưởng.',
  alternates: { canonical: '/xu-huong/' },
  openGraph: { title: 'Discover the Best & Trending GitHub Repositories', description: 'Explore emerging open-source projects, trending developer tools, and high-quality GitHub repositories — automatically updated.' },
};

const WINDOWS: WindowKey[] = ['d1', 'd7', 'd30'];

function Section({ id, title, desc, more, children }: { id: string; title: string; desc: React.ReactNode; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="scroll-mt-24 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id={`h-${id}`} className="text-xl font-bold sm:text-2xl">{title}</h2>
        {more && <Link href={more.href} className="link text-sm">{more.label}</Link>}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">{desc}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function TrendsPage() {
  const lib = getLibrary();
  const hub = lib.hub;
  const a = lib.automation;
  const areaNames = Object.fromEntries(lib.areas.map((x) => [x.slug, x.name]));
  const ready = (w: WindowKey) => hub.snapshots.ready_at[w];
  const emptyTrend = (w: WindowKey) => (
    <>
      <p className="font-semibold text-ink">Chưa đủ số liệu để xếp hạng {WINDOW_LABEL[w].long}.</p>
      <p className="mt-1">
        Tăng trưởng chỉ được tính từ hai lần đo thật cách nhau đúng kỳ, hoặc với repo được tạo trong kỳ. Hệ thống bắt đầu đo từ{' '}
        <span className="tnum">{dateTime(hub.snapshots.first_at)}</span>
        {ready(w) && <> — dự kiến có số liệu cho mọi repo đang theo dõi từ <span className="tnum font-semibold">{dateTime(ready(w))}</span></>}.
        Không có số liệu nào được ước đoán.
      </p>
    </>
  );
  const methodsNote = (w: WindowKey) => {
    const m = hub.windows[w].methods;
    const parts = [
      m.snapshots ? `${num(m.snapshots)} repo đo trực tiếp từ hai lần đồng bộ` : null,
      m.created_in_window ? `${num(m.created_in_window)} repo tạo trong kỳ` : null,
      m.stargazer_sample ? `${num(m.stargazer_sample)} repo đếm lượt gắn sao` : null,
    ].filter(Boolean);
    return parts.length ? `Có số liệu tăng trưởng ${WINDOW_LABEL[w].long}: ${parts.join(', ')}.` : '';
  };
  const tabsFor = (pick: (w: WindowKey) => HubCard[], metric: 'trending' | 'growth') => WINDOWS.map((w) => ({
    key: w,
    label: metric === 'trending' ? WINDOW_LABEL[w].tab : WINDOW_LABEL[w].short,
    badge: String(metric === 'trending' ? hub.windows[w].scored : hub.windows[w].with_growth),
    content: (
      <>
        {pick(w).length > 0 && <p className="mb-1 text-xs text-ink-3">{methodsNote(w)}</p>}
        <HubList items={pick(w)} metric={{ kind: metric, window: w }} ranked empty={emptyTrend(w)} areaNames={areaNames} />
      </>
    ),
  }));
  const stats: [string, string][] = [
    [num(lib.stats.tracked_total), 'repo đang theo dõi'],
    [num(lib.stats.radar_tracked), 'repo tự động phát hiện'],
    [num(hub.windows.d7.scored), 'repo có điểm xu hướng 7 ngày'],
    [String(lib.areas.length), 'lĩnh vực công nghệ'],
  ];

  return (
    <div className="page pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListLd(hub.trending.d7.length ? hub.trending.d7 : hub.new_rising.d30) }} />
      <header className="max-w-3xl">
        <h1 className="text-[clamp(1.9rem,1.3rem+2.4vw,3.1rem)] font-extrabold leading-[1.12] tracking-[-0.02em]">
          Khám phá repository GitHub nổi bật và đang lên
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Dự án nguồn mở mới nổi, công cụ lập trình đang được quan tâm và repository chất lượng cao — tự động cập nhật từ GitHub, xếp hạng bằng công thức công khai.
        </p>
        <p lang="en" className="mt-2 text-sm text-ink-3">
          Discover the Best &amp; Trending GitHub Repositories. Explore emerging open-source projects, trending developer tools, and high-quality GitHub repositories — automatically updated.
        </p>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {stats.map(([v, l]) => (
          <div key={l} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{l}</dt>
            <dd className="tnum mt-0.5 text-2xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4"><FreshnessNote a={a} /></div>

      <nav aria-label="Các mục trên trang" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[['dang-thinh-hanh', 'Đang thịnh hành'], ['tang-nhanh', 'Tăng nhanh nhất'], ['moi-noi', 'Mới & đang lên'], ['chat-luong', 'Chất lượng cao'], ['vien-ngoc-an', 'Viên ngọc ẩn'], ['hoat-dong', 'Hoạt động gần đây'], ['pho-bien', 'Phổ biến nhất'], ['linh-vuc', 'Theo lĩnh vực']].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="chip">{l}</a>
        ))}
      </nav>

      {hub.pinned.length > 0 && (
        <section aria-labelledby="h-pinned" className="mt-10 rounded-xl border border-[var(--gold-line)] bg-[color-mix(in_oklab,var(--gold-soft)_45%,transparent)] p-4 sm:p-5">
          <h2 id="h-pinned" className="flex items-center gap-2 text-lg font-bold"><Pin size={18} aria-hidden="true" className="text-gold" /> Biên tập viên ghim</h2>
          <p className="mt-1 text-sm text-ink-2">Lựa chọn thủ công, hiển thị riêng — không làm thay đổi thứ hạng tự động bên dưới.</p>
          <HubList items={hub.pinned} metric={{ kind: 'stars' }} empty={null} areaNames={areaNames} />
        </section>
      )}

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 xl:grid-cols-2">
        <Section id="dang-thinh-hanh" title="Đang thịnh hành" more={{ href: '/tim-kiem/?src=all&sort=trend7', label: 'Xem đầy đủ' }}
          desc={<>Trending Score 0–100: tăng sao trong kỳ (35%), hoạt động mã nguồn (20%), cộng đồng (15%), độ mới & đà tăng (15%), tài liệu (10%), bảo trì (5%). <Link className="link" href="/phuong-phap/#xu-huong">Công thức</Link></>}>
          <Tabs label="Kỳ xếp hạng" initial={1} tabs={tabsFor((w) => hub.trending[w], 'trending')} />
        </Section>

        <Section id="tang-nhanh" title="Tăng sao nhanh nhất" more={{ href: '/tim-kiem/?src=all&sort=growth7', label: 'Xem đầy đủ' }}
          desc={`Số sao tăng thực tế trong kỳ, kèm cách đo. ${num(hub.flagged)} repo có tín hiệu bất thường (nhiều sao nhưng gần như không fork/người đóng góp) không được đưa vào các danh sách trên trang này — vẫn tìm thấy trong Tìm kiếm kèm nhãn cảnh báo.`}>
          <Tabs label="Kỳ đo tăng trưởng" initial={1} tabs={tabsFor((w) => hub.fastest[w], 'growth')} />
        </Section>

        <Section id="moi-noi" title="Mới & đang lên" more={{ href: '/tim-kiem/?src=all&new=30&sort=stars', label: 'Xem đầy đủ' }}
          desc="Repository được tạo gần đây, xếp theo số sao đã nhận kể từ khi tạo.">
          <Tabs label="Tạo trong vòng" tabs={(['d7', 'd30', 'd90'] as const).map((k) => ({
            key: k, label: `${k.slice(1)} ngày`, badge: String(hub.new_rising[k].length),
            content: <HubList items={hub.new_rising[k]} metric={{ kind: 'stars' }} ranked empty="Chưa phát hiện repo nào trong khoảng này." areaNames={areaNames} />,
          }))} />
        </Section>

        <Section id="vien-ngoc-an" title="Viên ngọc ẩn" more={{ href: '/tim-kiem/?src=all&gem=1', label: 'Xem đầy đủ' }}
          desc={`Chất lượng* ≥ 75/100 với độ phủ dữ liệu ≥ 70%, nhưng chỉ có ${num(a.discovery.gem_star_range[0])}–${num(a.discovery.gem_star_range[1])} sao; có hoạt động mã trong 30 ngày, có giấy phép dùng được. *Quality Score không tính nhóm “Mức độ phổ biến”.`}>
          <HubList items={hub.gems} metric={{ kind: 'gem' }} empty={<><p className="font-semibold text-ink">Chưa có repo đủ điều kiện.</p><p className="mt-1">Viên ngọc ẩn cần đủ dữ liệu chất lượng (README, hoạt động mã). Hệ thống đang lấy dần README cho các ứng viên sau mỗi lượt khám phá.</p></>} areaNames={areaNames} />
        </Section>

        <Section id="chat-luong" title="Chất lượng cao nhất" more={{ href: '/tim-kiem/?sort=score', label: 'Xem đầy đủ' }}
          desc={<>Theo Quality Score (tách biệt với điểm xu hướng), chỉ tính repo có độ phủ dữ liệu ≥ 70%. <Link className="link" href="/phuong-phap/">Cách chấm</Link></>}>
          <HubList items={hub.top_rated} metric={{ kind: 'quality' }} ranked empty="Chưa có dữ liệu." areaNames={areaNames} />
        </Section>

        <Section id="hoat-dong" title="Hoạt động gần đây" more={{ href: '/tim-kiem/?src=all&upd=7&sort=updated', label: 'Xem đầy đủ' }}
          desc="Có commit hoặc push mã nguồn trong 7 ngày, xếp theo số commit 90 ngày trên nhánh chính. Chỉ tính hoạt động mã — không tính thay đổi mô tả hay số sao (cập nhật metadata).">
          <HubList items={hub.active} metric={{ kind: 'activity' }} empty="Chưa có dữ liệu commit." areaNames={areaNames} />
        </Section>

        <Section id="pho-bien" title="Phổ biến nhất" more={{ href: '/tim-kiem/?src=all&sort=stars', label: 'Xem đầy đủ' }}
          desc="Nhiều sao nhất trong các repo đang theo dõi. Số sao không đồng nghĩa với chất lượng — xem thêm Quality Score của từng repo.">
          <HubList items={hub.popular} metric={{ kind: 'stars' }} ranked empty="Chưa có dữ liệu." areaNames={areaNames} />
        </Section>
      </div>

      <section id="linh-vuc" aria-labelledby="h-linh-vuc" className="mt-16 scroll-mt-24">
        <h2 id="h-linh-vuc" className="text-xl font-bold sm:text-2xl">Khám phá theo lĩnh vực</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">20 lĩnh vực công nghệ được gán tự động (đa nhãn) theo topic, mô tả và README — mỗi nhãn có độ tin cậy và tín hiệu kiểm chứng được.</p>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {hub.areas.map((x) => (
            <li key={x.slug}>
              <Link href={`/xu-huong/linh-vuc/${x.slug}/`} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong" style={{ ['--h' as string]: x.hue }}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-semibold group-hover:text-gold">
                    <Icon name={x.icon} size={17} className="flex-none text-ink-3" />
                    <span className="truncate">{x.name}</span>
                  </span>
                  <span className="tnum text-sm text-ink-3">{num(x.count)}</span>
                </span>
                <span lang="en" className="mt-0.5 text-xs text-ink-3">{x.en}</span>
                {x.top.length > 0 && <span className="mt-2 line-clamp-2 text-xs text-ink-2">{x.top.map((c) => c.n).join(' · ')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <aside className="panel mt-16 grid gap-6 p-6 text-sm sm:p-8 md:grid-cols-3">
        <div>
          <h2 className="font-bold">Chỉ dùng số liệu thật</h2>
          <p className="mt-2 text-ink-2">Tăng trưởng chỉ tính từ các lần đo có thời điểm cụ thể. Thiếu số liệu thì ghi “chưa đủ dữ liệu”, không ước đoán hay vẽ thêm lịch sử.</p>
        </div>
        <div>
          <h2 className="font-bold">Không chỉ đếm sao</h2>
          <p className="mt-2 text-ink-2">Điểm xu hướng kết hợp hoạt động mã, cộng đồng, tài liệu và bảo trì; chuẩn hóa để repo lớn không luôn áp đảo. Cụm repo nhân bản đáng ngờ bị tự động loại.</p>
        </div>
        <div>
          <h2 className="flex items-center gap-1.5 font-bold"><Gem size={15} aria-hidden="true" /> Repo tự phát hiện</h2>
          <p className="mt-2 text-ink-2">Repo có nhãn “Tự phát hiện” được tìm qua GitHub Search API và chưa qua biên tập. Hãy tự kiểm tra trước khi cài đặt.</p>
        </div>
      </aside>
    </div>
  );
}
