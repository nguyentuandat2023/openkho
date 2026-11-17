# Hướng dẫn cài đặt, quản trị và triển khai OpenKho

Tài liệu dành cho người quản trị website, không cần biết lập trình. Các lệnh được gõ trong cửa sổ PowerShell hoặc Terminal của VS Code, mở tại thư mục `C:\OpenKho`.

## 1. Chạy trên máy tính

Yêu cầu: Windows 10/11 (macOS/Linux cũng chạy được), [Node.js](https://nodejs.org) bản 20.9 trở lên, Git.

| Việc | Cách 1: bấm đúp file | Cách 2: gõ lệnh |
|---|---|---|
| Cài đặt lần đầu | `1_CAI_DAT.bat` | `npm install` |
| Lấy số liệu mới nhất từ GitHub | `2_DONG_BO_DU_LIEU.bat` | `npm run sync` |
| Xem website (http://localhost:3000) | `3_MO_WEBSITE.bat` | `npm run build` rồi `npm start` |
| Trang Quản trị (http://localhost:4321) | `4_QUAN_TRI.bat` | `npm run admin` |

> Máy này có cấu hình npm trỏ cache sang ổ D (đang không tồn tại). Các file `.bat` đã tự chuyển cache sang ổ C. Nếu gõ lệnh trực tiếp mà gặp lỗi `ENOENT ... D:\`, chạy trước: `$env:npm_config_cache="$env:LOCALAPPDATA\npm-cache"`.

## 2. Cấu hình token GitHub (khuyến nghị)

Không có token, thư viện vẫn chạy: số liệu chính lấy qua Search API, nhưng số người đóng góp chỉ cập nhật được khoảng 60 repo mỗi giờ. Có token thì đồng bộ đầy đủ trong vài phút, kèm danh sách file tải về của từng bản phát hành và tốc độ tăng sao thực tế.

1. Đăng nhập GitHub → ảnh đại diện → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Đặt tên (vd. `openkho-sync`), thời hạn tùy chọn. Ở **Repository access** chọn **Public repositories (read-only)**. Không cần cấp thêm quyền nào.
3. Bấm **Generate token** và sao chép chuỗi `github_pat_...`.
4. Mở file `C:\OpenKho\.env.local` (đã được tạo sẵn bởi `1_CAI_DAT.bat`; nếu chưa có thì sao chép từ `.env.example`) và điền:
   ```
   GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxx
   ```
5. Chạy lại `2_DONG_BO_DU_LIEU.bat`. Dòng đầu sẽ báo `chế độ FULL (GraphQL + REST, có token)`.

Không gửi token cho người khác và không đưa file `.env.local` lên mạng (file đã được loại khỏi Git).

## 3. Quản trị nội dung

### 3.1. Trang Quản trị (dễ nhất)

Chạy `4_QUAN_TRI.bat`. Trình duyệt mở http://localhost:4321 với các tab:

- **Tổng quan**: số repo, xếp loại, hạn mức GitHub còn lại, báo cáo lần đồng bộ gần nhất, danh sách cần xử lý (đổi tên, không còn tồn tại, đã lưu trữ). Có nút **Đồng bộ toàn bộ**, **Build website**, **Kiểm tra catalog**, **Tự sửa tên trong catalog**.
- **Thêm repo**: dán link GitHub → **Kiểm tra trên GitHub** (xác minh repo có thật, xem số sao, giấy phép, gợi ý danh mục) → điền mô tả tiếng Việt, ứng dụng, độ khó, chi phí, nền tảng… → **Thêm và đồng bộ số liệu**.
- **Danh sách repo**: lọc, **Sửa**, **Đồng bộ** riêng một repo, **Xóa** khỏi thư viện.
- **Danh mục**: sửa tên/mô tả/biểu tượng/màu, đổi thứ tự, thêm danh mục mới, xóa danh mục trống.
- **Khám phá**: tìm repo mới nổi theo chủ đề (marketing, SEO, video AI, TTS, MCP…) → **Thêm** hoặc **Bỏ qua**.
- **Nhật ký**: xem trực tiếp tiến trình đồng bộ/build.

Sau khi thay đổi, bấm **Build website** để xem trên máy. Muốn cập nhật website thật thì đưa thay đổi lên GitHub (mục 5.3).

### 3.2. Sửa file trực tiếp

Mỗi danh mục là một file `data/catalog/<slug>.yaml`; danh mục ở `data/categories.yaml`. Ý nghĩa từng trường xem `data/README.md`. Chỉ trường `repo` là bắt buộc — **không nhập số liệu (sao, fork, ngày…) bằng tay**. Sau khi sửa, chạy `npm run validate` để kiểm tra lỗi.

### 3.3. Dòng lệnh

```
npm run add -- https://github.com/owner/ten-repo --category ai-agents --summary "Mô tả tiếng Việt"
npm run discover                                   # tìm ứng viên mới theo các chủ đề gợi ý
npm run discover -- --query "topic:seo stars:>500"  # truy vấn tùy chỉnh
```

### 3.4. Nhận đề xuất từ người dùng (sau khi đưa lên GitHub)

1. Trong repo GitHub, vào **Issues** → **Labels** → tạo 2 nhãn: `de-xuat` và `duyet`.
2. Mở `site.config.json`, điền `"githubRepo": "ten-ban/openkho"`. Website sẽ hiện link "Đề xuất thêm dự án".
3. Người dùng điền form **Đề xuất repository**. Khi bạn gắn nhãn `duyet`, GitHub Actions tự kiểm tra repo, thêm vào catalog, đồng bộ số liệu, triển khai lại website và trả lời trên issue.
4. Khi thêm/đổi danh mục, chạy `node scripts/gen-issue-template.mjs` để cập nhật danh sách danh mục trong form.

## 4. Cập nhật số liệu repository

- **Tự động**: workflow `.github/workflows/scheduler.yml` chạy mỗi giờ và thực hiện các job đến hạn theo `data/settings.json` (khám phá 3 giờ, cập nhật số liệu 6 giờ, xếp hạng 24 giờ, đánh giá lại 7 ngày, dọn dẹp 30 ngày) → lưu dữ liệu (commit) → kiểm thử → build → triển khai. Đổi lịch ở trang Quản trị (tab "Lịch & trọng số"). Trên máy riêng: `npm run scheduler` hoặc `5_TU_DONG_CAP_NHAT.bat`. Chi tiết: [docs/04-HE-THONG-TU-DONG.md](04-HE-THONG-TU-DONG.md).
- `sync-deploy.yml` không còn chạy theo giờ: chỉ chạy khi push lên nhánh main (biên tập viên sửa catalog) hoặc bấm tay. Hai workflow dùng chung nhóm `concurrency` nên không chạy song song.
- **Thủ công**: `npm run sync`, hoặc trong GitHub: tab **Actions** → **Đồng bộ dữ liệu và triển khai** → **Run workflow**.
- Repo **đổi tên**: tự theo tên mới; trong Actions catalog được sửa tự động (`--fix-renames`).
- Repo **bị xóa** (404): ẩn khỏi danh sách, trang chi tiết hiện cảnh báo; xóa hẳn bằng trang Quản trị nếu muốn.
- Repo **đã lưu trữ**: hiện cảnh báo, không lên bảng xếp hạng; thêm gợi ý thay thế bằng trường `alternatives`.
- Mỗi lần đo số sao/fork được lưu kèm thời điểm ở `data/snapshots/` (theo GitHub ID). Tăng trưởng 24 giờ/7 ngày/30 ngày chỉ có khi đã đo đủ thời gian (hoặc repo được tạo trong kỳ) — không ước đoán lịch sử. `data/history/stars.json` là lịch sử của phiên bản cũ, chỉ còn để tham khảo.

## 5. Đưa website lên mạng

### 5.1. GitHub Pages (khuyến nghị, miễn phí, tự cập nhật hằng ngày)

1. Tạo tài khoản GitHub (nếu chưa có) và một repository mới, ví dụ `openkho` (Public; GitHub Pages của repo riêng tư cần gói trả phí).
2. Đưa mã nguồn lên (trong thư mục `C:\OpenKho`):
   ```
   git init -b main
   git add .
   git commit -m "OpenKho: thư viện mã nguồn mở"
   git remote add origin https://github.com/ten-ban/openkho.git
   git push -u origin main
   ```
3. Trên GitHub: **Settings** → **Pages** → mục **Build and deployment** → **Source**: chọn **GitHub Actions**.
4. **Settings** → **Actions** → **General** → **Workflow permissions**: chọn **Read and write permissions** → **Save** (để workflow lưu được số liệu mới).
5. (Khuyến nghị) **Settings** → **Secrets and variables** → **Actions** → **New repository secret**: tên `SYNC_TOKEN`, giá trị là token ở mục 2. Không có secret này workflow vẫn chạy bằng token mặc định của Actions (1.000 lượt/giờ, đủ dùng).
6. Tab **Actions** → **Đồng bộ dữ liệu và triển khai** → **Run workflow**. Khoảng 5–10 phút sau, website chạy tại `https://ten-ban.github.io/openkho/` (đường dẫn con `/openkho` được tự cấu hình).
7. Mở `site.config.json`, sửa `"url"` thành địa chỉ thật (vd. `https://ten-ban.github.io`) để sitemap và thẻ SEO đúng, rồi commit và push.

**Tên miền riêng:** **Settings** → **Pages** → **Custom domain**, nhập tên miền, rồi trỏ DNS theo hướng dẫn của GitHub (bản ghi CNAME tới `ten-ban.github.io`). Đặt `"url"` trong `site.config.json` thành tên miền đó. Đường dẫn con tự trở về rỗng.

### 5.2. Cloudflare Pages (miễn phí, dùng được cho mục đích thương mại)

1. Làm bước 1–2 và 4–5 của mục 5.1 (cần GitHub Actions để đồng bộ số liệu hằng ngày).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → chọn repo.
3. Build command: `npm run build` · Build output directory: `out` · Biến môi trường: `NODE_VERSION` = `22`.
4. Mỗi lần GitHub Actions lưu số liệu mới (commit), Cloudflare tự build lại. Có thể tắt bước triển khai GitHub Pages bằng cách xóa job `deploy` trong `sync-deploy.yml`.

### 5.3. Vercel, Netlify hoặc hosting bất kỳ

- Vercel/Netlify: kết nối repo, build command `npm run build`, thư mục xuất `out`. Lưu ý gói Hobby của Vercel chỉ dành cho mục đích cá nhân, phi thương mại — website của doanh nghiệp nên dùng GitHub Pages, Cloudflare Pages hoặc gói trả phí.
- Hosting thường (cPanel…): chạy `npm run build`, tải toàn bộ nội dung thư mục `out/` lên `public_html`. Nếu đặt trong thư mục con, build với `BASE_PATH=/ten-thu-muc`.

### 5.4. Quy trình cập nhật nội dung hằng ngày

1. Thêm/sửa repo trong Trang Quản trị.
2. Đưa lên GitHub:
   ```
   git add data
   git commit -m "Cập nhật danh sách repo"
   git push
   ```
3. GitHub Actions tự đồng bộ số liệu cho repo mới và triển khai lại website.

## 6. Cơ sở dữ liệu PostgreSQL / Supabase (tùy chọn)

Bản hiện tại không cần CSDL. Dùng khi muốn mở rộng: tài khoản người dùng, yêu thích đồng bộ giữa các thiết bị, truy vấn/phân tích dữ liệu bằng SQL, kết nối công cụ BI (Metabase…).

1. Tạo dự án tại [supabase.com](https://supabase.com) (gói miễn phí).
2. **Project Settings** → **Database** → **Connection string** → sao chép chuỗi URI, thay mật khẩu, điền vào `.env.local`:
   ```
   DATABASE_URL=postgresql://postgres:<mat-khau>@db.<ma-du-an>.supabase.co:5432/postgres
   ```
3. Lần đầu: `npm run db:load -- --migrate` (tạo bảng, chính sách bảo mật RLS, nạp dữ liệu). Các lần sau: `npm run db:load`.
4. Không có kết nối trực tiếp? `npm run db:sql` tạo file `supabase/seed.sql` để dán vào **SQL Editor** của Supabase (chạy `supabase/migrations/0001_init.sql` trước).
5. Kiểm thử lược đồ trên máy, không cần Supabase: `npm run test:db`.

Lược đồ gồm: `repositories`, `categories`, `tags`, `repository_categories`, `repository_tags`, `repository_statistics`, `repository_releases`, `users`, `favorites`, `collections`, `collection_items`, `sync_runs`.

## 7. Cấu hình website

`site.config.json`:

| Trường | Ý nghĩa |
|---|---|
| `name` | Tên website (đổi thương hiệu ở đây, vd. "GitHub Library VN") |
| `tagline`, `description` | Khẩu hiệu và mô tả dùng cho SEO |
| `url` | Địa chỉ website thật (sitemap, thẻ canonical, Open Graph) |
| `githubRepo` | `ten-ban/ten-repo` — bật link "Đề xuất thêm dự án" |

Màu và font chỉnh trong `src/app/globals.css` (các biến `--bg`, `--accent`, `--gold`…).

## 8. Kiểm tra trước khi phát hành

```
npm run validate      # catalog hợp lệ
npm test              # 20 kiểm thử đơn vị
npm run build         # build website
npm run test:e2e      # 26 kiểm thử đầu-cuối trên trình duyệt thật (Chrome/Edge có sẵn trên máy)
npm run check-links   # kiểm tra mọi link GitHub, link tải, link tài liệu
npm run test:db       # kiểm thử lược đồ PostgreSQL
npm run report        # sinh lại docs/01-BAO-CAO-NGHIEN-CUU.md từ số liệu mới
```

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `Hết hạn mức GitHub API` khi đồng bộ | Bình thường khi không có token; dữ liệu cũ được giữ. Thêm `GITHUB_TOKEN` (mục 2) hoặc chạy lại sau 1 giờ. |
| Repo báo "Chưa kiểm tra lại được" | Repo không có trong kết quả Search (thường do vừa đổi tên) và đã hết lượt REST; lần đồng bộ sau sẽ tự xử lý. |
| Website trên GitHub Pages trắng trang hoặc thiếu CSS | Kiểm tra mục **Pages → Source** đã chọn **GitHub Actions**; xem log bước "Build website" trong tab Actions. |
| Workflow không lưu được số liệu (lỗi 403 khi push) | Bật **Read and write permissions** (mục 5.1 bước 4). |
| `npm install` lỗi `ENOENT ... D:\` | Dùng `1_CAI_DAT.bat` hoặc đặt `npm_config_cache` sang ổ C (mục 1). |
| Build lỗi tải font Google | Cần Internet khi build (font được tải về và tự host). |
| Cảnh báo phiên bản Action cũ | Cập nhật số phiên bản `actions/...@vX` trong `.github/workflows/*.yml`. |

## 10. Bảo trì định kỳ

- Hằng tuần: xem tab **Tổng quan** của Trang Quản trị (repo đổi tên/lưu trữ/không còn tồn tại); xem các issue đề xuất mới.
- Hằng tháng: chạy tab **Khám phá** để tìm dự án mới nổi; rà các repo xếp "Cần kiểm tra thêm"; chạy `npm run report` để cập nhật báo cáo.
- Khi có repo lưu trữ: thêm `alternatives` gợi ý thay thế hoặc xóa khỏi thư viện.
