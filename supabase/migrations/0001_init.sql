-- =====================================================================
-- OpenKho – lược đồ PostgreSQL (tương thích Supabase)
-- Dùng khi muốn nâng cấp từ bản tĩnh lên bản có tài khoản người dùng,
-- yêu thích/bộ sưu tập đồng bộ đám mây và trang quản trị trực tuyến.
-- Dữ liệu nạp từ src/generated/library.json bằng: npm run db:sql (→ supabase/seed.sql) hoặc npm run db:load
-- =====================================================================

-- Postgres thường (không phải Supabase): tạo schema auth tối thiểu để các khóa ngoại và chính sách RLS hoạt động.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable
      as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  end if;
end $$;

-- ---------------------------------------------------------------- Danh mục
create table categories (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  short_name  text,
  description text,
  icon        text,
  hue         smallint check (hue between 0 and 360),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Repository
create table repositories (
  id              bigint generated always as identity primary key,
  full_name       text not null unique,          -- tên chính thức hiện tại trên GitHub (owner/name)
  catalog_key     text not null unique,          -- tên như trong file catalog
  owner           text not null,
  name            text not null,
  page_path       text unique,                   -- đường dẫn trang trên website
  status          text not null default 'pending'
                  check (status in ('ok', 'archived', 'not_found', 'blocked', 'unverified', 'pending')),
  renamed_from    text,
  -- Nội dung biên tập (tiếng Việt)
  summary_vi      text,
  use_cases       text[] not null default '{}',
  features        text[] not null default '{}',
  pros            text[] not null default '{}',
  cons            text[] not null default '{}',
  platforms       text[] not null default '{}',
  deploy          text[] not null default '{}',
  difficulty      text check (difficulty in ('easy', 'medium', 'hard')),
  pricing         text check (pricing in ('free', 'freemium', 'paid-license')),
  needs_api_key   text check (needs_api_key in ('none', 'optional', 'required')),
  requirements    text,
  quick_start     text,
  note            text,
  license_note    text,
  docs_url        text,
  demo_url        text,
  video_url       text,
  applicability   smallint check (applicability between 1 and 5),
  featured        boolean not null default false,
  added_at        date,
  -- Số liệu GitHub (giá trị hiện tại; lịch sử ở repository_statistics)
  description     text,
  homepage        text,
  default_branch  text,
  language        text,
  owner_type      text,
  avatar_url      text,
  og_image        text,
  license_spdx    text,
  license_name    text,
  license_class   text check (license_class in ('permissive', 'weak-copyleft', 'copyleft', 'content', 'source-available', 'noncommercial', 'custom', 'none')),
  license_display text,
  stars           integer,
  forks           integer,
  open_issues     integer,
  contributors    integer,
  repo_created_at timestamptz,
  pushed_at       timestamptz,
  last_commit_at  timestamptz,
  commits_90d     integer,
  is_archived     boolean not null default false,
  -- Đánh giá
  score           numeric(5, 1) check (score between 0 and 100),
  tier            text check (tier in ('excellent', 'good', 'potential', 'review')),
  score_breakdown jsonb,
  flags           jsonb not null default '[]'::jsonb,
  trend_per_day   numeric(10, 1),
  readme_sections jsonb,
  fetched_at      timestamptz,                    -- thời điểm lấy số liệu từ GitHub
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index repositories_tier_idx on repositories (tier);
create index repositories_score_idx on repositories (score desc);
create index repositories_stars_idx on repositories (stars desc);
create index repositories_last_commit_idx on repositories (last_commit_at desc);
create index repositories_platforms_idx on repositories using gin (platforms);
create index repositories_license_class_idx on repositories (license_class);

-- Quan hệ nhiều-nhiều repo ↔ danh mục (một danh mục chính)
create table repository_categories (
  repository_id bigint not null references repositories (id) on delete cascade,
  category_slug text not null references categories (slug) on update cascade on delete restrict,
  is_primary    boolean not null default false,
  primary key (repository_id, category_slug)
);
create unique index repository_categories_one_primary on repository_categories (repository_id) where is_primary;
create index repository_categories_slug_idx on repository_categories (category_slug);

-- Thẻ: từ khóa biên tập + topic GitHub (không trùng lặp tên thẻ)
create table tags (
  id   bigint generated always as identity primary key,
  name text not null unique check (name = lower(name))
);
create table repository_tags (
  repository_id bigint not null references repositories (id) on delete cascade,
  tag_id        bigint not null references tags (id) on delete cascade,
  source        text not null default 'editorial' check (source in ('editorial', 'github_topic')),
  primary key (repository_id, tag_id, source)
);

-- Lịch sử số liệu theo ngày (để tính "đang phát triển mạnh")
create table repository_statistics (
  repository_id bigint not null references repositories (id) on delete cascade,
  captured_on   date not null,
  stars         integer not null,
  forks         integer not null,
  open_issues   integer,
  contributors  integer,
  commits_90d   integer,
  captured_at   timestamptz not null default now(),
  primary key (repository_id, captured_on)
);

-- Bản phát hành
create table repository_releases (
  id            bigint generated always as identity primary key,
  repository_id bigint not null references repositories (id) on delete cascade,
  tag           text not null,
  name          text,
  published_at  timestamptz,
  url           text,
  is_prerelease boolean not null default false,
  is_latest     boolean not null default false,
  assets        jsonb not null default '[]'::jsonb,
  unique (repository_id, tag)
);
create unique index repository_releases_one_latest on repository_releases (repository_id) where is_latest;

-- Nhật ký các lần đồng bộ
create table sync_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz,
  finished_at timestamptz,
  mode        text,
  totals      jsonb,
  report      jsonb
);

-- ---------------------------------------------------------------- Người dùng
create table users (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'member' check (role in ('member', 'editor', 'admin')),
  created_at   timestamptz not null default now()
);

create table favorites (
  user_id       uuid not null references users (id) on delete cascade,
  repository_id bigint not null references repositories (id) on delete cascade,
  note          text,
  created_at    timestamptz not null default now(),
  primary key (user_id, repository_id)
);

create table collections (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  description text,
  is_public   boolean not null default false,
  share_slug  text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table collection_items (
  collection_id bigint not null references collections (id) on delete cascade,
  repository_id bigint not null references repositories (id) on delete cascade,
  position      integer not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, repository_id)
);

-- ---------------------------------------------------------------- Tự cập nhật updated_at
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger categories_updated before update on categories for each row execute function set_updated_at();
create trigger repositories_updated before update on repositories for each row execute function set_updated_at();
create trigger collections_updated before update on collections for each row execute function set_updated_at();

-- ---------------------------------------------------------------- Chế độ xem tiện dụng
create view repository_overview as
select r.id, r.full_name, r.summary_vi, r.stars, r.forks, r.score, r.tier, r.license_display, r.license_class,
       r.last_commit_at, r.fetched_at, r.status, rc.category_slug as primary_category
from repositories r
left join repository_categories rc on rc.repository_id = r.id and rc.is_primary;

-- ---------------------------------------------------------------- Phân quyền theo dòng (RLS)
-- Dữ liệu thư viện: ai cũng đọc được; chỉ biên tập viên/quản trị (hoặc service role của script đồng bộ) được ghi.
create function is_editor() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = auth.uid() and u.role in ('editor', 'admin'))
$$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'repositories', 'repository_categories', 'tags', 'repository_tags', 'repository_statistics', 'repository_releases', 'sync_runs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
    execute format('create policy %I on %I for all using (is_editor()) with check (is_editor())', t || '_editor_write', t);
  end loop;
end $$;

alter table users enable row level security;
create policy users_self_read on users for select using (id = auth.uid() or is_editor());
create policy users_self_insert on users for insert with check (id = auth.uid() and role = 'member');
create policy users_self_update on users for update using (id = auth.uid()) with check (id = auth.uid() and role = (select u.role from users u where u.id = auth.uid()));

alter table favorites enable row level security;
create policy favorites_owner on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table collections enable row level security;
create policy collections_owner on collections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collections_public_read on collections for select using (is_public);

alter table collection_items enable row level security;
create policy collection_items_owner on collection_items for all
  using (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy collection_items_public_read on collection_items for select
  using (exists (select 1 from collections c where c.id = collection_id and c.is_public));
