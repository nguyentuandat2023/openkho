# Hệ thống tự động khám phá và xếp hạng repository

Tài liệu cho người vận hành OpenKho: hệ thống tự tìm repository GitHub mới nổi, đo tăng trưởng, chấm điểm, xếp hạng và cập nhật website — không cần thao tác tay.

## 1. Luồng xử lý

```
KHÁM PHÁ ──► THU THẬP SỐ LIỆU ──► PHÂN TÍCH CHẤT LƯỢNG ──► PHÁT HIỆN XU HƯỚNG ──► XẾP HẠNG ──► CẬP NHẬT WEBSITE
 discover      refresh               reevaluate               snapshot + trending    rank         build-data + next build
 (3 giờ)       (6 giờ)               (7 ngày)                 (mỗi lần đo)           (24 giờ*)    (sau mỗi job có thay đổi)
```

\* Job `rank` còn tự chạy ngay sau mỗi job làm thay đổi dữ liệu (không gọi mạng, vài giây), nên bảng xếp hạng luôn khớp số liệu mới nhất. Lịch 24 giờ bảo đảm mỗi ngày có ít nhất một điểm lịch sử.

| Job | Mặc định | Làm gì | Gọi API |
|---|---|---|---|
| `discover` | 3 giờ | 30 truy vấn GitHub Search API: repo tạo trong 7/30/90 ngày, phổ biến nhất, trẻ và đang hoạt động, theo topic (xoay vòng), ứng viên "viên ngọc ẩn". Thêm/cập nhật radar theo GitHub ID, ghi snapshot, lấy README cho ứng viên. | Search (10 lượt/phút không token) + raw.githubusercontent |
| `refresh` | 6 giờ | Đồng bộ catalog (bỏ qua chi tiết khi repo không có push mới); cập nhật radar theo lô 35 repo/lượt; tra repo mất tích theo GitHub ID (đổi tên/chuyển chủ/xóa); feed commit, bản phát hành, README, người đóng góp cho ứng viên. | Search + core (giới hạn) + Atom feed |
| `rank` | 24 giờ | Quality Score, Trending Score 3 kỳ, lĩnh vực, viên ngọc ẩn, phát hiện cụm spam, lịch sử điểm, danh sách trang radar được xuất bản. | Không |
| `reevaluate` | 7 ngày | Làm mới số người đóng góp, README, bản phát hành cho catalog và repo radar đã xuất bản. | core (giới hạn) |
| `cleanup` | 30 ngày | Áp dụng chính sách lưu giữ: snapshot cũ, repo radar không còn thấy, file mồ côi, cache ETag, nhật ký job. | Không |
| `ai_analyze` | 7 ngày, **tắt** | Tóm tắt README bằng Claude (xem mục 8). | Claude API (trả phí) |

Không có job nào chạy trên trình duyệt. Website là trang tĩnh: không phụ thuộc thời gian phản hồi của GitHub; khi GitHub lỗi, website vẫn hiển thị dữ liệu đã lưu kèm thời điểm, và hiện cảnh báo "Dữ liệu có thể đã cũ" khi quá 2 chu kỳ cập nhật không đồng bộ được.

## 2. Chạy tự động

### 2.1. Trên GitHub Actions (khuyến nghị khi đã đưa website lên GitHub)

`.github/workflows/scheduler.yml` chạy mỗi giờ (phút 17): kiểm tra job đến hạn theo `data/settings.json` → chạy (tối đa 3 job/lượt) → commit thư mục `data/` → kiểm thử → build → triển khai GitHub Pages. Không có job đến hạn thì dừng sau vài giây.

- Dùng chung nhóm `concurrency: openkho-data` với `sync-deploy.yml` → hai workflow không bao giờ chạy song song.
- Trạng thái job được commit kể cả khi job thất bại (để lần sau biết mà thử lại); workflow vẫn báo lỗi để bạn thấy.
- Bí mật (Settings → Secrets → Actions): `SYNC_TOKEN` (tùy chọn, token cá nhân 5.000 lượt/giờ — mặc định dùng token có sẵn của Actions), `ANTHROPIC_API_KEY` (chỉ khi bật AI).
- Chạy tay: tab Actions → "Tự động khám phá và cập nhật" → Run workflow (chọn job hoặc để trống).

