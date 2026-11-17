#!/usr/bin/env node
// Khám phá repo ứng viên qua GitHub Search API (không tự thêm vào thư viện – chỉ lưu vào data/candidates.json để duyệt).
//   npm run discover                       → chạy các bộ truy vấn gợi ý
//   npm run discover -- --query "topic:seo stars:>500"
import { discover, DISCOVERY_PRESETS } from './lib/discover.mjs';
import { argv, sleep } from './lib/config.mjs';

const q = argv('query');
const queries = typeof q === 'string' ? [{ label: 'Tùy chỉnh', q }] : DISCOVERY_PRESETS;
let total = 0;
for (const { label, q: query } of queries) {
  const found = await discover(query, { perPage: 30 });
  total += found.length;
  console.log(`\n## ${label} (${query}) – ${found.length} ứng viên mới`);
  for (const r of found.slice(0, 10)) console.log(`  ${r.full_name.padEnd(44)} ${String(r.stars).padStart(7)}★ ${String(r.license).padEnd(12)} gợi ý: ${r.suggest.join(', ') || '-'}`);
  if (queries.length > 1) await sleep(6500); // Search API không token: 10 lượt/phút
}
console.log(`\nĐã lưu vào data/candidates.json (${total} kết quả mới). Duyệt và thêm trong trang Quản trị → tab "Khám phá".`);
