# OpenKho – Thư viện mã nguồn mở tuyển chọn

Website tra cứu các dự án mã nguồn mở chất lượng trên GitHub, giao diện tiếng Việt, ưu tiên AI, marketing, tự động hóa và công cụ chạy trên máy tính cá nhân. **Mọi số liệu là số liệu thật lấy từ GitHub API**, kèm thời điểm cập nhật, và được làm mới tự động theo lịch.

- 340 repository trong 22 danh mục, chấm điểm 100 theo 6 tiêu chí (số sao chỉ chiếm 15 điểm).
- Tìm kiếm có dấu/không dấu, 12 nhóm bộ lọc, 9 kiểu sắp xếp; trang chi tiết có hướng dẫn cài đặt trích từ README, ưu/nhược điểm, giấy phép và quyền dùng thương mại, link tải chính chủ.
- Yêu thích và bộ sưu tập không cần tài khoản; chia sẻ qua link.
- Trang Quản trị để thêm/sửa repo mà không phải sửa mã nguồn; GitHub Actions tự đồng bộ và triển khai.
- Chạy miễn phí trên GitHub Pages / Cloudflare Pages; có sẵn lược đồ PostgreSQL/Supabase để mở rộng.
- **Hệ thống tự động khám phá** (trang /xu-huong/): tự tìm repo mới nổi qua GitHub Search API mỗi 3 giờ, đo tăng trưởng sao từ các lần đo thật (không ước đoán lịch sử), Trending Score 24 giờ/7 ngày/30 ngày có công thức công khai, phân loại 20 lĩnh vực, “viên ngọc ẩn”, tự loại cụm repo spam; bộ lập lịch chạy trên GitHub Actions hoặc daemon (khóa chống chạy trùng, thử lại, phát hiện treo, khôi phục sau sự cố). Xem [docs/04](docs/04-HE-THONG-TU-DONG.md).

## Bắt đầu nhanh (Windows)

1. Bấm đúp `1_CAI_DAT.bat`.
2. Bấm đúp `3_MO_WEBSITE.bat` → trình duyệt mở http://localhost:3000.
3. Quản trị nội dung: `4_QUAN_TRI.bat` → http://localhost:4321.
4. Cập nhật số liệu từ GitHub: `2_DONG_BO_DU_LIEU.bat`.
5. Chạy bộ lập lịch tự động trên máy: `5_TU_DONG_CAP_NHAT.bat` (khám phá, cập nhật, xếp hạng theo lịch).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/01-BAO-CAO-NGHIEN-CUU.md](docs/01-BAO-CAO-NGHIEN-CUU.md) | Phần 1 – Báo cáo nghiên cứu: danh sách theo danh mục, bảng đánh giá, link tải, đề xuất ưu tiên, cảnh báo (sinh tự động từ số liệu) |
| [docs/02-DAC-TA-WEBSITE.md](docs/02-DAC-TA-WEBSITE.md) | Phần 2 – Đặc tả: sơ đồ website, đối chiếu yêu cầu, thiết kế, kiến trúc, cơ sở dữ liệu |
| [docs/03-HUONG-DAN-TRIEN-KHAI.md](docs/03-HUONG-DAN-TRIEN-KHAI.md) | Phần 4 – Cài đặt, cấu hình API/CSDL, quản trị, cập nhật repo, triển khai lên hosting |
| [docs/04-HE-THONG-TU-DONG.md](docs/04-HE-THONG-TU-DONG.md) | Hệ thống tự động: lịch chạy, độ tin cậy, cấu hình, công thức xu hướng, spam, AI, quản trị, CSDL, xử lý sự cố |
| [data/README.md](data/README.md) | Ý nghĩa từng trường dữ liệu trong catalog |

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run sync` | Đồng bộ số liệu từ GitHub (có `GITHUB_TOKEN` trong `.env.local` thì dùng chế độ đầy đủ) |
| `npm run build` / `npm start` | Build website tĩnh vào `out/` / xem tại http://localhost:3000 |
| `npm run dev` | Chế độ phát triển (tự tải lại khi sửa giao diện) |
| `npm run admin` | Trang Quản trị (thêm tab Tự động hóa, Radar, Lịch & trọng số, Kiểm tra) |
| `npm run jobs -- status` · `run <job>` · `run-due` · `history` · `unlock` | Điều khiển bộ lập lịch (job: discover, refresh, rank, reevaluate, cleanup, ai_analyze) |
| `npm run scheduler` | Daemon lập lịch chạy nền trên máy |
| `npm run add -- owner/repo --category <slug>` | Thêm repo bằng dòng lệnh |
| `npm run discover` | Tìm repo ứng viên mới |
| `npm run validate` · `npm test` · `npm run test:e2e` · `npm run test:db` · `npm run check-links` | Kiểm tra catalog, kiểm thử đơn vị, đầu-cuối, CSDL, liên kết |
| `npm run report` | Sinh lại báo cáo nghiên cứu |
| `npm run db:sql` / `npm run db:load` | Xuất SQL / nạp vào PostgreSQL-Supabase |

## Cấu trúc thư mục

```
data/            catalog YAML (biên tập) + số liệu GitHub (JSON) + radar tự phát hiện, snapshot, điểm, cấu hình, trạng thái job
scripts/         đồng bộ GitHub, build dữ liệu, quản trị, kiểm thử, báo cáo, CSDL
src/             website Next.js (App Router, xuất trang tĩnh, Tailwind CSS)
supabase/        lược đồ PostgreSQL + RLS
research/        dữ liệu nghiên cứu ban đầu: ứng viên, kết quả xác minh, khám phá
.github/         GitHub Actions (bộ lập lịch mỗi giờ, đồng bộ + triển khai khi push, nhận đề xuất qua issue), form đề xuất
docs/            báo cáo, đặc tả, hướng dẫn
```

## Giấy phép và nguồn dữ liệu

Số liệu thuộc về GitHub và các dự án tương ứng; tên, logo và mã nguồn của từng dự án thuộc chủ sở hữu và theo giấy phép riêng của dự án. Website không lưu trữ hay phân phối lại mã nguồn — mọi link tải trỏ về nguồn chính thức. OpenKho không liên kết với GitHub, Inc.