### 2.2. Trên máy tính/máy chủ riêng

```bash
npm run scheduler                 # daemon chạy nền (hoặc file 5_TU_DONG_CAP_NHAT.bat)
npm run scheduler -- --once       # chạy một vòng rồi thoát (dùng với cron/Task Scheduler)
```

Daemon kiểm tra mỗi phút, đọc lại cấu hình mỗi vòng (đổi lịch ở trang quản trị có hiệu lực ngay), chạy từng job trong tiến trình con riêng (bị treo thì bị dừng sau `max_job_minutes`), rồi dựng lại website theo `scheduler.site_rebuild` (`full` = `npm run build`, `data` = chỉ dữ liệu, `off`). Chỉ một daemon trên mỗi máy.

### 2.3. Dòng lệnh

```bash
npm run jobs -- status            # trạng thái từng job, khóa, daemon, lần chạy tới
npm run jobs -- due               # job đến hạn (mã thoát 10 = không có)
npm run jobs -- run discover      # chạy ngay một job
npm run jobs -- run-due           # chạy các job đến hạn
npm run jobs -- history           # lịch sử chạy
npm run jobs -- unlock [--force]  # gỡ khóa treo
```

## 3. Độ tin cậy

| Cơ chế | Cách làm |
|---|---|
| Không chạy trùng | Khóa toàn cục `.cache/scheduler.lock` tạo nguyên tử (`O_EXCL`); job thứ hai bị ghi "bỏ qua". Trên Actions thêm `concurrency`. |
| Phát hiện treo | Heartbeat 30 giây/lần; khóa bị coi là treo khi tiến trình đã chết, quá 10 phút không heartbeat, hoặc chạy quá `max_job_minutes` + 10. Khóa treo được thu hồi tự động. |
| Giới hạn thời gian | Hết `max_job_minutes` → yêu cầu dừng; quá thêm 2 phút → kết thúc cưỡng bức, ghi "quá giờ". |
| Thử lại | Lỗi tạm thời (mạng, 5xx): thử lại tối đa `retry.attempts` lần, chờ `base_delay_seconds × 2^n` (có nhiễu). Lỗi chương trình và 401 không thử lại. |
| Hết hạn mức API | Ghi "hoãn" tới thời điểm reset + 1 phút; dữ liệu cũ giữ nguyên. |
| Thất bại | Lần tới = min(chu kỳ, `failure_backoff_minutes × 2^(số lần lỗi − 1)`). |
| Khởi động lại sau sự cố | Lượt chạy dở (tiến trình chết, mất điện) được đánh dấu "bị gián đoạn" và lên lịch chạy lại ngay. |
| Ghi file an toàn | Mọi file JSON ghi qua file tạm rồi đổi tên (không có file ghi dở). |
| Không trùng repo | Khóa chính là GitHub Repository ID; repo đổi tên/chuyển chủ được cập nhật tại chỗ, giữ lịch sử. Repo đã có trong catalog không được thêm vào radar. |
| Token hết hạn | 401 → job "thất bại" với hướng dẫn tạo token mới; dữ liệu cũ giữ nguyên. |

Trạng thái: `data/jobs/state.json` (từng job), `data/jobs/history.json` (300 lượt gần nhất, kèm 25 dòng nhật ký cuối), `.cache/jobs/logs/<lượt>.log` (nhật ký đầy đủ, không commit).

## 4. Cấu hình — `data/settings.json`

Sửa ở trang Quản trị (tab "Lịch & trọng số") hoặc sửa file. Giá trị sai kiểu/ngoài khoảng bị thay bằng mặc định và báo cảnh báo — không làm hỏng job.

