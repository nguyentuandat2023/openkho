// Xuất dữ liệu hệ thống tự động (radar, số liệu, snapshot, điểm, phân tích AI, lượt chạy job, cấu hình, thao tác quản trị)
// thành SQL upsert cho migration 0002. Khóa: GitHub Repository ID → chạy lại nhiều lần không tạo trùng lặp,
// repo đổi tên được cập nhật tại chỗ (giữ nguyên lịch sử).
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../lib/config.mjs';
import { rankAll, loadScoreHistory } from '../lib/rank.mjs';
import { loadAreas } from '../lib/classify.mjs';
import { loadHistory } from '../lib/scheduler/state.mjs';
import { readAdminLog } from '../lib/radar.mjs';
import { AI_DIR } from '../lib/ai.mjs';
import { loadSettings } from '../lib/settings.mjs';

const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const arr = (a) => (a && a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const jsonb = (o) => (o === null || o === undefined ? 'null' : `${q(JSON.stringify(o))}::jsonb`);
const ts = (v) => (v ? `${q(typeof v === 'number' ? new Date(v).toISOString() : v)}::timestamptz` : 'null');
const byGid = (gid) => `(select id from repositories where github_id = ${q(Number(gid))})`;
const DAY = 86400000;

export function buildAutomationSql({ now = Date.now(), result = null } = {}) {
  const res = result || rankAll({ now });
  const out = ['-- Hệ thống tự động (migration 0002)', ''];
  const settings = loadSettings();

  // Lĩnh vực công nghệ = categories loại "area" (slug có tiền tố area- để không trùng danh mục biên tập)
  loadAreas().forEach((a, i) => {
    out.push(`insert into categories (slug, name, name_en, short_name, description, icon, hue, sort_order, kind) values (${q(`area-${a.slug}`)}, ${q(a.name)}, ${q(a.en)}, ${q(a.name)}, ${q(a.description)}, ${q(a.icon)}, ${q(a.hue)}, ${1000 + i}, 'area')
  on conflict (slug) do update set name = excluded.name, name_en = excluded.name_en, description = excluded.description, icon = excluded.icon, hue = excluded.hue, kind = 'area';`);
  });
  out.push('');

  const curatedGid = new Map();
  for (const rec of res.records) {
    const r = rec.raw;
    const m = r?.meta;
    if (!rec.gid || !m) continue;
    const gid = Number(rec.gid);
    const [owner, name] = rec.full_name.split('/');
    const flags = `is_hidden = ${q(rec.hidden)}, is_excluded = ${q(rec.excluded)}, is_pinned = ${q(rec.pinned)}, suppressed_reason = ${q(rec.suppressed?.reason ?? null)}`;
    if (rec.origin === 'curated') {
      curatedGid.set(rec.key, gid);
      // Repo vừa được đưa từ radar vào catalog: dòng radar cũ bị gỡ github_id ở export-sql (bước catalog) — ở đây chỉ gắn ID + cờ
      out.push(`update repositories set github_id = ${gid}, node_id = ${q(r.node_id ?? null)}, origin = 'curated', metadata_updated_at = ${ts(m.updated_at)}, ${flags} where catalog_key = ${q(rec.key)};`);
    } else {
      // Tên đã bị một repo khác (khác ID) chiếm → repo cũ đã bị xóa/đổi tên: đánh dấu tên cũ để tránh trùng khóa
      out.push(`update repositories set full_name = full_name || '#' || coalesce(github_id::text, id::text) where lower(full_name) = lower(${q(rec.full_name)}) and github_id is distinct from ${gid} and origin = 'radar';`);
      const cols = {
        github_id: q(gid), node_id: q(r.node_id ?? null), full_name: q(rec.full_name), owner: q(owner), name: q(name), origin: "'radar'",
        status: q(['ok', 'archived', 'not_found', 'blocked', 'unverified', 'pending'].includes(rec.status) ? rec.status : 'unverified'),
        description: q(m.description), homepage: q(m.homepage), default_branch: q(m.default_branch), language: q(m.language), owner_type: q(m.owner_type),
        avatar_url: q(m.avatar_url), license_spdx: q(rec.lic.spdx), license_name: q(rec.lic.github_name), license_class: q(rec.lic.class), license_display: q(rec.lic.display),
        stars: q(m.stars), forks: q(m.forks), open_issues: q(m.open_issues), repo_created_at: ts(m.created_at), pushed_at: ts(m.pushed_at),
        last_commit_at: ts(r.activity?.last_commit_at || m.pushed_at), commits_90d: q(r.activity?.commits_90d ?? null), is_archived: q(Boolean(m.archived)),
        score: q(rec.quality?.total ?? null), tier: q(rec.quality?.tier ?? null), score_breakdown: jsonb(rec.quality?.breakdown ?? null), flags: jsonb(rec.quality?.flags ?? []),
        fetched_at: ts(r.fetched_at), first_seen_at: ts(r.first_seen_at), last_seen_at: ts(r.last_seen_at), missing_since: ts(r.missing_since),
        metadata_updated_at: ts(m.updated_at), is_hidden: q(rec.hidden), is_excluded: q(rec.excluded), is_pinned: q(rec.pinned),
        is_published: q(Boolean(rec.publish?.published)), suppressed_reason: q(rec.suppressed?.reason ?? null),
      };
      const names = Object.keys(cols);
      out.push(`insert into repositories (${names.join(', ')}) values (${names.map((n) => cols[n]).join(', ')})
  on conflict (github_id) where github_id is not null do update set ${names.filter((n) => n !== 'github_id' && n !== 'first_seen_at').map((n) => `${n} = excluded.${n}`).join(', ')},
    transferred_from = case when repositories.full_name <> excluded.full_name then repositories.full_name else repositories.transferred_from end;`);
    }
    // Số liệu hiện tại
    const a = r.activity || {};
    const verified = Boolean(a.last_commit_at && a.source && a.source !== 'pushed_at');
    out.push(`insert into repository_metrics (repository_id, stars, forks, watchers, open_issues, open_prs, contributors, commits_90d, commits_90d_estimated, last_commit_at, last_commit_verified, pushed_at, metadata_updated_at, size_kb, has_issues, has_discussions, release_tag, release_published_at, readme_length, readme_has_install, readme_has_usage, measured_at, source)
  select ${byGid(gid)}, ${q(m.stars)}, ${q(m.forks)}, ${q(m.watchers ?? null)}, ${q(m.open_issues)}, ${q(m.open_prs ?? null)}, ${q(r.contributors?.anon ? r.contributors.count ?? null : null)}, ${q(a.commits_90d ?? null)}, ${q(Boolean(a.commits_90d_estimated))}, ${ts(verified ? a.last_commit_at : m.pushed_at)}, ${q(verified)}, ${ts(m.pushed_at)}, ${ts(m.updated_at)}, ${q(m.size_kb ?? null)}, ${q(Boolean(m.has_issues))}, ${q(Boolean(m.has_discussions))}, ${q(r.release?.tag ?? null)}, ${ts(r.release?.published_at ?? null)}, ${q(r.readme?.length ?? null)}, ${q(r.readme ? Boolean(r.readme.sections?.install) : null)}, ${q(r.readme ? Boolean(r.readme.sections?.usage) : null)}, ${ts(r.fetched_at || new Date(now).toISOString())}, ${q(r.source || null)}
  on conflict (repository_id) do update set stars = excluded.stars, forks = excluded.forks, watchers = excluded.watchers, open_issues = excluded.open_issues, open_prs = excluded.open_prs, contributors = excluded.contributors, commits_90d = excluded.commits_90d, commits_90d_estimated = excluded.commits_90d_estimated, last_commit_at = excluded.last_commit_at, last_commit_verified = excluded.last_commit_verified, pushed_at = excluded.pushed_at, metadata_updated_at = excluded.metadata_updated_at, size_kb = excluded.size_kb, has_issues = excluded.has_issues, has_discussions = excluded.has_discussions, release_tag = excluded.release_tag, release_published_at = excluded.release_published_at, readme_length = excluded.readme_length, readme_has_install = excluded.readme_has_install, readme_has_usage = excluded.readme_has_usage, measured_at = excluded.measured_at, source = excluded.source, updated_at = now();`);
    // Lĩnh vực (nhãn tự động)
    out.push(`delete from repository_categories where repository_id = ${byGid(gid)} and source = 'auto';`);
    for (const l of rec.areas) {
      out.push(`insert into repository_categories (repository_id, category_slug, is_primary, source, confidence, signals) select ${byGid(gid)}, ${q(`area-${l.slug}`)}, false, 'auto', ${q(l.confidence)}, ${arr(l.signals)} on conflict (repository_id, category_slug) do update set confidence = excluded.confidence, signals = excluded.signals;`);
    }
    // Snapshot: chỉ lần đo thật (ngày + gần đây)
    const daily = res.snaps.dailySeries(rec.gid, 400);
    const recent = (res.snaps.recent.repos[rec.gid] || []).map(([s, st, fk]) => [s * 1000, st, fk]);
    const dailySet = new Set(daily.map((p) => p[0]));
    const rows = [...daily.map((p) => [...p, 'daily']), ...recent.filter((p) => !dailySet.has(p[0])).map((p) => [...p, 'raw'])];
    if (rows.length) {
      out.push(`insert into repository_metric_snapshots (repository_id, measured_at, stars, forks, resolution) select ${byGid(gid)}, v.t::timestamptz, v.s, v.f, v.r from (values ${rows.map(([t, s, f, kind]) => `(${q(new Date(t).toISOString())}, ${q(s)}, ${q(f)}::integer, ${q(kind)})`).join(', ')}) as v(t, s, f, r)
  on conflict (repository_id, measured_at) do nothing;`);
    }
    // Điểm hôm nay (đầy đủ) + lịch sử các ngày trước
    const t = rec.trending || {};
    const g = rec.growth || {};
    const day = new Date(Math.floor(now / DAY) * DAY).toISOString().slice(0, 10);
    out.push(`insert into repository_scores (repository_id, scored_on, quality, quality_coverage, quality_tier, trending_1d, trending_7d, trending_30d, growth_1d, growth_7d, growth_30d, growth_method_1d, growth_method_7d, growth_method_30d, coverage_7d, is_gem, anomaly, reasons_7d, components_7d, weights, computed_at)
  select ${byGid(gid)}, ${q(day)}::date, ${q(rec.quality?.total ?? null)}, ${q(rec.quality?.coverage ?? null)}, ${q(rec.quality?.tier ?? null)}, ${q(t.d1?.score ?? null)}, ${q(t.d7?.score ?? null)}, ${q(t.d30?.score ?? null)}, ${q(g.d1?.gained ?? null)}, ${q(g.d7?.gained ?? null)}, ${q(g.d30?.gained ?? null)}, ${q(g.d1?.method ?? null)}, ${q(g.d7?.method ?? null)}, ${q(g.d30?.method ?? null)}, ${q(t.d7?.coverage ?? null)}, ${q(Boolean(rec.gem))}, ${jsonb(Object.values(t).find((w) => w?.anomaly)?.anomaly ?? null)}, ${jsonb(t.d7?.reasons ?? null)}, ${jsonb(t.d7?.components ?? null)}, ${jsonb(settings.trending.weights)}, ${ts(res.computed_at)}
  on conflict (repository_id, scored_on) do update set quality = excluded.quality, quality_coverage = excluded.quality_coverage, quality_tier = excluded.quality_tier, trending_1d = excluded.trending_1d, trending_7d = excluded.trending_7d, trending_30d = excluded.trending_30d, growth_1d = excluded.growth_1d, growth_7d = excluded.growth_7d, growth_30d = excluded.growth_30d, growth_method_1d = excluded.growth_method_1d, growth_method_7d = excluded.growth_method_7d, growth_method_30d = excluded.growth_method_30d, coverage_7d = excluded.coverage_7d, is_gem = excluded.is_gem, anomaly = excluded.anomaly, reasons_7d = excluded.reasons_7d, components_7d = excluded.components_7d, weights = excluded.weights, computed_at = excluded.computed_at;`);
  }
  // Lịch sử điểm các ngày trước (chỉ khi phương pháp đo tăng trưởng không còn lưu → để trống cột điểm xu hướng nếu thiếu phương pháp)
  const hist = loadScoreHistory();
  const today = Math.floor(now / DAY);
  for (const [gid, points] of Object.entries(hist.repos || {})) {
    for (const [d, , , , qv] of points) {
      if (d >= today) continue;
      out.push(`insert into repository_scores (repository_id, scored_on, quality) select id, ${q(new Date(d * DAY).toISOString().slice(0, 10))}::date, ${q(qv)} from repositories where github_id = ${q(Number(gid))} on conflict (repository_id, scored_on) do nothing;`);
    }
  }
  out.push('');

  // Phân tích AI
  if (fs.existsSync(AI_DIR)) {
    for (const f of fs.readdirSync(AI_DIR).filter((x) => x.endsWith('.json'))) {
      const a = readJson(path.join(AI_DIR, f), null);
      if (!a?.gid) continue;
      out.push(`insert into repository_ai_analyses (repository_id, model, prompt_version, input_hash, status, summary_vi, summary_en, result, verification, input_truncated, readme_path, input_tokens, output_tokens, generated_at)
  select ${byGid(a.gid)}, ${q(a.model)}, ${q(a.prompt_version ?? 1)}, ${q(a.input?.hash || 'unknown')}, ${q(a.status)}, ${q(a.result?.summary_vi ?? null)}, ${q(a.result?.summary_en ?? null)}, ${jsonb(a.result ?? null)}, ${jsonb(a.verification ?? null)}, ${q(Boolean(a.input?.truncated))}, ${q(a.input?.readme_path ?? null)}, ${q(a.usage?.input_tokens ?? null)}, ${q(a.usage?.output_tokens ?? null)}, ${ts(a.generated_at)}
  where ${byGid(a.gid)} is not null on conflict (repository_id, input_hash, model) do nothing;`);
    }
  }

  // Lượt chạy job + nhật ký rút gọn
  for (const r of loadHistory().runs) {
    out.push(`insert into sync_jobs (id, job, trigger, status, started_at, finished_at, duration_ms, attempts, error, summary, stats, host, next_due_at) values (${q(r.id)}, ${q(r.job)}, ${q(r.trigger ?? null)}, ${q(r.status)}, ${ts(r.started_at)}, ${ts(r.finished_at)}, ${q(r.duration_ms ?? null)}, ${q(r.attempts ?? null)}, ${q(r.error ?? null)}, ${q(r.summary ?? null)}, ${jsonb(r.stats ?? null)}, ${q(r.host ?? null)}, ${ts(r.next_due_at)})
  on conflict (id) do update set status = excluded.status, finished_at = excluded.finished_at, duration_ms = excluded.duration_ms, attempts = excluded.attempts, error = excluded.error, summary = excluded.summary, stats = excluded.stats, next_due_at = excluded.next_due_at;`);
    (r.log_tail || []).forEach((line, i) => out.push(`insert into sync_logs (job_id, seq, line) values (${q(r.id)}, ${i}, ${q(line)}) on conflict (job_id, seq) do nothing;`));
  }
  out.push(`insert into sync_settings (key, value) values ('settings', ${jsonb(settings)}) on conflict (key) do update set value = excluded.value, updated_at = now();`);
  for (const a of readAdminLog(5000).reverse()) {
    out.push(`insert into admin_actions (acted_at, actor, action, target, details) values (${ts(a.at)}, ${q(a.actor)}, ${q(a.action)}, ${q(a.target ?? '')}, ${jsonb(a.details ?? null)}) on conflict (acted_at, action, target) do nothing;`);
  }
  out.push('');
  return out.join('\n');
}
