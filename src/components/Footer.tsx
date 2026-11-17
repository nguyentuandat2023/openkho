import Link from 'next/link';
import { getLibrary } from '@/lib/library';
import { dateTime } from '@/lib/format';
import { proposeUrl, site } from '@/lib/site';
import { LogoMark } from './Header';

export default function Footer() {
  const lib = getLibrary();
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="page grid grid-cols-1 gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-md">
          <p className="flex items-center gap-2 text-lg font-extrabold"><LogoMark size={24} /> {site.name}</p>
          <p className="mt-3 text-sm text-ink-2">{site.description}</p>
          <p className="mt-4 text-sm text-ink-2">
            Số liệu lấy từ GitHub API, đồng bộ thành công gần nhất lúc <span className="tnum font-semibold text-ink">{dateTime(lib.automation.last_data_sync_at || lib.synced_at)}</span> (giờ Việt Nam);
            xếp hạng tính lúc <span className="tnum">{dateTime(lib.automation.ranking_computed_at)}</span>. Đây không phải số liệu thời gian thực — mỗi dự án ghi rõ thời điểm lấy dữ liệu riêng.
          </p>
        </div>
        <nav aria-label="Liên kết chân trang" className="text-sm">
          <p className="font-semibold">Thư viện</p>
          <ul className="mt-3 grid gap-2 text-ink-2">
            <li><Link className="hover:text-ink" href="/xu-huong/">Xu hướng GitHub</Link></li>
            <li><Link className="hover:text-ink" href="/danh-muc/">Tất cả danh mục</Link></li>
            <li><Link className="hover:text-ink" href="/tim-kiem/">Tìm kiếm nâng cao</Link></li>
            <li><Link className="hover:text-ink" href="/bang-danh-gia/">Bảng đánh giá chất lượng</Link></li>
            <li><Link className="hover:text-ink" href="/yeu-thich/">Danh sách yêu thích</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="font-semibold">Minh bạch</p>
          <ul className="mt-3 grid gap-2 text-ink-2">
            <li><Link className="hover:text-ink" href="/phuong-phap/">Cách chấm điểm và nguồn dữ liệu</Link></li>
            {proposeUrl && <li><a className="hover:text-ink" href={proposeUrl} target="_blank" rel="noopener noreferrer">Đề xuất thêm dự án</a></li>}
            <li><Link className="hover:text-ink" href="/phuong-phap/#gioi-han">Giới hạn và miễn trừ trách nhiệm</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="page py-5 text-xs text-ink-3">
          {site.name} không liên kết với GitHub, Inc. Tên, logo và mã nguồn của từng dự án thuộc về chủ sở hữu và được phân phối theo giấy phép của dự án đó.
          Mọi liên kết tải về trỏ tới nguồn chính thức trên GitHub.
        </p>
      </div>
    </footer>
  );
}
