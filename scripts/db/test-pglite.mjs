#!/usr/bin/env node
// Kiểm thử lược đồ PostgreSQL + dữ liệu nạp vào bằng PGlite (PostgreSQL chạy trong Node, không cần cài đặt).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ROOT, readJson } from '../lib/config.mjs';
import { buildSeedSql } from './export-sql.mjs';

const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'));
const db = new PGlite();
const t0 = Date.now();
const step = (m) => console.log(`  ✔ ${m}`);

await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '0001_init.sql'), 'utf8'));
step('Chạy migration 0001_init.sql (bảng, chỉ mục, trigger, RLS)');
const m2 = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '0002_automation.sql'), 'utf8');
await db.exec(m2);
await db.exec(m2);
step('Chạy migration 0002_automation.sql hai lần liên tiếp (idempotent, không lỗi)');
const curatedCount = lib.repos.filter((r) => (r.origin || 'curated') === 'curated').length;

const seed = buildSeedSql({ withReadme: true });
await db.exec(seed);
step(`Nạp dữ liệu (${(seed.length / 1024 / 1024).toFixed(1)} MB SQL)`);

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const n = await one('select count(*)::int as n from repositories');
const nc = await one("select count(*)::int as n from repositories where origin = 'curated'");
const nr = await one("select count(*)::int as n from repositories where origin = 'radar'");
assert.equal(nc.n, curatedCount);
const radarFile = readJson(path.join(ROOT, 'data', 'radar', 'repos.json'), { repos: {} });
assert.ok(nr.n > 0 && nr.n <= Object.keys(radarFile.repos).length, 'repo radar được nạp');
const dupGid = await one('select count(*)::int as n from (select github_id from repositories where github_id is not null group by 1 having count(*) > 1) x');
assert.equal(dupGid.n, 0);
step(`${nc.n} repo catalog + ${nr.n} repo radar; GitHub ID không trùng lặp`);

const cats = await db.query('select category_slug, count(*)::int as n from repository_categories group by 1');
for (const c of lib.categories) {
  const expected = lib.repos.filter((r) => (r.origin || 'curated') === 'curated' && r.categories.includes(c.slug)).length;
  assert.equal(cats.rows.find((x) => x.category_slug === c.slug)?.n ?? 0, expected, `danh mục ${c.slug}`);
}
const prim = await one('select count(*)::int as n from repository_categories where is_primary');
assert.equal(prim.n, curatedCount);
step('Quan hệ repository ↔ danh mục đúng (mỗi repo đúng một danh mục chính)');

const top = await db.query("select full_name from repositories where tier is not null and origin = 'curated' order by score desc, full_name limit 5");
const expectedTop = [...lib.repos].filter((r) => r.score && (r.origin || 'curated') === 'curated').sort((a, b) => b.score.total - a.score.total || a.full_name.localeCompare(b.full_name)).slice(0, 5).map((r) => r.full_name);
assert.deepEqual(top.rows.map((r) => r.full_name), expectedTop);
step(`Top 5 theo điểm khớp: ${expectedTop.join(', ')}`);

const tags = await one('select count(*)::int as tags, (select count(*)::int from repository_tags) as links from tags');
const rel = await one('select count(*)::int as n from repository_releases where is_latest');
const stats = await one('select count(*)::int as n from repository_statistics');
step(`${tags.tags} thẻ (${tags.links} liên kết), ${rel.n} bản phát hành mới nhất, ${stats.n} điểm lịch sử số liệu`);

const auto = await one(`select (select count(*)::int from repository_metrics) as metrics, (select count(*)::int from repository_metric_snapshots) as snaps,
  (select count(*)::int from repository_scores) as scores, (select count(*)::int from repository_categories where source = 'auto') as areas,
  (select count(*)::int from sync_jobs) as jobs, (select count(*)::int from sync_settings) as settings,
  (select count(*)::int from repository_scores where trending_7d is not null and growth_method_7d is null) as no_method`);
assert.ok(auto.metrics > 0 && auto.snaps > 0 && auto.scores > 0 && auto.areas > 0 && auto.jobs > 0 && auto.settings === 1);
assert.equal(auto.no_method, 0, 'không có điểm xu hướng thiếu phương pháp đo');
step(`Hệ thống tự động: ${auto.metrics} dòng số liệu, ${auto.snaps} snapshot, ${auto.scores} điểm, ${auto.areas} nhãn lĩnh vực, ${auto.jobs} lượt chạy job`);
await assert.rejects(db.query("insert into repository_scores (repository_id, scored_on, trending_7d) select id, '2000-01-01', 50 from repositories limit 1"), /repository_scores_method_7d/);
step('Ràng buộc: không lưu được điểm xu hướng khi không có phương pháp đo tăng trưởng');

await db.exec(seed);
const n2 = await one('select count(*)::int as n from repositories');
const tags2 = await one('select count(*)::int as n from repository_tags');
const auto2 = await one('select (select count(*)::int from repository_metric_snapshots) as snaps, (select count(*)::int from repository_scores) as scores, (select count(*)::int from sync_jobs) as jobs');
assert.equal(n2.n, n.n);
assert.equal(tags2.n, tags.links);
assert.deepEqual(auto2, { snaps: auto.snaps, scores: auto.scores, jobs: auto.jobs });
step('Nạp lại lần 2 không tạo trùng lặp (upsert theo GitHub ID / catalog)');