| Nhóm | Khóa chính |
|---|---|
| `scheduler` | `enabled` (bật/tắt toàn bộ), `jobs.<tên>.enabled/interval_hours`, `max_job_minutes`, `retry`, `failure_backoff_minutes`, `rank_after_data_jobs`, `site_rebuild` |
| `discovery` | `max_radar_repos` (3000), `max_queries_per_run` (30), `new_windows`, `popular_min_stars`, `young_active`, `topics`, `topic_min_stars`, `gem_star_range` (50–3000), `readme_fetch_per_run`, `commit_feeds_per_run`, `stargazer_samples_per_run` |
| `trending` | `weights` (35/20/15/15/10/5 — luôn quy về tổng 100), `min_coverage` (0,6), `anomaly_damping` (0,5) |
| `publish` | `radar_detail_min_stars` (200), `radar_detail_max_pages` (600), `readme_min_chars` (1500), `radar_index_without_summary` (false) |
| `retention` | `recent_snapshot_hours` (60), `daily_snapshot_days` (400), `radar_unseen_days` (45), `job_history` (300), `score_history_days` (400), `job_log_days` (30) |
| `ai` | `enabled` (false), `model` (claude-opus-5-5), `effort`, `max_per_run`, `readme_max_chars`, `min_verified_ratio` |

## 5. Dữ liệu

| File | Nội dung |
|---|---|
| `data/radar/repos.json` | Repo tự phát hiện, khóa GitHub ID: số liệu, nhóm truy vấn đã thấy, lần đầu/lần cuối thấy, feed commit, README tóm tắt |
| `data/radar/readme/<id>.json` | Trích đoạn README đã làm sạch (chỉ ứng viên có trang/viên ngọc ẩn) |
| `data/radar/published.json` | Repo radar có trang chi tiết (ổn định: chỉ gỡ khi bị ẩn/loại trừ/xóa, hoặc không đủ điều kiện liên tục quá 7 ngày) |
| `data/snapshots/recent.json` | Mọi lần đo sao/fork trong ~60 giờ (cho kỳ 24 giờ) |
| `data/snapshots/daily/YYYY-MM.json` | Lần đo cuối mỗi ngày (UTC), giữ ~400 ngày |
| `data/scores/history.json` | Điểm mỗi ngày: [ngày, Trending 24h/7d/30d, Quality] |
| `data/moderation.json` | Ẩn / loại trừ (repo, chủ sở hữu) / ghim |
| `data/admin-actions.ndjson` | Nhật ký thao tác quản trị |
| `data/jobs/*.json` | Trạng thái, lịch sử job, báo cáo chất lượng dữ liệu |
| `data/ai/<id>.json` | Kết quả phân tích AI (nếu bật) |
| `data/history/stars.json` | Lịch sử cũ (phiên bản trước) — chỉ đọc, không còn ghi |

Dung lượng: radar ~2–4 MB, snapshot ~0,1 MB/ngày cho ~2.000 repo. Kho git tăng dần theo các commit tự động; nếu cần, chuyển `data/snapshots` sang nhánh riêng (xem mục 10).

## 6. Công thức (tóm tắt — đầy đủ ở trang /phuong-phap/)

**Tăng trưởng** chỉ từ số liệu thật: hiệu hai lần đo cách nhau đúng kỳ (dung sai 24h ±6h, 7 ngày ±1 ngày, 30 ngày ±3 ngày); repo tạo trong kỳ (mọi sao đều phát sinh trong kỳ); hoặc đếm thời điểm gắn sao (cần token). Không có → "chưa đủ dữ liệu".

**Trending Score** = tổng có trọng số của 6 thành phần, chuẩn hóa log; điểm sao = 60% tuyệt đối + 40% tương đối (repo tạo trong kỳ chỉ tính tuyệt đối). Mục thiếu dữ liệu bị loại khỏi mẫu số; độ phủ < 60% → không xếp hạng. Tín hiệu bất thường → điểm sao × 0,5 và nhãn "Cần kiểm chứng".

**Quality Score** (100 điểm, 6 tiêu chí): dữ liệu thiếu bị loại khỏi phép tính, nhóm dưới 50% dữ liệu bị loại, công bố độ phủ; "Xuất sắc" cần độ phủ ≥ 70%. Repo radar: tiêu chí "Tính ứng dụng" (biên tập) không áp dụng.

