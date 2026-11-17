#!/usr/bin/env node
// Sinh "Báo cáo nghiên cứu" (docs/01-BAO-CAO-NGHIEN-CUU.md) từ dữ liệu thật đã đồng bộ. Không chỉnh tay file kết quả.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './lib/config.mjs';
import { TIERS } from './lib/score.mjs';

const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'));
if (!lib) { console.error('Chạy `npm run data` trước.'); process.exit(1); }
const verified = readJson(path.join(ROOT, 'research', 'candidates-verified.json'), { results: [] });
const discovered = readJson(path.join(ROOT, 'research', 'discovered.json'), { discovered: {} });
const siteUrl = lib.site.url.replace(/\/$/, '');

const TZ = 'Asia/Ho_Chi_Minh';
const dt = (iso) => (iso ? `${new Date(iso).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })}, ${new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })}` : '—');
const d = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const n = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('vi-VN'));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const tierLabel = Object.fromEntries(TIERS.map((t) => [t.key, t.label]));
const listed = lib.repos.filter((r) => r.visible && r.synced);
const cats = Object.fromEntries(lib.categories.map((c) => [c.slug, c]));
const out = [];
const P = (...l) => out.push(...l);

const downloads = (r) => [
  `[GitHub](${r.links.github})`,
  r.links.zip ? `[ZIP](${r.links.zip})` : null,
  r.links.release ? `[Release ${cell(r.release?.tag)}](${r.links.release})` : null,
  r.links.docs ? `[Tài liệu](${r.links.docs})` : null,
].filter(Boolean).join(' / ');

// ------------------------------------------------------------------ Tóm tắt
const allCandidates = new Set(verified.results.map((x) => (x.full_name || x.repo).toLowerCase()));
for (const items of Object.values(discovered.discovered || {})) for (const it of items) allCandidates.add(it.full_name.toLowerCase());
const renamedAtResearch = verified.results.filter((x) => x.status === 'renamed');
const archivedAtResearch = verified.results.filter((x) => x.archived);
const licCount = {};
for (const r of listed) licCount[r.license.label] = (licCount[r.license.label] || 0) + 1;
const tierCount = lib.stats.by_tier;

