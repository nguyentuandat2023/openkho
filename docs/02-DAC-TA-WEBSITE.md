# Đặc tả website OpenKho

Thư viện tuyển chọn dự án mã nguồn mở trên GitHub, giao diện tiếng Việt. Dữ liệu là số liệu thật lấy từ GitHub API, tự động cập nhật mỗi ngày.

## 1. Mục tiêu và người dùng

| Người dùng | Việc cần làm | Website đáp ứng bằng |
|---|---|---|
| Người làm marketing, sáng tạo nội dung | Tìm công cụ AI làm video, viết nội dung, đăng mạng xã hội, đo lường | Danh mục AI Marketing, Marketing & SEO; tìm kiếm theo chức năng bằng tiếng Việt |
| Chủ doanh nghiệp, vận hành | Thay phần mềm trả phí (CRM, BI, quản lý tài liệu), tự động hóa quy trình | Bộ lọc giấy phép thương mại, chi phí, độ khó cài đặt; cảnh báo giấy phép |
| Người dùng phổ thông | Cài công cụ AI chạy trên máy tính cá nhân | Lọc "Dễ cài" + "Windows"; hướng dẫn cài nhanh; link bộ cài chính chủ |
| Lập trình viên | So sánh framework, thư viện, xem độ "sống" của dự án | Điểm 6 tiêu chí, commit 90 ngày, bảng đánh giá xuất CSV |

## 2. Sơ đồ cấu trúc website

```
/                                  Trang chủ: tìm kiếm, tủ danh mục, biên tập chọn, bảng xếp hạng, đề xuất
├── /danh-muc/                     Tất cả 22 danh mục kèm mô tả và dự án điểm cao nhất
│   └── /danh-muc/{slug}/          Trang danh mục: tìm trong danh mục, 12 nhóm bộ lọc, 9 kiểu sắp xếp
├── /repo/{owner}/{ten}/           Trang chi tiết (340 trang tĩnh)
├── /tim-kiem/?q=…                 Tìm kiếm toàn văn (có dấu/không dấu, sai chính tả nhẹ) + bộ lọc
├── /bang-danh-gia/                Bảng đánh giá chất lượng: sắp xếp theo từng tiêu chí, tải CSV
├── /yeu-thich/                    Yêu thích + bộ sưu tập: lưu trong trình duyệt, xuất/nhập, chia sẻ qua link
├── /phuong-phap/                  Nguồn dữ liệu, công thức chấm điểm, cảnh báo, giấy phép, miễn trừ
├── /sitemap.xml  /robots.txt      SEO
└── /data/index.json               Chỉ mục gọn cho tìm kiếm phía trình duyệt

Trên máy quản trị (không đưa lên mạng):
http://localhost:4321              Trang Quản trị: thêm/sửa/xóa repo và danh mục, đồng bộ, build, khám phá ứng viên
```

## 3. Đối chiếu yêu cầu và hiện thực

### Các trang (Bước 4)

