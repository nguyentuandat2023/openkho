# Thư mục dữ liệu

| Đường dẫn | Ai sửa | Nội dung |
|---|---|---|
| `categories.yaml` | Người quản trị | Danh sách danh mục |
| `catalog/<danh-mục>.yaml` | Người quản trị | Danh sách repository + nội dung biên tập (tiếng Việt) |
| `github/<owner>__<repo>.json` | **Tự động** (`npm run sync`) | Số liệu thật lấy từ GitHub: sao, fork, giấy phép, release, README… kèm thời điểm lấy |
| `history/stars.json` | **Tự động** | Lịch sử số sao/fork theo ngày (để tính "đang phát triển mạnh") |
| `sync-report.json` | **Tự động** | Báo cáo lần đồng bộ gần nhất: repo bị xóa, đổi tên, lưu trữ, lỗi |
| `candidates.json` | **Tự động** (`npm run discover`) | Repo ứng viên do công cụ khám phá tìm ra, chờ duyệt |

> **Quy tắc vàng:** không bao giờ nhập tay số liệu (sao, fork, ngày…) vào file `catalog`. Mọi con số hiển thị trên website đều đến từ `data/github/*.json` do script đồng bộ ghi, kèm thời điểm lấy dữ liệu.

## Cấu trúc một mục trong `catalog/<danh-mục>.yaml`

Chỉ trường `repo` là bắt buộc. Danh mục chính = tên file.

```yaml
- repo: owner/ten-repo            # BẮT BUỘC – đúng như trên github.com
  also: [chatbot-llm]             # danh mục phụ (slug)
  tags: [rag, python]             # từ khóa
  summary: "Mô tả ngắn 1–2 câu bằng tiếng Việt"
  use_cases: ["Ứng dụng thực tế 1", "Ứng dụng thực tế 2"]
  features: ["Tính năng nổi bật"]  # nếu bỏ trống: tự trích từ README
  pros: ["Ưu điểm"]               # ngoài ra hệ thống tự thêm ưu/nhược điểm từ số liệu
  cons: ["Nhược điểm"]
  platforms: [windows, macos, linux, docker, web, android, ios]
  deploy: [desktop, local, self-host, cli, library, extension, skill, cloud, content]
  difficulty: easy | medium | hard              # độ khó cài đặt
  pricing: free | freemium | paid-license       # chi phí phần mềm
  needs_api_key: none | optional | required     # có cần khóa API dịch vụ trả phí không
  requirements: "Yêu cầu cấu hình"
  license_note: "Ghi chú giấy phép (vd. trọng số mô hình phi thương mại)"
  note: "Cảnh báo/ghi chú biên tập"
  quick_start: |
    lệnh cài đặt nhanh
  docs: https://...               # link tài liệu (nếu khác homepage)
  demo: https://...               # link demo chính thức
  video: https://www.youtube.com/watch?v=...
  alternatives: [owner/repo]      # gợi ý thay thế (vd. khi repo đã lưu trữ)
  applicability: 1-5              # mức độ ứng dụng thực tế (đánh giá biên tập)
  featured: true                  # hiện ở mục "Nổi bật" trang chủ
```

Ý nghĩa các giá trị:

- `deploy`: `desktop` cài như phần mềm · `local` chạy trên máy qua Python/Node rồi mở giao diện web · `self-host` cài trên máy chủ/Docker · `cli` dòng lệnh · `library` thư viện cho lập trình viên · `extension` tiện ích trình duyệt/IDE · `skill` kỹ năng cho AI agent · `cloud` có dịch vụ cloud chính thức · `content` tài liệu/danh sách
- `pricing`: `free` miễn phí hoàn toàn · `freemium` miễn phí tự cài, có bản cloud/doanh nghiệp trả phí · `paid-license` phải mua giấy phép trong một số trường hợp
- `needs_api_key`: `required` bắt buộc khóa API dịch vụ trả phí (OpenAI…) · `optional` dùng được với mô hình chạy local hoặc gói miễn phí · `none` không cần
