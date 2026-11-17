#!/usr/bin/env node
// Xuất dữ liệu thư viện (src/generated/library.json + lịch sử sao) thành câu lệnh SQL upsert cho PostgreSQL/Supabase.
//   npm run db:sql                    → supabase/seed.sql (không kèm nội dung README)
//   npm run db:sql -- --with-readme   → kèm các mục README đã làm sạch (file lớn hơn)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readJson, HISTORY_FILE, SYNC_REPORT_FILE, argv } from '../lib/config.mjs';
import { buildAutomationSql } from './export-automation.mjs';

const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const arr = (a) => (a && a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const jsonb = (o) => (o === null || o === undefined ? 'null' : `${q(JSON.stringify(o))}::jsonb`);
const ts = (v) => (v ? `${q(v)}::timestamptz` : 'null');
const repoId = (key) => `(select id from repositories where catalog_key = ${q(key)})`;

/**
 * withReadme: kèm nội dung README đã làm sạch · automation: kèm dữ liệu hệ thống tự động (cần migration 0002)
 */
export function buildSeedSql({ withReadme = false, automation = true } = {}) {
  const lib = readJson(path.join(ROOT, 'src', 'generated', 'library.json'));
  if (!lib) throw new Error('Thiếu library.json — chạy `npm run data` trước.');
  const history = readJson(HISTORY_FILE, {});
  const report = readJson(SYNC_REPORT_FILE, null);
  const out = ['-- Sinh tự động bởi scripts/db/export-sql.mjs – có thể chạy lại nhiều lần (upsert)', `-- Dữ liệu tạo lúc ${lib.generated_at}`, 'begin;', ''];

  lib.categories.forEach((c, i) => {
    out.push(`insert into categories (slug, name, short_name, description, icon, hue, sort_order) values (${[c.slug, c.name, c.short, c.description, c.icon].map(q).join(', ')}, ${q(c.hue)}, ${i})
  on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name, description = excluded.description, icon = excluded.icon, hue = excluded.hue, sort_order = excluded.sort_order;`);
  });
  out.push('');

  for (const r of lib.repos.filter((x) => (x.origin || 'curated') === 'curated')) {
    const s = r.stats || {};
    if (automation) {
      // Repo vừa được đưa từ radar vào catalog: chuyển dòng radar sẵn có thành dòng catalog (giữ nguyên lịch sử số liệu)
      out.push(`update repositories set catalog_key = ${q(r.key)}, origin = 'curated' where catalog_key is null and (${r.gid ? `github_id = ${q(Number(r.gid))} or ` : ''}lower(full_name) = lower(${q(r.full_name)}));`);
    }
    const cols = {
      full_name: q(r.full_name), catalog_key: q(r.key), owner: q(r.owner), name: q(r.name), page_path: q(r.path), status: q(r.status),
      renamed_from: q(r.key.toLowerCase() !== r.full_name.toLowerCase() ? r.key : null),
      summary_vi: q(r.summary), use_cases: arr(r.use_cases), features: arr(r.features), pros: arr(r.pros), cons: arr(r.cons),
      platforms: arr(r.platforms), deploy: arr(r.deploy), difficulty: q(r.difficulty), pricing: q(r.pricing), needs_api_key: q(r.needs_api_key),
      requirements: q(r.requirements), quick_start: q(r.quick_start), note: q(r.note), license_note: q(r.license_note),
      docs_url: q(r.links.docs), demo_url: q(r.links.demo), video_url: q(r.links.video), applicability: q(r.applicability), featured: q(r.featured),
      added_at: r.added_at ? `${q(r.added_at)}::date` : 'null',
      description: q(r.description), homepage: q(r.homepage), default_branch: q(r.branch), language: q(r.language), owner_type: q(r.owner_type),
      avatar_url: q(r.avatar_url), og_image: q(r.og_image), license_spdx: q(r.license.spdx), license_name: q(r.license.github_name),
      license_class: q(r.license.class), license_display: q(r.license.display),
      stars: q(s.stars), forks: q(s.forks), open_issues: q(s.open_issues), contributors: q(s.contributors),
      repo_created_at: ts(s.created_at), pushed_at: ts(s.pushed_at), last_commit_at: ts(s.last_commit_at), commits_90d: q(s.commits_90d), is_archived: q(Boolean(s.archived)),
      score: q(r.score ? r.score.total : null), tier: q(r.score?.tier ?? null), score_breakdown: jsonb(r.score?.breakdown ?? null), flags: jsonb(r.score?.flags ?? []),
      trend_per_day: q(r.trend ? Math.round((r.trend.gained / ({ d1: 1, d7: 7, d30: 30 }[r.trend.window] || 7)) * 10) / 10 : null), readme_sections: withReadme ? jsonb(r.readme?.sections ?? null) : 'null', fetched_at: ts(r.fetched_at),
    };
    const names = Object.keys(cols);
    out.push(`insert into repositories (${names.join(', ')}) values (${names.map((n) => cols[n]).join(', ')})
  on conflict (catalog_key) do update set ${names.filter((n) => n !== 'catalog_key' && (withReadme || n !== 'readme_sections')).map((n) => `${n} = excluded.${n}`).join(', ')};`);
    out.push(`delete from repository_categories where repository_id = ${repoId(r.key)};`);
    r.categories.forEach((c, i) => out.push(`insert into repository_categories (repository_id, category_slug, is_primary) values (${repoId(r.key)}, ${q(c)}, ${i === 0});`));
    const tags = [...new Set(r.tags.map((t) => t.toLowerCase()))].map((t) => [t, 'editorial']).concat([...new Set(r.topics.map((t) => t.toLowerCase()))].map((t) => [t, 'github_topic']));
    for (const [t] of tags) out.push(`insert into tags (name) values (${q(t)}) on conflict (name) do nothing;`);
    out.push(`delete from repository_tags where repository_id = ${repoId(r.key)};`);
    for (const [t, src] of tags) out.push(`insert into repository_tags (repository_id, tag_id, source) select ${repoId(r.key)}, id, ${q(src)} from tags where name = ${q(t)} on conflict do nothing;`);
    for (const [day, stars, forks] of history[r.full_name.toLowerCase()] || []) {
      out.push(`insert into repository_statistics (repository_id, captured_on, stars, forks) values (${repoId(r.key)}, ${q(day)}::date, ${q(stars)}, ${q(forks)}) on conflict (repository_id, captured_on) do update set stars = excluded.stars, forks = excluded.forks;`);
    }
    if (r.release) {
      out.push(`update repository_releases set is_latest = false where repository_id = ${repoId(r.key)} and tag <> ${q(r.release.tag)};`);
      out.push(`insert into repository_releases (repository_id, tag, name, published_at, url, is_prerelease, is_latest, assets) values (${repoId(r.key)}, ${q(r.release.tag)}, ${q(r.release.name)}, ${ts(r.release.published_at)}, ${q(r.release.url)}, false, true, ${jsonb(r.release.assets || [])})
  on conflict (repository_id, tag) do update set name = excluded.name, published_at = excluded.published_at, url = excluded.url, is_latest = true, assets = excluded.assets;`);
    }
    out.push('');
  }
  if (report?.finished_at) {
    out.push(`insert into sync_runs (started_at, finished_at, mode, totals, report) select ${ts(report.started_at)}, ${ts(report.finished_at)}, ${q(report.mode)}, ${jsonb(report.totals)}, ${jsonb({ renamed: report.renamed, deleted: report.deleted, archived: report.archived })}
  where not exists (select 1 from sync_runs where finished_at = ${ts(report.finished_at)});`);
  }
  if (automation) out.push(buildAutomationSql());
  out.push('', 'commit;', '');
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = buildSeedSql({ withReadme: Boolean(argv('with-readme')), automation: !argv('no-automation') });
  const file = path.join(ROOT, 'supabase', 'seed.sql');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, sql, 'utf8');
  console.log(`Đã ghi ${path.relative(ROOT, file)} (${(sql.length / 1024).toFixed(0)} KB).`);
}