| Yêu cầu | Hiện thực | Vị trí mã nguồn |
|---|---|---|
| A. Trang chủ: thanh tìm kiếm nổi bật | Ô tìm kiếm lớn (hoạt động cả khi tắt JavaScript), gợi ý từ khóa, phím tắt `/` | `src/app/page.tsx` |
| Dự án nổi bật | "Biên tập chọn": mỗi danh mục một dự án `featured` điểm cao nhất | `featured()` trong `src/lib/library.ts` |
| Repository được đánh giá cao | Tab "Đánh giá cao nhất" (top 10 theo điểm) | `RankingTabs` |
| Dự án mới cập nhật | Tab "Vừa phát hành" (bản phát hành ổn định mới nhất) | `recentlyReleased()` |
| Dự án đang phát triển mạnh | Tab "Đang phát triển mạnh" (sao/ngày, ghi rõ phương pháp đo) | `trending()` |
| Danh mục công nghệ | "Tủ danh mục" 22 ngăn kéo kèm số dự án | `CategoryCabinet` |
| Danh sách đề xuất | "Dễ cài trên máy tính Windows", "Đề xuất cho đội marketing" | `src/app/page.tsx` |
| B. Trang danh mục + lọc Star, Fork, ngôn ngữ | Bộ lọc số sao/fork tối thiểu, ngôn ngữ lập trình (đếm số kết quả từng lựa chọn) | `RepoBrowser` |
| Lọc miễn phí/trả phí, độ dễ cài đặt | Bộ lọc Chi phí, Độ khó cài đặt; thêm Giấy phép, Nền tảng, Cách dùng, Khóa API, Xếp hạng | `src/lib/filters.ts` |
| Sắp xếp theo phổ biến, thời gian cập nhật | 9 kiểu: điểm, sao, fork, cập nhật mã nguồn, phát hành, tăng sao, mới thêm, tên, mức liên quan | `sortRepos()` |
| C. Trang chi tiết: ảnh đại diện/minh họa | Ảnh đại diện chủ sở hữu + ảnh minh họa (social preview) của repo | `src/app/repo/[owner]/[name]/page.tsx` |
| Tên, mô tả, link GitHub, Star, Fork, ngôn ngữ, tác giả, giấy phép | Có, kèm mô tả tiếng Việt + mô tả gốc, người đóng góp, issue, commit 90 ngày, thời điểm lấy dữ liệu | như trên |
| Tính năng nổi bật, ưu/nhược điểm | Biên tập viên viết + tự sinh từ số liệu (ghi rõ "từ số liệu"); tính năng trích từ README khi chưa biên tập | `scoreRepo()` (auto_pros/auto_cons) |
| Hướng dẫn cài đặt, sử dụng | Lệnh cài nhanh (biên tập) + trích tự động mục Installation/Usage từ README, có nút sao chép | `scripts/lib/readme.mjs` |
| Yêu cầu hệ thống | Nền tảng, cách dùng, độ khó, chi phí, khóa API, cấu hình khuyến nghị | trang chi tiết |
| Link ZIP, link Release | ZIP nhánh chính, trang bản phát hành, ZIP mã nguồn theo phiên bản, bộ cài theo hệ điều hành (chế độ có token) | khung "Tải về" |
| Video demo nếu có | Tự tìm video YouTube trong README, chỉ tải khi người xem bấm | `YouTubeFacade` |
| D. Tìm kiếm theo tên, từ khóa, công nghệ, tác giả, danh mục, chức năng | MiniSearch: tên, chủ sở hữu, mô tả Việt + Anh, thẻ, topic, ứng dụng, danh mục, ngôn ngữ; gõ không dấu, sai nhẹ | `src/lib/search.ts` |
| E. Trang yêu thích, quản lý danh sách cá nhân | Lưu/bỏ lưu, bộ sưu tập (tạo/đổi tên/xóa), chia sẻ qua link, xuất/nhập JSON | `FavoritesView`, `src/lib/favorites.ts` |

### Tải về, GitHub API, dữ liệu (Bước 5–7)

| Yêu cầu | Hiện thực |
|---|---|
| Xem mã nguồn, tải ZIP, tải Release, tài liệu, demo | Đủ 5 loại link, tất cả trỏ về nguồn chính chủ; website không lưu/phân phối lại mã nguồn |
| Thu thập repository | Catalog do biên tập viên duyệt + công cụ khám phá ứng viên qua Search API (`npm run discover`, tab Khám phá) |
| Cập nhật Star, Fork, ngày hoạt động, mô tả, License, Release | `npm run sync` / GitHub Actions hằng ngày; mỗi repo lưu thời điểm lấy dữ liệu |
| Phát hiện repo bị xóa hoặc lưu trữ | 404 xác nhận qua REST → "Không còn tồn tại" (ẩn khỏi danh sách, trang chi tiết giữ cảnh báo); `archived` → cảnh báo + gợi ý thay thế; đổi tên → tự theo tên mới, `--fix-renames` sửa catalog |
| Giới hạn API, cache, rate limit | Theo dõi header `x-ratelimit-*`, tự chờ khi hết lượt, lùi thời gian khi gặp secondary rate limit; cache ETag (phản hồi 304 không tốn lượt); chia lô 20 repo/truy vấn GraphQL, 35 repo/truy vấn Search |
| Ưu tiên API hơn quét HTML | Chỉ dùng GitHub API, Atom feed chính thức và tệp raw README; không quét HTML |
| Cơ sở dữ liệu (repositories, categories, tags, …) | `supabase/migrations/0001_init.sql`: đủ 9 bảng đề xuất + repository_tags, collection_items, sync_runs; RLS; đã kiểm thử bằng PGlite |