**Viên ngọc ẩn**: Quality không tính nhóm phổ biến ≥ 75, độ phủ ≥ 70%, 50–3.000 sao, có hoạt động mã trong 30 ngày, giấy phép dùng được.

**Lĩnh vực** (20, đa nhãn): quy tắc trong `data/areas.yaml` — topic 3 điểm, mô tả 2, tên 1, README 1 (từ khóa xuất hiện ≥ 2 lần), ngôn ngữ 0,5; gán khi ≥ 3 điểm; độ tin cậy = điểm/8. Sửa file YAML để thêm từ khóa, không cần sửa mã.

## 7. Spam và tín hiệu bất thường

- **Cụm repo nhân bản**: ≥ 3 repo cùng tên từ ≥ 3 tài khoản, tạo cách nhau ≤ 72 giờ, số sao/mô tả/dung lượng giống hệt → tự động loại khỏi mọi bảng xếp hạng, chỉ mục tìm kiếm và trang chi tiết; liệt kê ở trang Quản trị. Lần chạy đầu tiên đã loại 36 repo thuộc 3 cụm.
- **Bất thường** (không loại, chỉ giảm điểm + cảnh báo): ≥ 300 sao trong kỳ nhưng fork < 0,3%; repo ≤ 60 ngày tuổi ≥ 300 sao nhưng fork < 0,5% và không có issue; rất ít người đóng góp so với tốc độ tăng sao.
- Quản trị viên có thể **loại trừ** repo hoặc cả chủ sở hữu (không bao giờ thêm lại), **ẩn** repo (không hiển thị), **ghim** repo (mục riêng, không đổi thứ hạng tự động).

## 8. Phân tích AI (tùy chọn, mặc định tắt)

1. Đặt `ANTHROPIC_API_KEY` trong `.env.local` (máy) hoặc secret của GitHub Actions. Không đưa khóa vào mã nguồn.
2. Bật `ai.enabled: true` và job `ai_analyze` trong `data/settings.json`.

Dùng SDK chính thức `@anthropic-ai/sdk` (structured output theo schema, adaptive thinking, server-side fallback). Mỗi lợi ích/điểm nổi bật phải kèm trích dẫn nguyên văn; trích dẫn được đối chiếu với README, nhận định không khớp hoặc khẳng định "an toàn/bảo mật" bị loại; tỉ lệ giữ lại < 50% → bỏ cả bản phân tích. Chỉ phân tích lại khi README/mô tả đổi. Trang website gắn nhãn "do AI tạo" kèm model và thời điểm.

Chi phí ước tính (giá claude-opus-5-5: 4 USD/1 triệu token vào, 20 USD/1 triệu token ra): ~6–8 nghìn token vào + 1–3 nghìn token ra mỗi repo ≈ 0,05–0,09 USD/repo; 15 repo/tuần ≈ 1–1,5 USD/tuần. Chưa chạy thật trong lần triển khai này (chưa có khóa API, chưa được duyệt chi phí).

## 9. Trang Quản trị

`npm run admin` (hoặc `4_QUAN_TRI.bat`) → http://localhost:4321. Tab mới:

- **Tự động hóa**: tổng số repo, mới phát hiện 24 giờ/7 ngày, số repo có điểm xu hướng, trạng thái bộ lập lịch/daemon/khóa, hạn mức API, bảng job (chạy ngay), lịch sử, lỗi API, sức khỏe file dữ liệu, chất lượng dữ liệu, thống kê theo lĩnh vực/danh mục; bật/tắt tự động cập nhật; gỡ khóa treo.
- **Radar**: lọc (có trang, đủ điều kiện, mới 7 ngày, gem, bất thường, nghi spam, ẩn, loại trừ, ghim, mất tích), sắp xếp; ẩn/ghim/loại trừ, loại trừ chủ sở hữu; đưa repo vào thư viện biên tập.
- **Lịch & trọng số**: chu kỳ/bật tắt từng job, thời gian tối đa, thử lại, dựng lại website; trọng số Trending Score, độ phủ tối thiểu, hệ số giảm; giới hạn radar, ngưỡng xuất bản, topic.
- **Kiểm tra**: kiểm tra trước xuất bản (catalog, cấu hình, trang radar có ID và số liệu, repo bị ẩn/nghi spam không lọt ra, mọi điểm có phương pháp đo, không có điểm đo ở tương lai, độ mới dữ liệu, không lộ token, kích thước chỉ mục) → nút build chỉ bật khi đạt; danh sách kiểm duyệt; nhật ký thao tác.

