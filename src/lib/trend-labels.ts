// Nhãn hiển thị cho hệ thống xu hướng (dùng chung trang Xu hướng, trang chi tiết, phương pháp).
import type { GrowthMethod, WindowKey } from './types';

export const WINDOW_LABEL: Record<WindowKey, { short: string; long: string; tab: string }> = {
  d1: { short: '24 giờ', long: '24 giờ qua', tab: 'Hôm nay' },
  d7: { short: '7 ngày', long: '7 ngày qua', tab: 'Tuần này' },
  d30: { short: '30 ngày', long: '30 ngày qua', tab: 'Tháng này' },
};

export const METHOD: Record<GrowthMethod, { label: string; help: string }> = {
  snapshots: { label: 'đo trực tiếp', help: 'Hiệu số sao giữa hai lần đồng bộ thật, cách nhau đúng (hoặc gần đúng) độ dài kỳ.' },
  created_in_window: { label: 'tạo trong kỳ', help: 'Repo được tạo trong kỳ nên toàn bộ số sao hiện có đều phát sinh trong kỳ.' },
  stargazer_sample: { label: 'đếm lượt gắn sao', help: 'Đếm thời điểm gắn sao qua GitHub API; mẫu đủ dài để bao trùm cả kỳ.' },
};

export const COMPONENT_HELP: Record<string, string> = {
  star_growth: 'Số sao tăng trong kỳ: 60% theo số tuyệt đối (thang log), 40% theo tỉ lệ so với đầu kỳ — để dự án nhỏ tăng nhanh không bị dự án lớn lấn át.',
  activity: 'Hoạt động mã nguồn thật: commit trên nhánh chính (hoặc lần push gần nhất). Không tính thay đổi chỉ về mô tả/sao.',
  community: 'Fork mới trong kỳ, số người đóng góp, tỉ lệ fork/sao, kênh issue và thảo luận.',
  momentum: 'Độ mới của dự án, tăng tốc so với kỳ dài hơn, bản phát hành gần đây.',
  docs: 'Độ đầy đủ README, có hướng dẫn cài đặt/sử dụng, mô tả và topic.',
  maintenance: 'Có giấy phép, có kênh báo lỗi, có push trong 90 ngày.',
};

export const MISSING_HELP = 'Mục thiếu dữ liệu không được tính như dữ liệu thật: điểm được tính lại trên phần có dữ liệu và công bố kèm độ phủ.';

export function signedNum(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('vi-VN')}`;
}

export function spanText(h: number): string {
  if (h < 48) return `${Math.round(h)} giờ`;
  return `${(Math.round((h / 24) * 10) / 10).toLocaleString('vi-VN')} ngày`;
}
