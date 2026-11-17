import type { Metadata } from 'next';
import Link from 'next/link';
import { getIndex, getLibrary } from '@/lib/library';
import { sortRepos } from '@/lib/filters';
import { dateTime } from '@/lib/format';
import EvaluationTable from '@/components/EvaluationTable';

export const metadata: Metadata = {
  title: 'Bảng đánh giá chất lượng repository',
  description: 'Điểm chất lượng (thang 100) của toàn bộ dự án theo 6 tiêu chí: phổ biến, chất lượng, ứng dụng, cập nhật, tài liệu, cộng đồng. Sắp xếp theo từng cột và tải về dạng CSV.',
  alternates: { canonical: '/bang-danh-gia/' },
};

export default function EvaluationPage() {
  const lib = getLibrary();
  const rows = sortRepos(getIndex().repos.filter((r) => r.v && r.sc !== null && r.og === 'c'), 'score');
  const cats = lib.categories.map(({ slug, short, name, hue }) => ({ slug, short, name, hue }));
  const t = lib.stats.by_tier;
  return (
    <div className="page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Bảng đánh giá chất lượng</h1>
      <p className="mt-2 max-w-3xl text-ink-2">
        {rows.length} dự án có số liệu, chấm theo 6 tiêu chí trên thang 100. Hiện có {t.excellent} dự án xếp loại Xuất sắc, {t.good} Tốt, {t.potential} Tiềm năng và {t.review} Cần kiểm tra thêm.
        Bấm vào tiêu đề cột để sắp xếp. <Link href="/phuong-phap/" className="link">Xem công thức</Link>
      </p>
      <p className="mt-2 text-sm text-ink-3">Số liệu cập nhật lúc <span className="tnum">{dateTime(lib.synced_at)}</span>.</p>
      <div className="mt-8">
        <EvaluationTable initial={rows.slice(0, 40)} categories={cats} total={rows.length} />
      </div>
    </div>
  );
}
