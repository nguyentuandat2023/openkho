// Trending Score (0–100) — tách biệt hoàn toàn với Quality Score.
// Đo "đà phát triển hiện tại" trong 3 cửa sổ (24 giờ, 7 ngày, 30 ngày) từ số liệu thật đã đo được.
//
// 6 thành phần (trọng số mặc định, chỉnh được ở trang quản trị — luôn quy về tổng 100):
//   star_growth 35 · activity 20 · community 15 · momentum 15 · docs 10 · maintenance 5
// Nguyên tắc:
//   - Không có số liệu tăng trưởng sao thật cho cửa sổ → KHÔNG có điểm (null), không suy đoán.
//   - Mục thiếu dữ liệu bị loại khỏi mẫu số (không tính như dữ liệu thật); thành phần còn < 50% dữ liệu bị loại.
//   - Độ phủ (coverage) = phần trọng số có dữ liệu; dưới ngưỡng (mặc định 60%) → không xếp hạng.
//   - Chuẩn hóa log + kết hợp tăng trưởng tuyệt đối (60%) và tương đối (40%) để repo lớn không luôn áp đảo.
//   - Tín hiệu bất thường → giảm điểm tăng trưởng (hệ số damping) và ghi rõ lý do.
import { daysSince } from './config.mjs';
import { TRENDING_COMPONENTS, normalizedWeights } from './settings.mjs';
import { WINDOWS } from './snapshots.mjs';

export const TRENDING_VERSION = 1;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lg = (x) => Math.log10(1 + Math.max(0, x));
const r1 = (x) => Math.round(x * 10) / 10;
const nf = (n) => Math.round(n).toLocaleString('vi-VN');

// Mốc "đạt tối đa" cho từng cửa sổ (công bố ở trang phương pháp)
export const REF = {
  d1: { rate: 1000, rel: 0.2, forks: 60 },
  d7: { rate: 600, rel: 0.6, forks: 40 },
  d30: { rate: 300, rel: 1.5, forks: 20 },
};
const ACCEL_PAIR = { d1: 'd7', d7: 'd30', d30: null };

export const METHOD_LABEL = {
  snapshots: 'đo trực tiếp từ hai lần đồng bộ',
  created_in_window: 'repo được tạo trong kỳ — toàn bộ số sao phát sinh trong kỳ',
  stargazer_sample: 'đếm thời điểm gắn sao qua GitHub API',
};

function fmtSpan(h) {
  if (h < 48) return `${Math.round(h)} giờ`;
  return `${r1(h / 24).toLocaleString('vi-VN')} ngày`;
}

/** Thành phần gồm nhiều mục [tên, giá trị 0..1 | null (thiếu), trọng số trong thành phần]. */
function component(items) {
  let known = 0;
  let total = 0;
  let earned = 0;
  for (const [, v, w] of items) {
    if (v === undefined) continue; // không áp dụng
    total += w;
    if (v === null || !Number.isFinite(v)) continue;
    known += w;
    earned += v * w;
  }
  if (!total) return { value: null, share: 0, items };
  const share = known / total;
  return { value: share >= 0.5 ? earned / known : null, share, items };
}

/** Tín hiệu bất thường về sao (không kết luận gian lận — chỉ giảm trọng số và cảnh báo). */
export function growthAnomaly(rec, g) {
  const reasons = [];
  if (rec.quality_anomaly) reasons.push(`rất ít người đóng góp (${rec.quality_anomaly.contributors}) so với tốc độ tăng sao`);
  if (g && g.gained >= 300 && g.forks_gained != null && g.forks_gained / g.gained < 0.003) {
    reasons.push(`+${nf(g.gained)} sao nhưng chỉ +${nf(Math.max(0, g.forks_gained))} fork trong cùng kỳ`);
  }
  const m = rec.meta;
  const ageDays = m?.created_at ? (Date.now() - Date.parse(m.created_at)) / 86400000 : null;
  if (m && ageDays !== null && ageDays <= 60 && m.stars >= 300 && m.forks / m.stars < 0.005 && !m.open_issues && !reasons.length) {
    reasons.push(`repo mới với ${nf(m.stars)} sao nhưng gần như không có fork (${nf(m.forks)}) và chưa có issue nào`);
  }
  return reasons.length ? reasons : null;
}

/**
 * rec: bản ghi chuẩn hóa (xem build/rank): { meta, activity, readme, contributors, release_checked, release, lic, growth, quality_anomaly, status }
 * Trả về { d1, d7, d30 } — mỗi cửa sổ là null hoặc { score, coverage, components, reasons, warnings, anomaly, growth }.
 */
