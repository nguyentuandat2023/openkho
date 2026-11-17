// Phân loại giấy phép (SPDX từ GitHub API, có thể ghi đè bằng license_override trong catalog)
// và diễn giải quyền dùng thương mại bằng tiếng Việt.

const CLASS_OF = {
  permissive: ['MIT', 'MIT-0', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'BSD-3-CLAUSE-CLEAR', 'BSD-4-CLAUSE', 'ISC', 'ZLIB', 'UNLICENSE',
    'CC0-1.0', '0BSD', 'BSL-1.0', 'POSTGRESQL', 'WTFPL', 'PYTHON-2.0', 'NCSA', 'UPL-1.0', 'MS-PL', 'ARTISTIC-2.0', 'OFL-1.1', 'X11', 'AFL-3.0', 'ECL-2.0'],
  'weak-copyleft': ['LGPL-2.1', 'LGPL-3.0', 'LGPL-2.0', 'MPL-2.0', 'MPL-1.1', 'EPL-1.0', 'EPL-2.0', 'CDDL-1.0', 'CDDL-1.1', 'MS-RL', 'CECILL-C'],
  copyleft: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'EUPL-1.1', 'EUPL-1.2', 'OSL-3.0', 'CECILL-2.1', 'GPL-1.0'],
  content: ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-3.0', 'CC-BY-SA-3.0', 'ODBL-1.0', 'CC-BY-2.0'],
  noncommercial: ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', 'CC-BY-NC-3.0', 'CC-BY-NC-SA-3.0', 'POLYFORM-NONCOMMERCIAL-1.0.0'],
  'source-available': ['BUSL-1.1', 'SSPL-1.0', 'ELASTIC-2.0', 'POLYFORM-SHIELD-1.0.0', 'POLYFORM-SMALL-BUSINESS-1.0.0', 'FSL-1.1-MIT', 'FSL-1.1-APACHE-2.0', 'COMMONS-CLAUSE'],
};

export const LICENSE_CLASSES = {
  permissive: { label: 'Dễ dãi', short: 'Thoải mái', commercial: 'yes', text: 'Được dùng, sửa đổi và dùng thương mại; chỉ cần giữ thông báo bản quyền và giấy phép.' },
  'weak-copyleft': { label: 'Copyleft yếu', short: 'Copyleft yếu', commercial: 'yes', text: 'Được dùng thương mại; nếu sửa chính các file của dự án và phân phối lại thì phải công khai phần sửa đổi đó.' },
  copyleft: { label: 'Copyleft', short: 'Copyleft', commercial: 'conditions', text: 'Được dùng thương mại, nhưng nếu phân phối phần mềm đã sửa đổi/tích hợp thì phải công khai mã nguồn theo cùng giấy phép.' },
  content: { label: 'Nội dung (Creative Commons)', short: 'Nội dung CC', commercial: 'yes', text: 'Được sử dụng và chia sẻ (kể cả thương mại) với điều kiện ghi nguồn; giấy phép SA yêu cầu chia sẻ lại cùng giấy phép.' },
  'source-available': { label: 'Mã nguồn công khai có hạn chế', short: 'Có hạn chế', commercial: 'restricted', text: 'Không phải giấy phép nguồn mở chuẩn OSI: thường cấm cung cấp như dịch vụ cạnh tranh hoặc giới hạn quy mô doanh nghiệp — đọc kỹ điều khoản.' },
  noncommercial: { label: 'Phi thương mại', short: 'Phi thương mại', commercial: 'no', text: 'Không được dùng cho mục đích thương mại.' },
  custom: { label: 'Tùy chỉnh / nhiều giấy phép', short: 'Tùy chỉnh', commercial: 'unknown', text: 'GitHub không tự nhận diện được giấy phép (tùy chỉnh hoặc nhiều giấy phép cho từng phần) — đọc file LICENSE trước khi dùng.' },
  none: { label: 'Chưa có giấy phép', short: 'Không có', commercial: 'no', text: 'Chưa khai báo giấy phép: theo luật bản quyền, tác giả giữ mọi quyền — không được tự ý sao chép, chỉnh sửa hay phân phối lại.' },
};

const NOTE_BY_SPDX = {
  'AGPL-3.0': 'AGPL-3.0: kể cả khi chỉ cung cấp phần mềm đã sửa đổi qua mạng (website/SaaS) cũng phải công khai mã nguồn.',
  'GPL-3.0': 'GPL-3.0: phân phối bản sửa đổi hoặc phần mềm tích hợp phải mở mã theo GPL.',
  'GPL-2.0': 'GPL-2.0: phân phối bản sửa đổi hoặc phần mềm tích hợp phải mở mã theo GPL.',
  'Apache-2.0': 'Apache-2.0: có thêm điều khoản cấp quyền sáng chế; khi phân phối phải ghi chú các thay đổi.',
};

function normalizeSpdx(id) {
  if (!id) return null;
  return String(id).trim().replace(/-(only|or-later)$/i, '').replace(/\+$/, '');
}

/**
 * spdx: spdx_id từ GitHub (vd. "MIT", "NOASSERTION", null); name: tên giấy phép GitHub trả về;
 * override: { spdx, class, name } từ catalog.
 */
export function classifyLicense(spdx, name, override = null) {
  const raw = normalizeSpdx(spdx);
  const eff = normalizeSpdx(override?.spdx) || raw;
  let cls = override?.class || null;
  if (!cls) {
    if (!eff) cls = 'none';
    else if (eff === 'NOASSERTION' || eff === 'OTHER') cls = 'custom';
    else {
      const up = eff.toUpperCase();
      cls = Object.keys(CLASS_OF).find((k) => CLASS_OF[k].includes(up)) || 'custom';
    }
  }
  const info = LICENSE_CLASSES[cls];
  const display = override?.name || (eff && eff !== 'NOASSERTION' && eff !== 'OTHER' ? eff : null) || (name && name !== 'Other' ? name : null) || (cls === 'none' ? 'Không có' : 'Khác');
  return {
    class: cls,
    label: info.label,
    short: info.short,
    commercial: info.commercial,
    text: info.text,
    spdx: raw,
    display,
    github_name: name || null,
    overridden: Boolean(override && (override.spdx || override.class || override.name)),
    spdx_note: NOTE_BY_SPDX[eff] || null,
    osi: ['permissive', 'weak-copyleft', 'copyleft'].includes(cls),
  };
}
