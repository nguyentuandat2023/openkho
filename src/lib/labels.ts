// Nhãn tiếng Việt cho các giá trị dữ liệu – dùng chung cho mọi trang và bộ lọc.
import type { ApiKey, Commercial, Deploy, Difficulty, LicenseClass, Platform, Pricing, TierKey } from './types';

export const TIER: Record<TierKey, { label: string; tone: 'gold' | 'ok' | 'info' | 'warn' }> = {
  excellent: { label: 'Xuất sắc', tone: 'gold' },
  good: { label: 'Tốt', tone: 'ok' },
  potential: { label: 'Tiềm năng', tone: 'info' },
  review: { label: 'Cần kiểm tra thêm', tone: 'warn' },
};

export const PLATFORM: Record<Platform, string> = {
  windows: 'Windows', macos: 'macOS', linux: 'Linux', docker: 'Docker', web: 'Trình duyệt', android: 'Android', ios: 'iOS',
};

export const DEPLOY: Record<Deploy, string> = {
  desktop: 'Ứng dụng cài trên máy',
  local: 'Chạy trên máy (giao diện web cục bộ)',
  'self-host': 'Tự host trên máy chủ',
  cli: 'Dòng lệnh',
  library: 'Thư viện cho lập trình viên',
  extension: 'Tiện ích mở rộng',
  skill: 'Kỹ năng cho AI agent',
  cloud: 'Có dịch vụ cloud chính thức',
  content: 'Tài liệu / danh sách',
};

export const DEPLOY_SHORT: Record<Deploy, string> = {
  desktop: 'Desktop', local: 'Chạy local', 'self-host': 'Tự host', cli: 'Dòng lệnh', library: 'Thư viện',
  extension: 'Tiện ích', skill: 'Skill AI', cloud: 'Cloud', content: 'Tài liệu',
};

export const DIFFICULTY: Record<Difficulty, string> = { easy: 'Dễ cài', medium: 'Trung bình', hard: 'Khó cài' };

export const PRICING: Record<Pricing, string> = {
  free: 'Miễn phí',
  freemium: 'Miễn phí, có bản trả phí',
  'paid-license': 'Cần mua giấy phép (tùy quy mô)',
};

export const API_KEY: Record<ApiKey, string> = {
  none: 'Không cần khóa API',
  optional: 'Khóa API tùy chọn (chạy được với mô hình local/gói miễn phí)',
  required: 'Cần khóa API/tài khoản dịch vụ trả phí',
};

export const API_KEY_SHORT: Record<ApiKey, string> = { none: 'Không cần API', optional: 'API tùy chọn', required: 'Cần API trả phí' };

export const COMMERCIAL: Record<Commercial, { label: string; tone: 'ok' | 'gold' | 'warn' | 'danger' }> = {
  yes: { label: 'Dùng thương mại', tone: 'ok' },
  conditions: { label: 'Thương mại có điều kiện', tone: 'gold' },
  restricted: { label: 'Giấy phép hạn chế', tone: 'warn' },
  unknown: { label: 'Cần đọc giấy phép', tone: 'warn' },
  no: { label: 'Không dùng thương mại', tone: 'danger' },
};

/** Nhóm giấy phép cho bộ lọc (theo quyền dùng thương mại). */
export const LICENSE_GROUP: { key: string; label: string; classes: LicenseClass[] }[] = [
  { key: 'free', label: 'Dùng thương mại thoải mái', classes: ['permissive', 'weak-copyleft', 'content'] },
  { key: 'copyleft', label: 'Có điều kiện (copyleft)', classes: ['copyleft'] },
  { key: 'restricted', label: 'Hạn chế / cần đọc kỹ', classes: ['source-available', 'custom'] },
  { key: 'no', label: 'Không dùng thương mại / chưa có', classes: ['noncommercial', 'none'] },
];

export const SORTS = [
  { key: 'relevance', label: 'Phù hợp nhất' },
  { key: 'score', label: 'Chất lượng cao nhất' },
  { key: 'trend1', label: 'Thịnh hành hôm nay' },
  { key: 'trend7', label: 'Thịnh hành tuần này' },
  { key: 'trend30', label: 'Thịnh hành tháng này' },
  { key: 'growth1', label: 'Tăng sao nhanh nhất (24 giờ)' },
  { key: 'growth7', label: 'Tăng sao nhanh nhất (7 ngày)' },
  { key: 'growth30', label: 'Tăng sao nhanh nhất (30 ngày)' },
  { key: 'stars', label: 'Nhiều sao nhất' },
  { key: 'forks', label: 'Nhiều fork nhất' },
  { key: 'created', label: 'Mới tạo gần đây' },
  { key: 'updated', label: 'Mới cập nhật mã nguồn' },
  { key: 'release', label: 'Vừa phát hành phiên bản' },
  { key: 'added', label: 'Mới thêm vào kho' },
  { key: 'name', label: 'Tên A–Z' },
] as const;

export const SOURCE_LABEL: Record<string, { label: string; help: string }> = {
  lib: { label: 'Thư viện', help: 'Dự án do biên tập viên chọn và repo tự phát hiện đã đủ điều kiện có trang riêng' },
  c: { label: 'Biên tập chọn', help: 'Chỉ dự án do biên tập viên chọn' },
  r: { label: 'Tự phát hiện', help: 'Chỉ repo hệ thống tự phát hiện qua GitHub Search API (chưa qua biên tập)' },
  all: { label: 'Tất cả', help: 'Toàn bộ repo đang theo dõi, gồm repo tự phát hiện chưa có trang riêng' },
};

export const CRITERIA_HELP: Record<string, string> = {
  popularity: 'Số sao và fork (thang logarit — 100 sao = 0, 200.000 sao = tối đa)',
  quality: 'Giấy phép, bản phát hành, độ trưởng thành, thông tin dự án đầy đủ',
  applicability: 'Đánh giá biên tập về giá trị thực tế cho người dùng Việt Nam',
  freshness: 'Commit gần nhất và số commit trong 90 ngày',
  docs: 'README, hướng dẫn cài đặt, hướng dẫn sử dụng, trang tài liệu',
  community: 'Số người đóng góp, kênh thảo luận và báo lỗi',
};