export function computeTrending(rec, settings, now = Date.now()) {
  const out = {};
  const m = rec.meta;
  if (!m || m.archived || rec.status === 'not_found' || rec.status === 'blocked') {
    for (const w of WINDOWS) out[w.key] = null;
    return out;
  }
  const weights = normalizedWeights(settings);
  const damping = settings.trending.anomaly_damping;
  const minCov = settings.trending.min_coverage;

  for (const w of WINDOWS) {
    const g = rec.growth?.[w.key] || null;
    if (!g) { out[w.key] = null; continue; }
    const ref = REF[w.key];
    const reasons = [];
    const warnings = [];
    const missing = [];

    // 1) Tăng trưởng sao
    const gained = Math.max(0, g.gained);
    const rate = gained / w.days;
    const abs = clamp(lg(rate) / lg(ref.rate));
    const base = Math.max(g.base_stars ?? 0, 50);
    const relRatio = gained / base;
    const hasBase = g.method !== 'created_in_window';
    const rel = hasBase ? clamp(lg(10 * relRatio) / lg(10 * ref.rel)) : null;
    let starVal = hasBase ? 0.6 * abs + 0.4 * rel : abs;
    const anomaly = growthAnomaly(rec, g);
    if (anomaly) {
      starVal *= damping;
      warnings.push(`Tín hiệu bất thường: ${anomaly.join('; ')} — điểm tăng trưởng sao đã nhân hệ số ${damping}.`);
    }
    const star = { value: starVal, share: 1, items: hasBase ? [['tăng tuyệt đối', abs, 0.6], ['tăng tương đối', rel, 0.4]] : [['tăng tuyệt đối', abs, 1]] };
    if (g.method === 'created_in_window') reasons.push(`+${nf(g.delta)} sao kể từ khi tạo ${fmtSpan(g.span_hours)} trước`);
    else if (g.method === 'stargazer_sample') reasons.push(`+${nf(g.delta)} sao trong ${w.label} qua (đếm thời điểm gắn sao)`);
    else reasons.push(`${g.delta >= 0 ? '+' : ''}${nf(g.delta)} sao trong ${fmtSpan(g.span_hours)} (đo ${new Date(g.from).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} → ${new Date(g.to).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })})`);
    if (hasBase && g.base_stars >= 50 && relRatio >= 0.1) reasons.push(`Tăng ${Math.round(relRatio * 100).toLocaleString('vi-VN')}% so với đầu kỳ (${nf(g.base_stars)} sao)`);

    // 2) Hoạt động phát triển — chỉ dùng hoạt động mã nguồn (commit/push), KHÔNG dùng updated_at (đổi cả khi chỉ sửa mô tả/sao)
    const commitAt = rec.activity?.last_commit_at && rec.activity.source !== 'pushed_at' ? rec.activity.last_commit_at : null;
    const lastCode = commitAt || m.pushed_at || null;
    const codeDays = daysSince(lastCode, now);
    const recency = codeDays === null ? null : codeDays <= 2 ? 1 : codeDays <= 7 ? 0.85 : codeDays <= 30 ? 0.6 : codeDays <= 90 ? 0.3 : 0;
    const c90 = typeof rec.activity?.commits_90d === 'number' && !rec.activity?.stale ? rec.activity.commits_90d : null;
    const activity = component([
      ['hoạt động mã gần nhất', recency, 0.5],
      ['số commit 90 ngày', c90 === null ? null : clamp(lg(c90) / lg(150)), 0.5],
    ]);
    if (c90 === null) missing.push('số commit 90 ngày');
    if (c90 !== null && c90 > 0) reasons.push(rec.activity.commits_90d_estimated ? `Nhịp commit cao: 20 commit gần nhất đều trong 90 ngày (ước tính ≈ ${nf(c90)} commit/90 ngày)` : `${nf(c90)} commit trên nhánh chính trong 90 ngày`);
    if (codeDays !== null && codeDays <= 7) reasons.push(commitAt ? `Commit gần nhất ${codeDays < 1 ? `${Math.max(1, Math.round(codeDays * 24))} giờ` : `${Math.round(codeDays)} ngày`} trước` : `Có push mã gần nhất ${codeDays < 1 ? `${Math.max(1, Math.round(codeDays * 24))} giờ` : `${Math.round(codeDays)} ngày`} trước (chưa xác minh commit nhánh chính)`);

    // 3) Cộng đồng
    const contrib = rec.contributors?.count;
    const forksGained = g.forks_gained;
    const community = component([
      ['fork mới trong kỳ', forksGained == null ? null : clamp(lg(Math.max(0, forksGained) / w.days) / lg(ref.forks)), 0.4],
      ['người đóng góp', contrib == null ? null : clamp(lg(contrib) / lg(300)), 0.35],
      ['tỉ lệ fork/sao', m.stars > 0 ? clamp((m.forks / m.stars) / 0.15) : null, 0.15],
      ['kênh issue/thảo luận', (m.has_issues ? 0.5 : 0) + (m.has_discussions ? 0.5 : 0), 0.1],
    ]);
    if (contrib == null) missing.push('số người đóng góp');
    if (forksGained != null && forksGained > 0 && w.key !== 'd1') reasons.push(`+${nf(forksGained)} fork trong kỳ`);
    if (contrib != null && contrib >= 20) reasons.push(`${nf(contrib)} người đóng góp`);

    // 4) Độ mới & đà tăng
    const age = daysSince(m.created_at, now);
    const ageVal = age === null ? null : age <= 30 ? 1 : age <= 90 ? 0.85 : age <= 180 ? 0.7 : age <= 365 ? 0.5 : age <= 730 ? 0.3 : 0.15;
    const pair = ACCEL_PAIR[w.key];
    let accel;
    if (pair) {
      const gl = rec.growth?.[pair];
      const pairDays = pair === 'd7' ? 7 : 30;
      if (gl && gl.gained > 0 && gl.span_hours > 0 && age !== null && age > w.days) {
        const longRate = gl.gained / Math.min(pairDays, age);
        const ratio = rate / Math.max(longRate, 0.01);
        accel = clamp((ratio - 0.5) / 1.5);
        if (ratio >= 1.5 && rate >= 5) reasons.push(`Đang tăng tốc: ${r1(rate).toLocaleString('vi-VN')} sao/ngày so với ${r1(longRate).toLocaleString('vi-VN')} sao/ngày của kỳ dài hơn`);
      } else accel = null;
    }
    const relDays = rec.release_checked ? (rec.release?.published_at ? daysSince(rec.release.published_at, now) : Infinity) : null;
    const momentum = component([
      ['độ mới của dự án', ageVal, 0.5],
      ['tăng tốc so với kỳ dài hơn', accel, 0.3],
      ['bản phát hành gần đây', relDays === null ? null : relDays <= 30 ? 1 : relDays <= 90 ? 0.5 : 0, 0.2],
    ]);
    if (age !== null && age <= 90) reasons.push(`Dự án mới: tạo ${Math.max(1, Math.round(age))} ngày trước`);
    if (relDays !== null && relDays <= 30) reasons.push(`Có bản phát hành ${rec.release?.tag || ''} ${Math.round(relDays)} ngày trước`.replace(/\s+/g, ' '));

    // 5) Tài liệu
    const rm = rec.readme;
    const len = rm?.length;
    const docs = component([
      ['README', len == null ? null : len >= 8000 ? 1 : len >= 4000 ? 0.8 : len >= 2000 ? 0.6 : len >= 800 ? 0.35 : 0.1, 0.5],
      ['hướng dẫn cài đặt/sử dụng', rm ? (rm.sections?.install ? 0.6 : 0) + (rm.sections?.usage || rm.sections?.features ? 0.4 : 0) : null, 0.3],
      ['mô tả, topic, trang chủ', (m.description ? 0.4 : 0) + ((m.topics || []).length >= 3 ? 0.3 : 0) + (m.homepage ? 0.3 : 0), 0.2],
    ]);
    if (!rm) missing.push('README');
    else if (len >= 4000 && rm.sections?.install) reasons.push(`README đầy đủ (${nf(len)} ký tự, có hướng dẫn cài đặt)`);

    // 6) Bảo trì
    const lic = rec.lic;
    const maintenance = component([
      ['giấy phép', lic ? (lic.class === 'none' ? 0 : lic.class === 'noncommercial' ? 0.3 : 1) : null, 0.4],
      ['kênh báo lỗi', m.has_issues ? 1 : 0, 0.2],
      ['push trong 90 ngày', codeDays === null ? null : codeDays <= 90 ? 1 : 0, 0.4],
    ]);

    const comps = { star_growth: star, activity, community, momentum, docs, maintenance };
    let num = 0;
    let den = 0;
    let coverage = 0;
    const components = {};
    for (const c of TRENDING_COMPONENTS) {
      const comp = comps[c.key];
      const wt = weights[c.key];
      components[c.key] = { value: comp.value === null ? null : r1(comp.value * 100), weight: r1(wt), share: Math.round(comp.share * 100) / 100 };
      if (comp.value === null) continue;
      num += comp.value * wt;
      den += wt;
      coverage += wt * comp.share;
    }
    coverage = coverage / 100;
    if (coverage < minCov || !den) {
      out[w.key] = { score: null, coverage: Math.round(coverage * 100) / 100, components, reasons, warnings, missing, anomaly, growth: g, insufficient: true };
      continue;
    }
    out[w.key] = {
      score: r1((num / den) * 100),
      coverage: Math.round(coverage * 100) / 100,
      components,
      reasons: reasons.slice(0, 6),
      warnings,
      missing,
      anomaly,
      growth: g,
    };
  }
  return out;
}
