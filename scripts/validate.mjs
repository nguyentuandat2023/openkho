#!/usr/bin/env node
// Kiểm tra catalog và danh mục: cú pháp YAML, trùng lặp, giá trị hợp lệ. Dùng trong CI và trước khi đồng bộ.
import { validate } from './lib/catalog.mjs';

try {
  const { errors, warnings, count } = validate();
  for (const w of warnings) console.log(`  cảnh báo: ${w}`);
  if (errors.length) {
    console.error(`\n✖ ${errors.length} lỗi:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✔ Catalog hợp lệ: ${count} repo${warnings.length ? ` (${warnings.length} cảnh báo)` : ''}.`);
} catch (err) {
  console.error(`✖ Không đọc được catalog: ${err.message}`);
  process.exit(1);
}