### Quy tắc bắt buộc (mục 4 của yêu cầu)

| # | Quy tắc | Cách bảo đảm |
|---:|---|---|
| 1 | Chỉ dùng link GitHub có thật | Mỗi repo được xác minh qua API trước khi thêm (trang Quản trị, `npm run add`, form đề xuất); `npm run check-links` kiểm tra lại toàn bộ |
| 2 | Không bịa số liệu | Catalog không có trường số liệu; mọi con số đến từ `data/github/*.json` do script ghi |
| 3 | Repo bị xóa phải có cảnh báo | Trạng thái `not_found` → ẩn khỏi danh sách, trang chi tiết hiện cảnh báo đỏ |
| 4 | Phân biệt miễn phí / trả phí / mã nguồn mở | Trường Chi phí + nhóm giấy phép (OSI, hạn chế, phi thương mại) + khóa API trả phí |
| 5 | Kiểm tra giấy phép | Phân loại SPDX tự động, ghi đè biên tập khi GitHub không nhận diện được, ghi chú giấy phép mô hình AI |
| 6 | Không đánh đồng nhiều sao với chất lượng | Sao tối đa 15/100 điểm; cảnh báo tăng sao bất thường |
| 7 | Không dùng link tải không rõ nguồn | Chỉ link github.com/codeload (ZIP) và asset của bản phát hành chính thức |
| 8 | Mọi dự án có link GitHub chính thức | Khóa của catalog chính là `owner/repo` trên GitHub |
| 9 | Ghi rõ thời điểm cập nhật | Từng dự án, từng trang danh mục, trang chủ, chân trang |
| 10 | Thêm repo không cần sửa mã nguồn | Trang Quản trị, `npm run add`, form đề xuất trên GitHub, hoặc sửa file YAML |
| 11 | Không chỉ giao diện mẫu | Toàn bộ chức năng hoạt động, có 26 kiểm thử đầu-cuối + 20 kiểm thử đơn vị + kiểm thử CSDL |
| 12 | Không để dữ liệu giả xuất hiện như thật | Repo chưa đồng bộ hiển thị "Chưa có số liệu"; số liệu thiếu hiển thị "—"/"Đang cập nhật" |

## 4. Thiết kế giao diện

**Ý tưởng:** "Kho" là một tủ ngăn kéo sơn mài. 22 danh mục là 22 ngăn kéo có khung nhãn và tay nắm. Đây là điểm nhấn thị giác duy nhất; các phần còn lại giữ yên tĩnh để số liệu dễ đọc.

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Nền tối | `#1A1310` sơn then (nâu-đen sơn mài) | Bản sắc Việt, khác các trang công nghệ đen-xanh thông thường |
| Chữ | `#F2EADF` màu vỏ trứng | Dịu mắt trên nền tối, tương phản cao (≥ 12:1) |
| Nhấn | `#D8B36A` vàng lá (tối) / `#6B2B1D` nâu cánh gián (sáng) | Chỉ dùng cho nút chính, tiêu điểm bàn phím, hạng Xuất sắc |
| Trạng thái | xanh ngọc (được), đồng (lưu ý), son (cấm), chàm (thông tin) | Con dấu giấy phép và cảnh báo nhất quán ở mọi trang |
| Kiểu chữ | Be Vietnam Pro (400–800) | Thiết kế riêng cho dấu tiếng Việt; số dùng chữ số đều cột |
| Con dấu giấy phép | Viền kép như dấu mộc | Quyền dùng thương mại là thông tin quan trọng nhất trước khi tải |
| Con dấu điểm | Vòng tròn tô theo điểm, màu theo hạng | Đọc nhanh mức chất lượng |

- Giao diện sáng/tối theo hệ điều hành, có nút chuyển và ghi nhớ; không nháy màu khi tải trang.
- Responsive từ 360px: lưới 2→6 ngăn kéo, bộ lọc thành hộp thoại toàn màn hình trên điện thoại, không tràn ngang (đã kiểm thử ở 390px).
- Truy cập: liên kết "bỏ qua tới nội dung", tiêu điểm bàn phím rõ, ARIA cho tab/hộp thoại, tôn trọng `prefers-reduced-motion`.
- Chỉ một chuyển động chủ động: ngăn kéo nhô lên khi rê chuột hoặc focus.

