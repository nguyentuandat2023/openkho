// Chấm điểm chất lượng (thang 100) + cờ cảnh báo + ưu/nhược điểm tự động từ số liệu.
// Công thức được công bố tại trang /phuong-phap. Không có tiêu chí nào chỉ dựa vào số sao.
import { daysSince } from './config.mjs';

export const SCORE_VERSION = 3;

export const CRITERIA = [
  { key: 'popularity', label: 'Mức độ phổ biến', max: 20 },
  { key: 'quality', label: 'Chất lượng dự án', max: 20 },
  { key: 'applicability', label: 'Tính ứng dụng', max: 20 },
  { key: 'freshness', label: 'Mức độ cập nhật', max: 15 },
  { key: 'docs', label: 'Tài liệu hướng dẫn', max: 15 },
  { key: 'community', label: 'Cộng đồng & hỗ trợ', max: 10 },
];

export const TIERS = [
  { key: 'excellent', label: 'Xuất sắc', min: 85 },
  { key: 'good', label: 'Tốt', min: 72 },
  { key: 'potential', label: 'Tiềm năng', min: 58 },
  { key: 'review', label: 'Cần kiểm tra thêm', min: 0 },
];

/**
 * Dữ liệu thiếu KHÔNG được tính như dữ liệu thật (từ phiên bản 3):
 *  - Mục thiếu dữ liệu bị loại khỏi cả tử số và mẫu số của nhóm.
 *  - Nhóm còn dưới GROUP_MIN_SHARE dữ liệu bị loại khỏi tổng điểm; tổng được quy lại theo các nhóm còn lại.
 *  - Độ phủ dữ liệu (coverage) được công bố cùng điểm; hạng "Xuất sắc" cần độ phủ ≥ EXCELLENT_MIN_COVERAGE.
 */
export const GROUP_MIN_SHARE = 0.5;
export const EXCELLENT_MIN_COVERAGE = 0.7;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const log10 = (x) => Math.log10(Math.max(x, 1));
const round1 = (x) => Math.round(x * 10) / 10;

const LICENSE_POINTS = { permissive: 7, 'weak-copyleft': 6, copyleft: 5.5, content: 5.5, custom: 3.5, 'source-available': 3, noncommercial: 1, none: 0 };

/** Ước tính số commit trên nhánh chính trong 90 ngày. */
export function commits90(activity) {
  if (!activity) return null;
  if (typeof activity.commits_90d === 'number') return activity.commits_90d;
  return null;
}

/**
 * Dấu hiệu số sao tăng bất thường so với số người thực sự tham gia phát triển.
 * Thận trọng có chủ đích: chỉ gắn cờ khi ĐÃ xác minh được số người đóng góp (không suy đoán khi thiếu dữ liệu),
 * và bỏ qua repo dạng tài liệu/danh sách/kỹ năng vốn thường chỉ do một tác giả duy trì.
 * Tỉ lệ issue/sao KHÔNG được dùng vì nhiều dự án lớn xử lý issue rất nhanh (tỉ lệ thấp là bình thường).
 */
export function starAnomaly(r, skip, now = Date.now()) {
  const m = r.meta;
  if (!m || skip) return null;
  const contributors = r.contributors?.count;
  if (contributors === null || contributors === undefined) return null;
  const age = Math.max(daysSince(m.created_at, now) || 0, 30);
  const perDay = m.stars / age;
  if ((perDay >= 150 && contributors < 10) || (perDay >= 300 && contributors < 25)) {
    return { stars_per_day: Math.round(perDay), contributors, reasons: [`chỉ ${contributors} người đóng góp cho ${m.stars.toLocaleString('vi-VN')} sao`] };
  }
  return null;
}

/** Phát hiện hệ điều hành từ tên file trong bản phát hành. */
export function detectAssetPlatforms(assets = []) {
  const found = {};
  const rules = [
    ['windows', /\.(exe|msi|msix|appx|appxbundle)$|(^|[-_.])(win(dows)?|win64|win32)([-_.]|$).*\.(zip|7z)$/i],
    ['macos', /\.(dmg|pkg)$|(^|[-_.])(mac|macos|osx|darwin)([-_.]|$).*\.(zip|tar\.gz|tgz)$/i],
    ['linux', /\.(appimage|deb|rpm|flatpak|snap)$|(^|[-_.])linux([-_.]|$).*\.(tar\.gz|tgz|tar\.xz|zip)$/i],
    ['android', /\.(apk|aab)$/i],
  ];
  for (const a of assets) {
    for (const [os, re] of rules) {
      if (re.test(a.name) && !/\.(sha256|sig|asc|blockmap|sha512|md5|txt|json|yml|yaml)$/i.test(a.name)) {
        if (!found[os] || (a.download_count || 0) > (found[os].download_count || 0)) found[os] = a;
      }
    }
  }
  return found;
}

