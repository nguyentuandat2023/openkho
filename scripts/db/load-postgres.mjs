#!/usr/bin/env node
// Nạp dữ liệu thư viện vào PostgreSQL/Supabase thật.
//   DATABASE_URL=postgresql://... npm run db:load -- --migrate   (lần đầu: tạo bảng rồi nạp dữ liệu)
//   DATABASE_URL=postgresql://... npm run db:load                (các lần sau: chỉ cập nhật dữ liệu)
// DATABASE_URL lấy trong Supabase: Project Settings → Database → Connection string (URI). Đặt trong .env.local.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, argv } from '../lib/config.mjs';
import { buildSeedSql } from './export-sql.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Thiếu DATABASE_URL (đặt trong .env.local hoặc biến môi trường).');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  if (argv('migrate')) {
    // Chỉ chạy migration chưa áp dụng; mỗi migration trong một transaction (lỗi → hoàn tác, dữ liệu cũ giữ nguyên)
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    if (!done.size) {
      const has0001 = (await client.query("select to_regclass('public.repositories') as t")).rows[0].t;
      if (has0001) { await client.query("insert into schema_migrations (name) values ('0001_init') on conflict do nothing"); done.add('0001_init'); }
    }
    const dir = path.join(ROOT, 'supabase', 'migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const name = f.replace(/\.sql$/, '');
      if (done.has(name)) { console.log(`Bỏ qua ${f} (đã áp dụng)`); continue; }
      console.log(`Chạy migration ${f}…`);
      await client.query('begin');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1) on conflict do nothing', [name]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${f} lỗi, đã hoàn tác: ${err.message}`);
      }
    }
  }
  console.log('Nạp dữ liệu…');
  await client.query(buildSeedSql({ withReadme: Boolean(argv('with-readme')) }));
  const { rows } = await client.query('select count(*)::int as repos, count(*) filter (where tier = \'excellent\')::int as excellent from repositories');
  console.log(`✔ Xong: ${rows[0].repos} repository (${rows[0].excellent} xếp loại Xuất sắc).`);
} finally {
  await client.end();
}