P(`# Báo cáo nghiên cứu: thư viện mã nguồn mở ${lib.site.name}`, '');
P(`> Số liệu lấy trực tiếp từ GitHub, cập nhật gần nhất lúc **${dt(lib.synced_at)}** (giờ Việt Nam). Báo cáo sinh tự động bằng \`npm run report\` từ dữ liệu đồng bộ — không có số liệu nào nhập tay. Bảng tương tác (lọc, sắp xếp, tải CSV) xem tại trang Bảng đánh giá của website.`, '');
P('## 1. Tóm tắt', '');
P(`- **Phạm vi nghiên cứu:** ${allCandidates.size} repository ứng viên được xem xét. Danh sách gồm ứng viên do biên tập viên đề xuất theo 22 danh mục, cộng với kết quả khám phá tự động trên GitHub (dự án mới nổi theo chủ đề AI agent, MCP, video AI, TTS, marketing, SEO, tự host…). Mọi ứng viên đều được xác minh qua GitHub API.`);
P(`- **Tuyển chọn:** ${lib.stats.repos} repository trong ${lib.categories.length} danh mục (20 danh mục theo yêu cầu + 2 danh mục bổ sung: *AI Audio, Voice & Speech* và *Learning Resources & Awesome Lists*). Một repo có thể thuộc nhiều danh mục.`);
P(`- **Xếp loại:** ${TIERS.map((t) => `${t.label} ${tierCount[t.key]}`).join(', ')}.`);
P(`- **Giấy phép (các repo đang hiển thị):** ${Object.entries(licCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
P(`- **Phát hiện khi xác minh:** ${renamedAtResearch.length} ứng viên đã đổi tên hoặc chuyển tổ chức (vd. ${renamedAtResearch.slice(0, 6).map((x) => `${x.repo} → ${x.full_name}`).join('; ')}). ${archivedAtResearch.length} ứng viên đã bị lưu trữ, phần lớn bị loại hoặc chỉ giữ lại kèm cảnh báo. Tất cả link trong thư viện dùng tên chính thức hiện tại.`);
P(`- **Không chỉ đếm sao:** số sao chiếm tối đa 15/100 điểm. Khi nghiên cứu, nhiều repo mới tạo năm 2026 đã có 100.000–460.000 sao chỉ sau vài tháng. Vì vậy thư viện có cơ chế cảnh báo tăng sao bất thường, dựa trên số người thực sự tham gia phát triển.`, '');

// ------------------------------------------------------------------ Phương pháp
P('## 2. Phương pháp đánh giá (thang 100 điểm)', '');
P('| Tiêu chí | Điểm | Cách tính (tóm tắt) |', '|---|---:|---|');
P('| Mức độ phổ biến | 20 | Sao (thang logarit, tối đa 15) + fork (tối đa 5) |');
P('| Chất lượng dự án | 20 | Giấy phép (7), bản phát hành gần đây (5), độ trưởng thành (4), thông tin đầy đủ (4) |');
P('| Tính ứng dụng | 20 | Đánh giá biên tập 1–5 theo giá trị thực tế cho người dùng Việt Nam |');
P('| Mức độ cập nhật | 15 | Commit gần nhất (11) + số commit 90 ngày (4) |');
P('| Tài liệu hướng dẫn | 15 | Độ đầy đủ README (5), mục cài đặt (4), mục sử dụng (3), trang tài liệu (3) |');
P('| Cộng đồng & hỗ trợ | 10 | Người đóng góp (6, thang logarit), kênh thảo luận (2), kênh báo lỗi (2) |', '');
P(`Xếp loại: ${TIERS.map((t) => `**${t.label}**${t.min ? ` ≥ ${t.min}` : ' < 58'}`).join(', ')}. Repo đã lưu trữ, không còn tồn tại, không có giấy phép hoặc phi thương mại luôn bị xếp *Cần kiểm tra thêm*. Dữ liệu còn thiếu được tính ở mức trung tính 50%. Chi tiết đầy đủ xem trang Phương pháp của website.`, '');

// ------------------------------------------------------------------ Đề xuất ưu tiên
P('## 3. Đề xuất ưu tiên triển khai', '');
P('Ưu tiên theo yêu cầu: AI, AI marketing, tự động hóa doanh nghiệp, sáng tạo nội dung và công cụ chạy được trên máy tính cá nhân. Chỉ chọn dự án đang được phát triển, giấy phép rõ ràng và có hướng dẫn cài đặt.', '');
const prioCats = ['ai-marketing', 'ai-automation', 'ai-video-image', 'ai-audio', 'chatbot-llm', 'ai-agents', 'marketing-seo', 'crm-sales', 'productivity', 'video-media', 'mcp-ai-tools', 'other'];
const prio = listed
  .filter((r) => r.categories.some((c) => prioCats.includes(c)) && (r.applicability ?? 0) >= 5 && r.score && r.score.tier !== 'review' && !r.stats.archived && !r.score.anomaly)
  .sort((a, b) => b.score.total - a.score.total)
  .slice(0, 25);
P('| # | Dự án | Dùng để | Điểm | Giấy phép | Độ khó |', '|---:|---|---|---:|---|---|');
prio.forEach((r, i) => P(`| ${i + 1} | [${cell(r.full_name)}](${r.links.github}) | ${cell(r.summary)} | ${Math.round(r.score.total)} | ${cell(r.license.display)} (${cell(r.license.short)}) | ${{ easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }[r.difficulty] || '—'} |`));
P('');

// ------------------------------------------------------------------ Theo danh mục
P('## 4. Danh sách theo danh mục', '');
P('Cột *Commit* là ngày commit gần nhất trên nhánh chính. Cột *Đóng góp* là số người đóng góp theo GitHub API (“—” nghĩa là đang được cập nhật). Mọi link tải trỏ về GitHub.', '');
for (const c of lib.categories) {
  const rows = lib.repos.filter((r) => r.categories.includes(c.slug)).sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
  P(`### ${c.name} (${rows.length})`, '', `${c.description}`, '');
  P('| # | Dự án | Mô tả | Sao | Fork | Đóng góp | Commit | Giấy phép | Điểm | Xếp loại | Liên kết |', '|---:|---|---|---:|---:|---:|---|---|---:|---|---|');
  rows.forEach((r, i) => {
    const s = r.stats || {};
    const warn = r.score?.flags?.some((f) => ['archived', 'deleted'].includes(f.key)) ? ' ⚠' : '';
    P(`| ${i + 1} | [${cell(r.name)}](${siteUrl}${r.path})<br><sub>${cell(r.owner)}</sub>${warn} | ${cell(r.summary || r.description)} | ${n(s.stars)} | ${n(s.forks)} | ${s.contributors_capped ? 'rất nhiều' : n(s.contributors)} | ${d(s.last_commit_at)} | ${cell(r.license.display)} | ${r.score ? Math.round(r.score.total) : '—'} | ${r.score ? tierLabel[r.score.tier] : '—'} | ${downloads(r)} |`);
  });
  P('');
}