## 5. Kiến trúc hệ thống

```
 Biên tập viên                       GitHub (nguồn sự thật cho số liệu)
 ─────────────                       ──────────────────────────────────
 Trang Quản trị / file YAML          GraphQL API · REST API · Search API · Atom feed · raw README
        │                                          │
        ▼                                          ▼
 data/categories.yaml ──┐            scripts/sync.mjs  (hạn mức, ETag, thử lại, phát hiện đổi tên/xóa)
 data/catalog/*.yaml ───┼──────────►        │
                        │                   ▼
                        │            data/github/<owner>__<repo>.json  + data/history/stars.json
                        ▼                   │
               scripts/build-data.mjs ◄─────┘   (chấm điểm, giấy phép, cờ cảnh báo, xu hướng)
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
 src/generated/library.json     public/data/index.json  (tìm kiếm/lọc phía trình duyệt)
          │
          ▼
 Next.js 16 (App Router, xuất trang tĩnh) ──► out/ (373 trang HTML) ──► GitHub Pages / Cloudflare Pages / Vercel / hosting bất kỳ
          ▲
 GitHub Actions: mỗi giờ → job đến hạn (discover/refresh/rank/reevaluate/cleanup) → commit dữ liệu → test → build → deploy
 Hệ thống tự động (docs/04): radar repo tự phát hiện (data/radar) · snapshot sao/fork (data/snapshots) · Trending Score + lịch sử điểm (data/scores)
                             · trang /xu-huong/ + 20 trang lĩnh vực · trang quản trị có bảng điều khiển tự động hóa

 Tùy chọn mở rộng: npm run db:load → PostgreSQL/Supabase (tài khoản người dùng, yêu thích đồng bộ đám mây)
```

## 6. So sánh phương án kỹ thuật và lựa chọn

| Tiêu chí | **A. Trang tĩnh + dữ liệu trong Git (đã chọn)** | B. Next.js + Supabase (động) | C. Lovable / AI Studio |
|---|---|---|---|
| Chi phí | 0đ (GitHub Pages/Cloudflare Pages) | 0đ ở gói miễn phí; dự án Supabase miễn phí bị tạm dừng nếu lâu không dùng | Gói miễn phí giới hạn; dữ liệu và mã khó kiểm soát |
| Tốc độ, SEO | Rất tốt: HTML dựng sẵn, CDN | Tốt nếu dùng ISR | Phụ thuộc nền tảng |
| Độ phức tạp vận hành | Thấp: chỉ cần tài khoản GitHub | Trung bình: CSDL, khóa API, xác thực | Thấp nhưng bị khóa vào nền tảng |
| Tài khoản người dùng | Không (yêu thích lưu trong trình duyệt, chia sẻ qua link) | Có | Có thể |
| Lịch sử thay đổi dữ liệu | Có sẵn (mỗi lần đồng bộ là một commit) | Phải tự làm | Không |
| Kiểm thử trên máy | Toàn bộ | Cần CSDL | Hạn chế |

Lý do chọn A: đáp ứng toàn bộ yêu cầu với chi phí 0đ, nhanh, SEO tốt, dữ liệu minh bạch và dễ kiểm tra. Lược đồ PostgreSQL/Supabase (phương án B) đã viết sẵn và kiểm thử; khi cần tài khoản người dùng, chỉ việc nạp dữ liệu (`npm run db:load -- --migrate`) mà không phải làm lại phần thu thập.

## 7. Tích hợp GitHub API

| Chế độ | Khi nào | Nguồn | Lượt gọi cho 340 repo |
|---|---|---|---|
| Đầy đủ | Có `GITHUB_TOKEN` (GitHub Actions luôn có) | GraphQL theo lô 20 repo (số liệu, ngôn ngữ, topic, giấy phép, commit 90 ngày, release + file tải, tag, 100 lượt gắn sao gần nhất, Dockerfile) + REST (người đóng góp, README) | ~17 truy vấn GraphQL + ~680 REST; lần sau phần lớn trả 304 nhờ ETag (không tốn lượt) |
| Không token | Chạy trên máy chưa cấu hình token | Search API theo lô 35 repo (10 lượt/phút) + Atom feed commit/release + raw README + REST cho người đóng góp theo hạn mức còn lại | 10 lượt Search; người đóng góp cập nhật dần (60 lượt REST/giờ) |

