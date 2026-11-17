-- =====================================================================
-- OpenKho – migration 0002: hệ thống tự động khám phá, đo tăng trưởng và xếp hạng
-- Chạy sau 0001_init.sql. Viết theo kiểu idempotent (chạy lại nhiều lần không lỗi, không mất dữ liệu).
-- Định danh ổn định: GitHub Repository ID (github_id) — không đổi khi repo đổi tên/chuyển chủ sở hữu.
-- =====================================================================

-- ---------------------------------------------------------------- repositories: định danh + nguồn gốc
alter table repositories add column if not exists github_id           bigint;
alter table repositories add column if not exists node_id             text;
alter table repositories add column if not exists origin              text not null default 'curated';
alter table repositories add column if not exists visibility          text not null default 'public';
alter table repositories add column if not exists first_seen_at       timestamptz;
alter table repositories add column if not exists last_seen_at        timestamptz;
alter table repositories add column if not exists missing_since       timestamptz;   -- lần đầu phát hiện 404/451
alter table repositories add column if not exists transferred_from    text;          -- tên cũ khi đổi tên/chuyển chủ
alter table repositories add column if not exists metadata_updated_at timestamptz;   -- updated_at của GitHub (đổi cả khi chỉ sửa mô tả/sao)
alter table repositories add column if not exists is_hidden           boolean not null default false;
alter table repositories add column if not exists is_excluded         boolean not null default false;
alter table repositories add column if not exists is_pinned           boolean not null default false;
alter table repositories add column if not exists is_published        boolean not null default true;  -- có trang chi tiết trên website
alter table repositories add column if not exists suppressed_reason   text;          -- bị loại tự động (vd. cụm repo nhân bản)
-- Repo tự phát hiện không có mục catalog
alter table repositories alter column catalog_key drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'repositories_origin_chk') then
    alter table repositories add constraint repositories_origin_chk check (origin in ('curated', 'radar'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'repositories_visibility_chk') then
    alter table repositories add constraint repositories_visibility_chk check (visibility in ('public', 'private', 'internal', 'unknown'));
  end if;
end $$;
create unique index if not exists repositories_github_id_key on repositories (github_id) where github_id is not null;
create index if not exists repositories_origin_idx on repositories (origin);
create index if not exists repositories_first_seen_idx on repositories (first_seen_at desc);

-- ---------------------------------------------------------------- categories: thêm loại "lĩnh vực công nghệ" (gán tự động)
alter table categories add column if not exists kind    text not null default 'editorial';
alter table categories add column if not exists name_en text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_kind_chk') then
    alter table categories add constraint categories_kind_chk check (kind in ('editorial', 'area'));
  end if;
end $$;

-- Nhãn tự động kèm độ tin cậy và tín hiệu (để kiểm chứng)
alter table repository_categories add column if not exists source     text not null default 'editorial';
alter table repository_categories add column if not exists confidence numeric(3, 2);
alter table repository_categories add column if not exists signals    text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'repository_categories_source_chk') then
    alter table repository_categories add constraint repository_categories_source_chk check (source in ('editorial', 'auto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'repository_categories_confidence_chk') then
    alter table repository_categories add constraint repository_categories_confidence_chk check (confidence is null or confidence between 0 and 1);
  end if;
end $$;

-- ---------------------------------------------------------------- Số liệu hiện tại (1 dòng / repo)
create table if not exists repository_metrics (
  repository_id          bigint primary key references repositories (id) on delete cascade,
  stars                  integer,
  forks                  integer,
  watchers               integer,
  open_issues            integer,
  open_prs               integer,
  contributors           integer,
  commits_90d            integer,
  commits_90d_estimated  boolean not null default false,
  last_commit_at         timestamptz,
  last_commit_verified   boolean not null default false,   -- true = commit nhánh chính (feed/GraphQL); false = chỉ biết lần push
  pushed_at              timestamptz,
  metadata_updated_at    timestamptz,
  size_kb                integer,
  has_issues             boolean,
  has_discussions        boolean,
  release_tag            text,
  release_published_at   timestamptz,
  readme_length          integer,
  readme_has_install     boolean,
  readme_has_usage       boolean,
  measured_at            timestamptz not null,
  source                 text,
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------- Chuỗi số liệu theo thời gian (chỉ lần đo thật)
create table if not exists repository_metric_snapshots (
  repository_id bigint not null references repositories (id) on delete cascade,
  measured_at   timestamptz not null,
  stars         integer not null check (stars >= 0),
  forks         integer check (forks >= 0),
  resolution    text not null default 'daily' check (resolution in ('raw', 'daily')),
  primary key (repository_id, measured_at)
);
create index if not exists repository_metric_snapshots_time_idx on repository_metric_snapshots (measured_at);

-- ---------------------------------------------------------------- Điểm theo ngày (Quality + Trending 3 kỳ)
create table if not exists repository_scores (
  repository_id     bigint not null references repositories (id) on delete cascade,
  scored_on         date not null,
  quality           numeric(5, 1) check (quality between 0 and 100),
  quality_coverage  numeric(4, 3) check (quality_coverage between 0 and 1),
  quality_tier      text check (quality_tier in ('excellent', 'good', 'potential', 'review')),
  trending_1d       numeric(5, 1) check (trending_1d between 0 and 100),
  trending_7d       numeric(5, 1) check (trending_7d between 0 and 100),
  trending_30d      numeric(5, 1) check (trending_30d between 0 and 100),
  growth_1d         integer,
  growth_7d         integer,
  growth_30d        integer,
  growth_method_1d  text check (growth_method_1d in ('snapshots', 'created_in_window', 'stargazer_sample')),
  growth_method_7d  text check (growth_method_7d in ('snapshots', 'created_in_window', 'stargazer_sample')),
  growth_method_30d text check (growth_method_30d in ('snapshots', 'created_in_window', 'stargazer_sample')),
  coverage_7d       numeric(4, 3),
  is_gem            boolean not null default false,
  anomaly           jsonb,
  reasons_7d        jsonb,
  components_7d     jsonb,
  weights           jsonb,
  computed_at       timestamptz,
  primary key (repository_id, scored_on),
  -- Không có điểm xu hướng nếu không có phương pháp đo tăng trưởng
  constraint repository_scores_method_1d check (trending_1d is null or growth_method_1d is not null),
  constraint repository_scores_method_7d check (trending_7d is null or growth_method_7d is not null),
  constraint repository_scores_method_30d check (trending_30d is null or growth_method_30d is not null)
);
create index if not exists repository_scores_t7_idx on repository_scores (scored_on, trending_7d desc nulls last);

-- ---------------------------------------------------------------- Phân tích AI (có gắn nhãn, có kiểm chứng trích dẫn)
create table if not exists repository_ai_analyses (
  id              bigint generated always as identity primary key,
  repository_id   bigint not null references repositories (id) on delete cascade,
  model           text not null,
  prompt_version  integer not null,
  input_hash      text not null,
  status          text not null check (status in ('ok', 'rejected', 'refused', 'incomplete', 'error')),
  summary_vi      text,
  summary_en      text,
  result          jsonb,
  verification    jsonb,
  input_truncated boolean not null default false,
  readme_path     text,
  input_tokens    integer,
  output_tokens   integer,
  generated_at    timestamptz not null,
  unique (repository_id, input_hash, model)
);

-- ---------------------------------------------------------------- Bộ lập lịch: lượt chạy, nhật ký, cấu hình, thao tác quản trị
create table if not exists sync_jobs (
  id           text primary key,          -- mã lượt chạy (vd. 2026-11-16T06-53-41-330Z_discover)
  job          text not null check (job in ('discover', 'refresh', 'rank', 'reevaluate', 'cleanup', 'ai_analyze')),
  trigger      text,
  status       text not null check (status in ('running', 'success', 'failed', 'timeout', 'interrupted', 'deferred', 'skipped')),
  started_at   timestamptz not null,
  finished_at  timestamptz,
  duration_ms  integer,
  attempts     integer,
  error        text,
  summary      text,
  stats        jsonb,
  host         text,
  next_due_at  timestamptz
);
create index if not exists sync_jobs_job_time_idx on sync_jobs (job, started_at desc);

create table if not exists sync_logs (
  id        bigint generated always as identity primary key,
  job_id    text not null references sync_jobs (id) on delete cascade,
  seq       integer not null,
  line      text not null,
  unique (job_id, seq)
);

create table if not exists sync_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_actions (
  id       bigint generated always as identity primary key,
  acted_at timestamptz not null,
  actor    text,
  action   text not null,
  target   text,
  details  jsonb,
  unique (acted_at, action, target)
);

-- ---------------------------------------------------------------- RLS
-- Số liệu/điểm/phân tích: ai cũng đọc được; chỉ biên tập viên (hoặc service role của job) được ghi.
-- Lượt chạy, nhật ký, cấu hình, thao tác quản trị: chỉ biên tập viên/quản trị đọc và ghi.
do $$
declare t text;
begin
  foreach t in array array['repository_metrics', 'repository_metric_snapshots', 'repository_scores', 'repository_ai_analyses']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_public_read') then
      execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_editor_write') then
      execute format('create policy %I on %I for all using (is_editor()) with check (is_editor())', t || '_editor_write', t);
    end if;
  end loop;
  foreach t in array array['sync_jobs', 'sync_logs', 'sync_settings', 'admin_actions']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_editor_all') then
      execute format('create policy %I on %I for all using (is_editor()) with check (is_editor())', t || '_editor_all', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- Lưu giữ dữ liệu (retention)
create or replace function apply_retention(snapshot_days integer default 400, raw_hours integer default 60, job_days integer default 120)
returns jsonb language plpgsql as $$
declare
  n_raw integer; n_snap integer; n_logs integer; n_jobs integer;
begin
  delete from repository_metric_snapshots where resolution = 'raw' and measured_at < now() - make_interval(hours => raw_hours);
  get diagnostics n_raw = row_count;
  delete from repository_metric_snapshots where measured_at < now() - make_interval(days => snapshot_days);
  get diagnostics n_snap = row_count;
  delete from sync_logs where job_id in (select id from sync_jobs where started_at < now() - make_interval(days => job_days));
  get diagnostics n_logs = row_count;
  delete from sync_jobs where started_at < now() - make_interval(days => job_days) and status <> 'running';
  get diagnostics n_jobs = row_count;
  return jsonb_build_object('raw_snapshots', n_raw, 'old_snapshots', n_snap, 'logs', n_logs, 'jobs', n_jobs);
end $$;

-- ---------------------------------------------------------------- Chế độ xem: bảng xếp hạng mới nhất
create or replace view trending_latest as
select r.id, r.full_name, r.origin, r.is_published, s.scored_on, s.trending_1d, s.trending_7d, s.trending_30d,
       s.growth_7d, s.growth_method_7d, s.quality, s.quality_coverage, s.is_gem
from repositories r
join lateral (select * from repository_scores x where x.repository_id = r.id order by x.scored_on desc limit 1) s on true
where not r.is_hidden and not r.is_excluded and r.suppressed_reason is null;

-- Ghi nhận migration (dùng bởi scripts/db/load-postgres.mjs)
create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
insert into schema_migrations (name) values ('0002_automation') on conflict do nothing;