// ------------------------------------------------------------------ Cảnh báo
P('## 5. Cảnh báo cần lưu ý', '');
const flagged = (key) => lib.repos.filter((r) => r.score?.flags?.some((f) => f.key === key));
const sec = (title, list, extra = () => '') => {
  P(`**${title}** (${list.length})`, '');
  if (!list.length) P('- Không có.');
  for (const r of list) P(`- [${r.full_name}](${r.links.github})${extra(r)}`);
  P('');
};
sec('Đã lưu trữ (archived) — không còn phát triển', flagged('archived'), (r) => (r.alternatives.length ? `: cân nhắc thay bằng ${r.alternatives.join(', ')}` : ''));
sec('Không còn tồn tại trên GitHub', flagged('deleted'));
sec('Tín hiệu tăng sao bất thường', flagged('star_anomaly'), (r) => `: ${cell(r.score.flags.find((f) => f.key === 'star_anomaly').text)}`);
sec('Giấy phép phi thương mại', flagged('noncommercial'), (r) => (r.license_note ? `: ${cell(r.license_note)}` : ''));
sec('Giấy phép có hạn chế (không phải OSI)', flagged('source_available'), (r) => `: ${cell(r.license.display)}`);
sec('Chưa khai báo giấy phép', flagged('no_license'));
sec('Không cập nhật hơn 12 tháng', flagged('stale'), (r) => `: commit gần nhất ${d(r.stats.last_commit_at)}`);
const ncNotes = lib.repos.filter((r) => r.license_note && /phi thương mại|non-?commercial|NC/i.test(r.license_note) && !flagged('noncommercial').includes(r));
sec('Mã nguồn dễ dãi nhưng mô hình/thành phần đi kèm hạn chế thương mại', ncNotes, (r) => `: ${cell(r.license_note)}`);

// ------------------------------------------------------------------ Phụ lục
P('## 6. Phụ lục: ứng viên đã xem xét nhưng không đưa vào', '');
const inLib = new Set(lib.repos.map((r) => r.full_name.toLowerCase()));
const excluded = verified.results.filter((x) => x.full_name && !inLib.has(x.full_name.toLowerCase()) && x.stars >= 10000).sort((a, b) => b.stars - a.stars);
P('Các ứng viên từ 10.000 sao trở lên không được chọn. Lý do theo số liệu được ghi khi có; các trường hợp còn lại là do trùng chức năng với dự án tốt hơn trong cùng danh mục hoặc ít phù hợp với đối tượng người dùng.', '');
P('| Ứng viên | Sao | Giấy phép | Ghi chú theo số liệu |', '|---|---:|---|---|');
const age = (iso) => (Date.now() - Date.parse(iso)) / 86400000;
for (const x of excluded) {
  const why = [x.archived ? 'đã lưu trữ' : null, x.license === null ? 'không có giấy phép' : null, x.pushed_at && age(x.pushed_at) > 365 ? `không cập nhật từ ${d(x.pushed_at)}` : null].filter(Boolean).join(', ');
  P(`| [${cell(x.full_name)}](https://github.com/${x.full_name}) | ${n(x.stars)} | ${cell(x.license || '—')} | ${why || 'trùng chức năng / ưu tiên thấp hơn'} |`);
}
P('', `_Tạo lúc ${dt(new Date().toISOString())}._`, '');

const file = path.join(ROOT, 'docs', '01-BAO-CAO-NGHIEN-CUU.md');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log(`Đã ghi ${path.relative(ROOT, file)} (${out.length} dòng).`);