// Repo radar đổi tên: cùng GitHub ID, tên mới → cập nhật tại chỗ, giữ lịch sử, ghi tên cũ
const rr = await one("select id, github_id, full_name from repositories where origin = 'radar' and github_id is not null order by id limit 1");
const snapsBefore = await one('select count(*)::int as n from repository_metric_snapshots where repository_id = $1', [rr.id]);
const renamed = seed.split(`'${rr.full_name}'`).join(`'${rr.full_name}-moi'`);
await db.exec(renamed);
const after = await one('select id, full_name, transferred_from from repositories where github_id = $1', [rr.github_id]);
assert.equal(after.id, rr.id);
assert.equal(after.full_name, `${rr.full_name}-moi`);
assert.equal(after.transferred_from, rr.full_name);
assert.equal((await one('select count(*)::int as n from repositories')).n, n.n);
assert.equal((await one('select count(*)::int as n from repository_metric_snapshots where repository_id = $1', [rr.id])).n, snapsBefore.n);
step(`Đổi tên ${rr.full_name} → …-moi: cùng ID, không tạo dòng mới, giữ ${snapsBefore.n} snapshot, ghi tên cũ`);
await db.exec(seed);

// Lưu giữ dữ liệu
await db.query("insert into repository_metric_snapshots (repository_id, measured_at, stars, forks, resolution) values ($1, now() - interval '500 days', 1, 0, 'daily'), ($1, now() - interval '5 days', 2, 0, 'raw')", [rr.id]);
const ret = await one('select apply_retention(400, 60, 120) as r');
assert.ok(ret.r.old_snapshots >= 1 && ret.r.raw_snapshots >= 1);
step(`Hàm lưu giữ dữ liệu: xóa ${ret.r.old_snapshots} snapshot quá 400 ngày, ${ret.r.raw_snapshots} điểm đo thô quá 60 giờ`);

const search = await db.query("select full_name from repositories where summary_vi ilike '%tiếng Việt%' order by score desc limit 3");
assert.ok(search.rows.length > 0);
step(`Truy vấn tiếng Việt: ${search.rows.map((r) => r.full_name).join(', ')}`);

// --- Phân quyền theo dòng (RLS) với người dùng thường
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
  insert into users (id, display_name) values ('${A}', 'A'), ('${B}', 'B');
  create role app_user nologin;
  -- Giống Supabase: người dùng đăng nhập có toàn quyền ở mức bảng, RLS là lớp bảo vệ thật sự
  grant usage on schema public, auth to app_user;
  grant all on all tables in schema public to app_user;
  grant execute on function auth.uid() to app_user;
`);
const repoIds = (await db.query('select id from repositories order by id limit 2')).rows.map((r) => r.id);
const before = await one('select summary_vi from repositories where id = $1', [repoIds[0]]);
await db.exec(`set role app_user; set request.jwt.claim.sub = '${A}';`);
await db.query('insert into favorites (user_id, repository_id) values ($1, $2)', [A, repoIds[0]]);
await assert.rejects(db.query('insert into favorites (user_id, repository_id) values ($1, $2)', [B, repoIds[1]]), /row-level security/);
const upd = await db.query("update repositories set summary_vi = 'hack' where id = $1", [repoIds[0]]);
assert.equal(upd.affectedRows ?? 0, 0, 'người dùng thường không được sửa dữ liệu thư viện');
assert.equal((await one('select summary_vi from repositories where id = $1', [repoIds[0]])).summary_vi, before.summary_vi);
await assert.rejects(db.query("insert into repositories (full_name, catalog_key, owner, name) values ('x/y', 'x/y', 'x', 'y')"), /row-level security/);
await assert.rejects(db.query("update users set role = 'admin' where id = $1", [A]), /row-level security/);
await db.exec(`set request.jwt.claim.sub = '${B}';`);
const seenByB = await one('select count(*)::int as n from favorites');
assert.equal(seenByB.n, 0);
const publicRead = await one('select count(*)::int as n from repositories');
assert.equal(publicRead.n, n.n);
assert.ok((await one('select count(*)::int as n from repository_scores')).n > 0, 'ai cũng đọc được điểm');
assert.equal((await one('select count(*)::int as n from sync_jobs')).n, 0, 'người dùng thường không xem được lượt chạy job');
assert.equal((await one('select count(*)::int as n from sync_settings')).n, 0, 'người dùng thường không xem được cấu hình');
await assert.rejects(db.query("insert into admin_actions (acted_at, action) values (now(), 'x')"), /row-level security/);
await assert.rejects(db.query("insert into repository_scores (repository_id, scored_on, quality) values ($1, '2001-01-01', 99)", [repoIds[0]]), /row-level security/);
await db.exec('reset role;');
step('RLS: người dùng chỉ thêm/xem yêu thích của mình, không sửa được dữ liệu thư viện/điểm, không xem được job/cấu hình/nhật ký quản trị; ai cũng đọc được thư viện và điểm');

await db.close();
console.log(`\nLược đồ và dữ liệu PostgreSQL hợp lệ (${((Date.now() - t0) / 1000).toFixed(1)} giây).`);