function bucket(value, steps) {
  for (const [limit, pts] of steps) if (value <= limit) return pts;
  return 0;
}

/**
 * r: dữ liệu GitHub đã chuẩn hóa; e: mục catalog (biên tập); lic: kết quả classifyLicense
 * Trả về { total, tier, breakdown, partial[], flags[], auto_pros[], auto_cons[], anomaly }
 */
export function scoreRepo(r, e, lic, now = Date.now()) {
  const m = r.meta;
  const deploy = e.deploy || [];
  const isContent = deploy.length > 0 && deploy.every((d) => d === 'content' || d === 'cloud');
  const noReleaseExpected = deploy.length > 0 && deploy.every((d) => d === 'content' || d === 'cloud' || d === 'skill');
  const parts = {};
  const missing = [];
  // items: [tên, điểm | null (thiếu dữ liệu) | undefined (không áp dụng), điểm tối đa]
  const group = (key, max, items) => {
    let earned = 0;
    let avail = 0;
    let applicable = 0;
    let partial = false;
    for (const [name, pts, maxPts] of items) {
      if (pts === undefined) continue; // tiêu chí không áp dụng cho loại repo này
      applicable += maxPts;
      if (pts === null) {
        missing.push(`${key}.${name}`);
        partial = true;
        continue;
      }
      earned += pts;
      avail += maxPts;
    }
    const share = applicable ? avail / applicable : 0;
    const na = applicable === 0;
    const included = !na && share >= GROUP_MIN_SHARE;
    parts[key] = {
      score: included ? round1((earned / avail) * max) : null,
      max, partial, na, excluded: !na && !included,
      coverage: Math.round(share * 100) / 100,
      items: items.filter(([, pts]) => pts !== undefined).map(([name, pts, maxPts]) => ({ name, pts: pts === null ? null : round1(pts), max: maxPts })),
    };
  };

  // 1) Phổ biến (20): sao (log) + fork (log)
  group('popularity', 20, [
    ['stars', 15 * clamp((log10(m.stars ?? 0) - 2) / (log10(200000) - 2)), 15],
    ['forks', 5 * clamp((log10(m.forks ?? 0) - 1) / (log10(30000) - 1)), 5],
  ]);

  // 2) Chất lượng (20): giấy phép, bản phát hành, độ trưởng thành, độ hoàn thiện thông tin
  const anomaly = starAnomaly(r, noReleaseExpected, now);
  const ageDays = daysSince(m.created_at, now) || 0;
  let releasePts = noReleaseExpected ? undefined : null;
  if (!noReleaseExpected && r.release_checked) {
    const rd = r.release?.published_at ? daysSince(r.release.published_at, now) : null;
    if (r.release && rd !== null) releasePts = rd <= 180 ? 5 : rd <= 365 ? 4 : 2.5;
    else if (r.release) releasePts = 2.5;
    else if (r.prerelease || r.latest_tag) releasePts = 1.5;
    else releasePts = 0;
  }
  group('quality', 20, [
    ['license', LICENSE_POINTS[lic.class] ?? 3, 7],
    ['releases', releasePts, 5],
    ['maturity', (ageDays >= 1095 ? 3 : ageDays >= 365 ? 2 : ageDays >= 180 ? 1 : 0.5) + (anomaly ? 0 : 1), 4],
    ['metadata', (m.description ? 1 : 0) + ((m.topics || []).length >= 3 ? 1 : 0) + (m.homepage || e.docs ? 1 : 0) + (m.has_issues ? 1 : 0), 4],
  ]);

  // 3) Tính ứng dụng (20): đánh giá biên tập 1–5
  // Repo tự động phát hiện chưa có đánh giá biên tập → tiêu chí không áp dụng (không đoán)
  group('applicability', 20, [['editorial', Number.isInteger(e.applicability) ? e.applicability * 4 : undefined, 20]]);

  // 4) Cập nhật (15): commit gần nhất + mật độ commit 90 ngày
  const lastCommit = r.activity?.last_commit_at || m.pushed_at;
  const lcDays = daysSince(lastCommit, now);
  const c90 = commits90(r.activity);
  group('freshness', 15, [
    ['last_commit', lcDays === null ? null : bucket(lcDays, [[7, 11], [30, 10], [90, 8], [180, 6], [365, 4], [730, 2]]), 11],
    ['activity', c90 === null ? null : c90 >= 60 ? 4 : c90 >= 20 ? 3 : c90 >= 5 ? 2 : c90 >= 1 ? 1 : 0, 4],
  ]);

  // 5) Tài liệu (15): độ dài README, có mục cài đặt, có mục sử dụng, có trang tài liệu riêng
  const rm = r.readme;
  const len = rm?.length;
  const sec = rm?.sections || {};
  group('docs', 15, [
    ['readme', len === undefined || len === null ? null : len >= 15000 ? 5 : len >= 8000 ? 4 : len >= 4000 ? 3 : len >= 2000 ? 2 : len >= 500 ? 1 : 0, 5],
    ['install', isContent ? undefined : rm ? (sec.install || e.quick_start ? 4 : 0) : (e.quick_start ? 4 : null), 4],
    ['usage', isContent ? undefined : rm ? (sec.usage ? 3 : sec.features ? 1.5 : 0) : null, 3],
    ['docs_site', m.homepage || e.docs ? 3 : 0, 3],
  ]);

  // 6) Cộng đồng (10): người đóng góp (log), thảo luận, kênh issue
  const contrib = r.contributors?.count;
  group('community', 10, [
    ['contributors', contrib === null || contrib === undefined ? (r.contributors?.capped ? 6 : null) : 6 * clamp(log10(contrib) / log10(1000)), 6],
    ['discussions', m.has_discussions ? 2 : 0, 2],
    ['issues', !m.has_issues ? 0 : m.open_issues > 0 ? 2 : 1, 2],
  ]);

  // Tổng: quy về thang 100 theo các nhóm có đủ dữ liệu; độ phủ = phần điểm tối đa có dữ liệu thật
  let earnedAll = 0;
  let maxIncluded = 0;
  let maxApplicable = 0;
  let covered = 0;
  for (const p of Object.values(parts)) {
    if (p.na) continue;
    maxApplicable += p.max;
    if (p.score === null) continue;
    earnedAll += p.score;
    maxIncluded += p.max;
    covered += p.max * p.coverage;
  }
  let total = maxIncluded ? round1((earnedAll / maxIncluded) * 100) : 0;
  const coverage = maxApplicable ? Math.round((covered / maxApplicable) * 100) / 100 : 0;

  // ---------- Cờ cảnh báo ----------
  const flags = [];
  if (r.status === 'not_found') flags.push({ key: 'deleted', level: 'danger', text: 'Repository không còn tồn tại trên GitHub (đã xóa, chuyển sang riêng tư hoặc bị gỡ).' });
  if (r.status === 'blocked' || m.disabled) flags.push({ key: 'disabled', level: 'danger', text: 'Repository bị GitHub vô hiệu hóa hoặc chặn truy cập.' });
  if (m.archived) flags.push({ key: 'archived', level: 'warning', text: 'Đã lưu trữ (archived): chủ dự án ngừng phát triển, repo chỉ còn để đọc.' });
  if (r.renamed_from) flags.push({ key: 'renamed', level: 'info', text: `Repo đã đổi tên/chuyển chủ sở hữu từ ${r.renamed_from} sang ${r.full_name}.` });
  if (lic.class === 'none') flags.push({ key: 'no_license', level: 'warning', text: 'Chưa khai báo giấy phép — không mặc nhiên được dùng lại mã nguồn/nội dung.' });
  if (lic.class === 'noncommercial') flags.push({ key: 'noncommercial', level: 'warning', text: 'Giấy phép phi thương mại — không dùng cho công việc kinh doanh.' });
  if (lic.class === 'source-available') flags.push({ key: 'source_available', level: 'info', text: 'Giấy phép có hạn chế (không phải nguồn mở chuẩn OSI) — đọc kỹ trước khi dùng thương mại.' });
  if (lcDays !== null && lcDays > 365 && !m.archived) flags.push({ key: 'stale', level: 'warning', text: `Không có commit mới trong ${Math.floor(lcDays / 30)} tháng.` });
  if (anomaly) flags.push({ key: 'star_anomaly', level: 'warning', text: `Tín hiệu cần lưu ý: số sao tăng rất nhanh (~${anomaly.stars_per_day} sao/ngày kể từ khi tạo) trong khi rất ít người tham gia phát triển (${anomaly.reasons.join('; ')}). Số sao có thể không phản ánh mức độ sử dụng thực tế — hãy tự đánh giá trước khi dùng.` });
  if (r.status === 'unverified') flags.push({ key: 'unverified', level: 'info', text: 'Lần đồng bộ gần nhất chưa kiểm tra lại được repo này — số liệu có thể đã cũ.' });

  // Hạng – xét theo điểm đã làm tròn (đúng con số người dùng nhìn thấy: 84,6 hiển thị 85 → Xuất sắc)
  const shown = Math.round(total);
  let tier = (TIERS.find((t) => shown >= t.min) || TIERS[TIERS.length - 1]).key;
  const order = TIERS.map((t) => t.key);
  const capAt = (k) => { if (order.indexOf(tier) < order.indexOf(k)) tier = k; };
  if (anomaly) capAt('potential');
  if (coverage < EXCELLENT_MIN_COVERAGE) capAt('good');
  if (m.archived || r.status === 'not_found' || r.status === 'blocked' || m.disabled || lic.class === 'none' || lic.class === 'noncommercial') capAt('review');
  if (r.status === 'not_found') total = Math.min(total, 30);

  // ---------- Ưu/nhược điểm tự động (dựa trên số liệu) ----------
  const autoPros = [];
  const autoCons = [];
  if (lic.class === 'permissive') autoPros.push(`Giấy phép ${lic.display} dễ dãi, dùng thương mại thoải mái`);
  if (lcDays !== null && lcDays <= 30 && !m.archived) autoPros.push(`Đang phát triển tích cực (commit gần nhất ${Math.max(0, Math.round(lcDays))} ngày trước)`);
  if (r.release?.published_at && daysSince(r.release.published_at, now) <= 90) autoPros.push(`Có bản phát hành mới (${r.release.tag})`);
  if (contrib >= 100) autoPros.push(`Cộng đồng lớn: ${contrib.toLocaleString('vi-VN')} người đóng góp`);
  if (m.stars >= 50000) autoPros.push(`Rất phổ biến: ${m.stars.toLocaleString('vi-VN')} sao trên GitHub`);
  if (r.readme?.docker_mentioned || r.docker) autoPros.push('Có hướng dẫn cài bằng Docker');
  const assetOs = Object.keys(detectAssetPlatforms(r.release?.assets || []));
  if (assetOs.length) autoPros.push(`Có bộ cài dựng sẵn cho ${assetOs.map((o) => ({ windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' })[o]).join(', ')}`);

  if (m.archived) autoCons.push('Đã ngừng phát triển (archived) — không còn cập nhật bảo mật');
  else if (lcDays !== null && lcDays > 365) autoCons.push(`Hơn ${Math.floor(lcDays / 30)} tháng chưa có cập nhật`);
  if (lic.spdx === 'AGPL-3.0') autoCons.push('Giấy phép AGPL: sửa đổi rồi cung cấp qua mạng phải công khai mã nguồn');
  else if (lic.class === 'copyleft') autoCons.push(`Giấy phép ${lic.display}: phân phối bản sửa đổi phải công khai mã nguồn`);
  if (lic.class === 'source-available' || lic.class === 'custom') autoCons.push('Giấy phép có điều kiện riêng — cần đọc kỹ trước khi dùng thương mại');
  if (lic.class === 'none') autoCons.push('Chưa khai báo giấy phép');
  if (!isContent && r.release_checked && !r.release && !r.prerelease) autoCons.push('Chưa có bản phát hành chính thức — thường phải cài từ mã nguồn');
  if (e.needs_api_key === 'required') autoCons.push('Cần khóa API/tài khoản dịch vụ trả phí để dùng đầy đủ');
  if (e.difficulty === 'hard') autoCons.push('Cài đặt và vận hành đòi hỏi kiến thức kỹ thuật');

  return {
    version: SCORE_VERSION,
    total,
    tier,
    breakdown: parts,
    partial: missing,
    coverage,
    applicability_rated: Number.isInteger(e.applicability),
    flags,
    anomaly,
    auto_pros: autoPros,
    auto_cons: autoCons,
    is_content: isContent,
    last_commit_days: lcDays === null ? null : Math.round(lcDays),
  };
}

/** Tốc độ tăng sao/ngày: ưu tiên lịch sử đồng bộ ≥7 ngày, rồi mẫu stargazers (API), cuối cùng trung bình từ khi tạo. */
export function computeTrend(r, history, now = Date.now()) {
  const pts = history || [];
  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    const target = now - 7 * 86400000;
    let base = null;
    for (const p of pts) if (Date.parse(p[0]) <= target) base = p;
    if (base) {
      const days = (Date.parse(last[0]) - Date.parse(base[0])) / 86400000;
      if (days >= 6) return { per_day: Math.round(((last[1] - base[1]) / days) * 10) / 10, method: 'history', window_days: Math.round(days) };
    }
  }
  if (r.stars_recent?.per_day != null) return { per_day: r.stars_recent.per_day, method: 'stargazers', window_days: r.stars_recent.window_days };
  const age = daysSince(r.meta?.created_at, now);
  if (age && age <= 3 * 365) return { per_day: Math.round((r.meta.stars / Math.max(age, 14)) * 10) / 10, method: 'lifetime', window_days: Math.round(age) };
  return null;
}