Xử lý lỗi: thử lại khi lỗi mạng/5xx (lùi thời gian), chờ tới giờ mở lại khi hết hạn mức, chờ `retry-after` khi gặp secondary rate limit. Repo không lấy được số liệu thì **giữ số liệu cũ và đánh dấu "chưa kiểm tra lại"**, không bao giờ suy đoán là đã xóa.

Truy vấn GraphQL được kiểm thử bằng schema công khai của GitHub (`scripts/test/github-graphql.test.mjs`).

## 8. Cấu trúc dữ liệu

- `data/categories.yaml`: danh mục (slug, tên, tên ngắn, mô tả, biểu tượng, màu).
- `data/catalog/<danh-mục>.yaml`: repo và nội dung biên tập; mô tả từng trường trong `data/README.md`.
- `data/github/<owner>__<repo>.json`: số liệu chuẩn hóa từ GitHub (meta, activity, release, contributors, readme đã trích và làm sạch, `fetched_at`).
- `data/history/stars.json`: chuỗi `[ngày, sao, fork]` theo từng repo (tối đa 400 ngày).
- PostgreSQL (`supabase/migrations/0001_init.sql`):

```
categories ─┐
            ├─< repository_categories >─ repositories ─┬─< repository_tags >─ tags
            │                                          ├─< repository_statistics   (lịch sử theo ngày)
            │                                          ├─< repository_releases
auth.users ── users ─┬─< favorites >───────────────────┤
                     └─< collections ─< collection_items >┘
sync_runs (nhật ký đồng bộ)
```

## 9. SEO và hiệu năng

- 373 trang HTML dựng sẵn, `trailingSlash`, URL tiếng Việt không dấu (`/danh-muc/ai-video-image/`, `/repo/ollama/ollama/`).
- Thẻ title/description riêng từng trang, canonical, Open Graph (ảnh minh họa của repo), JSON-LD `SoftwareSourceCode`, `sitemap.xml`, `robots.txt`; trang Yêu thích `noindex`.
- Font tự host (next/font), ảnh lazy-load, video chỉ tải khi bấm, chỉ mục tìm kiếm tải khi cần.

## 10. Bảo mật

- Nội dung README được làm sạch bằng danh sách cho phép (sanitize-html): loại script, iframe, thuộc tính sự kiện, `javascript:`; link ngoài có `rel="nofollow noopener noreferrer"`.
- Trang Quản trị chỉ lắng nghe 127.0.0.1, yêu cầu header riêng và kiểm tra Origin cho mọi thao tác ghi (chống CSRF).
- Workflow nhận đề xuất qua issue chỉ chạy khi quản trị viên gắn nhãn `duyet`; nội dung issue được đọc qua biến môi trường, không chèn vào lệnh shell.
- Token GitHub chỉ cần quyền đọc repo công khai, lưu trong `.env.local` (không đưa lên Git) hoặc GitHub Secrets.

## 11. Kiểm thử

| Bộ kiểm thử | Lệnh | Nội dung |
|---|---|---|
| Đơn vị (20) | `npm test` | Trích README (Anh/Việt/Trung, HTML), chống XSS, đổi link tương đối; phân loại giấy phép; chấm điểm, dữ liệu thiếu, cờ bất thường; xu hướng; nhận diện bộ cài theo OS; truy vấn GraphQL hợp lệ với schema GitHub; chuẩn hóa phản hồi GraphQL; kiểm tra catalog |
| Đầu-cuối (26) | `npm run test:e2e` | 371 URL trả 200; 404 tiếng Việt; sitemap; không lỗi console; không tràn ngang ở 390px; menu và bộ lọc trên điện thoại; tìm kiếm không dấu/sai chính tả/theo tác giả; bộ lọc + URL; sắp xếp; ẩn repo lưu trữ; nút tải về đúng nguồn; cảnh báo; số liệu khớp dữ liệu; README đã làm sạch; yêu thích + bộ sưu tập + link chia sẻ; chuyển giao diện; bảng đánh giá |
| CSDL | `npm run test:db` | Migration, nạp dữ liệu, quan hệ, upsert lặp lại, truy vấn tiếng Việt, RLS |
| Liên kết | `npm run check-links` | Trang GitHub, ZIP, trang release, ZIP theo phiên bản, link tài liệu/demo của toàn bộ thư viện |
