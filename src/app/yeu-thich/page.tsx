import type { Metadata } from 'next';
import FavoritesView from '@/components/FavoritesView';

export const metadata: Metadata = {
  title: 'Dự án yêu thích',
  description: 'Danh sách dự án bạn đã lưu và các bộ sưu tập cá nhân. Lưu trong trình duyệt, xuất/nhập file và chia sẻ qua đường link.',
  alternates: { canonical: '/yeu-thich/' },
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return (
    <div className="page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Yêu thích</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Dự án bạn đã lưu và các bộ sưu tập cá nhân. Dữ liệu nằm trong trình duyệt này, không cần tài khoản.
      </p>
      <div className="mt-8"><FavoritesView /></div>
    </div>
  );
}
