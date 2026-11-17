import type { Metadata } from 'next';
import { getIndex, getLibrary } from '@/lib/library';
import { sortRepos } from '@/lib/filters';
import RepoBrowser from '@/components/RepoBrowser';

export const metadata: Metadata = {
  title: 'Tìm kiếm dự án mã nguồn mở',
  description: 'Tìm theo tên dự án, chức năng, công nghệ, topic, tác giả, danh mục hoặc lĩnh vực. Lọc theo xu hướng hôm nay/tuần/tháng, tăng sao nhanh, mới tạo, chất lượng, viên ngọc ẩn, ngôn ngữ, giấy phép.',
  alternates: { canonical: '/tim-kiem/' },
};

export default function SearchPage() {
  const lib = getLibrary();
  const initial = sortRepos(getIndex().repos.filter((r) => r.v), 'score').slice(0, 30);
  const cats = lib.categories.map(({ slug, short, hue, name }) => ({ slug, short, hue, name }));
  const areas = lib.areas.map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tìm kiếm</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Gõ có dấu hoặc không dấu đều được. Tìm theo tên dự án, chức năng (“tách nền”, “lồng tiếng”), công nghệ hoặc topic (“python”, “mcp”), tác giả, danh mục hay lĩnh vực.
        Chọn nguồn “Tất cả” để tìm cả repo hệ thống tự phát hiện trên GitHub.
      </p>
      <div className="mt-8">
        <RepoBrowser initial={initial} categories={cats} areas={areas} fetchIndex autoFocus searchPlaceholder="Ví dụ: chatbot tài liệu, tạo video, n8n, thay Google Analytics…" />
      </div>
    </div>
  );
}
