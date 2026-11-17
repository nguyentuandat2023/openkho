import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page max-w-2xl py-20">
      <h1 className="text-3xl font-extrabold">Không tìm thấy trang</h1>
      <p className="mt-3 text-ink-2">Địa chỉ này không có trong thư viện. Có thể dự án đã được đổi tên hoặc đường link bị gõ sai.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/tim-kiem/" className="btn btn-primary">Tìm dự án</Link>
        <Link href="/" className="btn">Về trang chủ</Link>
      </div>
    </div>
  );
}