Bảo mật: mặc định chỉ nghe `127.0.0.1`; đặt `ADMIN_PASSWORD` để bắt buộc đăng nhập (cookie HttpOnly ký HMAC, hết hạn 12 giờ, khóa 15 phút sau 5 lần sai). Muốn mở ra mạng nội bộ: `ADMIN_HOST=0.0.0.0` **và** `ADMIN_PASSWORD` (thiếu mật khẩu thì máy chủ từ chối khởi động), thêm `ADMIN_ORIGIN=http://<ip>:4321`. Mọi thao tác ghi cần header chống CSRF và Origin hợp lệ; mọi thay đổi được ghi `data/admin-actions.ndjson`.

## 10. Cơ sở dữ liệu PostgreSQL / Supabase

`supabase/migrations/0002_automation.sql` (chạy lại nhiều lần an toàn) thêm: `github_id`/`node_id`/`origin`/cờ ẩn-loại trừ-ghim/`suppressed_reason` cho `repositories`; `kind` cho `categories` (lĩnh vực lưu với slug `area-…`); `confidence`/`signals` cho nhãn tự động; bảng `repository_metrics`, `repository_metric_snapshots`, `repository_scores` (ràng buộc: không có điểm xu hướng nếu thiếu phương pháp đo), `repository_ai_analyses`, `sync_jobs`, `sync_logs`, `sync_settings`, `admin_actions`, `schema_migrations`; RLS (điểm/số liệu ai cũng đọc; job/cấu hình/nhật ký chỉ biên tập viên); hàm `apply_retention()`; view `trending_latest`.

```bash
DATABASE_URL=postgresql://... npm run db:load -- --migrate   # chỉ chạy migration chưa áp dụng, mỗi migration một transaction
npm run test:db                                              # kiểm thử toàn bộ trên PGlite
```

## 11. Hạn mức GitHub API

| | Không token | Có token |
|---|---|---|
| Search | 10 lượt/phút | 30 lượt/phút |
| REST core | 60 lượt/giờ | 5.000 (cá nhân) / 1.000 (token Actions) |
| GraphQL | không dùng | 5.000 điểm/giờ |
| Danh sách người gắn sao | **cần token** | có |

Hệ thống tự chờ khi hết lượt trong phút, hoãn job khi hết lượt giờ, dùng ETag để lần gọi lại gần như miễn phí, dùng Atom feed/raw.githubusercontent (không tính hạn mức API) cho commit, bản phát hành và README. Không cào HTML, không dùng trang Trending.

## 12. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Job "bị gián đoạn" | Tự chạy lại ở vòng sau; xem nhật ký trong tab Tự động hóa. |
| Khóa "TREO" | Tự thu hồi khi tiến trình đã chết; hoặc `npm run jobs -- unlock`. |
| "Hoãn (hết hạn mức)" | Chờ tới giờ reset hoặc thêm `GITHUB_TOKEN`. |
| 401 Bad credentials | Token hết hạn — tạo token mới hoặc xóa dòng `GITHUB_TOKEN` để chạy không token. |
| Website báo "Dữ liệu có thể đã cũ" | Bộ lập lịch không chạy được quá 2 chu kỳ: kiểm tra Actions/daemon, tab Tự động hóa. |
| Kỳ "Hôm nay" trống | Bình thường trong ~18–30 giờ đầu: cần hai lần đo cách nhau ~24 giờ. |

## 13. Kiểm thử

```bash
npm test            # 50 kiểm thử đơn vị (chạy trong thư mục tạm, không gọi API thật)
npm run test:db     # PostgreSQL: migration, nạp, upsert, đổi tên, ràng buộc, lưu giữ, RLS
npm run test:e2e    # 34 kiểm thử trình duyệt trên bản build
```
