// Kiểu dữ liệu sinh bởi scripts/build-data.mjs (src/generated/library.json, public/data/index.json)

export type TierKey = 'excellent' | 'good' | 'potential' | 'review';
export type LicenseClass = 'permissive' | 'weak-copyleft' | 'copyleft' | 'content' | 'source-available' | 'noncommercial' | 'custom' | 'none';
export type Commercial = 'yes' | 'conditions' | 'restricted' | 'unknown' | 'no';
export type Platform = 'windows' | 'macos' | 'linux' | 'docker' | 'web' | 'android' | 'ios';
export type Deploy = 'desktop' | 'local' | 'self-host' | 'cli' | 'library' | 'extension' | 'skill' | 'cloud' | 'content';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Pricing = 'free' | 'freemium' | 'paid-license';
export type ApiKey = 'none' | 'optional' | 'required';
export type RepoStatus = 'ok' | 'archived' | 'not_found' | 'blocked' | 'unverified' | 'pending';

export interface Category {
  slug: string;
  name: string;
  short: string;
  description: string;
  icon: string;
  hue: number;
  count: number;
  primary_count?: number;
  stars?: number;
}

export interface LicenseInfo {
  class: LicenseClass;
  label: string;
  short: string;
  commercial: Commercial;
  text: string;
  spdx: string | null;
  display: string;
  github_name: string | null;
  overridden: boolean;
  spdx_note: string | null;
  osi: boolean;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  download_count: number;
  url: string;
  content_type?: string;
}

export interface Release {
  tag: string;
  name: string;
  published_at: string | null;
  url: string;
  is_prerelease: boolean;
  assets: ReleaseAsset[] | null;
  assets_total: number | null;
}

export interface Flag {
  key: string;
  level: 'danger' | 'warning' | 'info';
  text: string;
}

export interface BreakdownItem {
  name: string;
  pts: number | null;
  max: number;
}

export interface Score {
  version: number;
  total: number;
  tier: TierKey;
  breakdown: Record<string, { score: number | null; max: number; partial: boolean; na?: boolean; excluded?: boolean; coverage?: number; items: BreakdownItem[] }>;
  partial: string[];
  coverage: number;
  applicability_rated: boolean;
  flags: Flag[];
  anomaly: { stars_per_day: number; contributors: number; reasons: string[] } | null;
  auto_pros: string[];
  auto_cons: string[];
  is_content: boolean;
  last_commit_days: number | null;
}

export interface ReadmeSection {
  title: string;
  html: string;
  truncated: boolean;
  chars: number;
}

export type WindowKey = 'd1' | 'd7' | 'd30';
export type GrowthMethod = 'snapshots' | 'created_in_window' | 'stargazer_sample';

export interface Growth {
  method: GrowthMethod;
  delta: number;
  gained: number;
  span_hours: number;
  from: string;
  to: string;
  base_stars: number | null;
  forks_gained: number | null;
}

export interface TrendingWindow {
  score: number | null;
  coverage: number;
  insufficient: boolean;
  components: Record<string, { value: number | null; weight: number; share: number }>;
  reasons: string[];
  warnings: string[];
  missing: string[];
  anomaly: string[] | null;
  growth: Growth | null;
}

export interface AreaLabel { slug: string; confidence: number; score: number; signals: string[] }

export interface AiAnalysis {
  model: string;
  generated_at: string;
  truncated: boolean;
  readme_path: string | null;
  summary_vi: string;
  summary_en: string;
  problem: string;
  audiences: string[];
  benefits: { text: string; evidence: string }[];
  highlights: { text: string; evidence: string }[];
  use_cases: { text: string; evidence: string }[];
  docs_accessibility: { level: 'good' | 'basic' | 'poor'; note: string } | null;
  caveats: string[];
  verification: { claims: number; kept: number };
}

export interface Repo {
  id: string;
  gid: string | null;
  key: string;
  origin: 'curated' | 'radar';
  noindex: boolean;
  owner: string;
  name: string;
  full_name: string;
  path: string;
  category: string;
  categories: string[];
  status: RepoStatus;
  synced: boolean;
  visible: boolean;
  fetched_at: string | null;
  source: string | null;
  summary: string | null;
  description: string | null;
  tags: string[];
  topics: string[];
  use_cases: string[];
  features: string[];
  pros: string[];
  cons: string[];
  platforms: Platform[];
  deploy: Deploy[];
  difficulty: Difficulty | null;
  pricing: Pricing | null;
  needs_api_key: ApiKey | null;
  requirements: string | null;
  license_note: string | null;
  note: string | null;
  quick_start: string | null;
  alternatives: string[];
  applicability: number | null;
  featured: boolean;
  added_at: string | null;
  owner_type: string | null;
  avatar_url: string;
  og_image: string;
  homepage: string | null;
  branch: string;
  language: string | null;
  languages: { name: string; color?: string; share: number | null }[] | null;
  stats: {
    stars: number;
    forks: number;
    watchers: number | null;
    open_issues: number;
    open_prs: number | null;
    contributors: number | null;
    contributors_capped: boolean;
    contributors_fetched_at: string | null;
    size_kb: number | null;
    created_at: string;
    pushed_at: string;
    metadata_updated_at: string | null;
    last_commit_at: string;
    last_commit_verified: boolean;
    commits_90d: number | null;
    commits_90d_estimated: boolean;
    archived: boolean;
    is_fork: boolean;
    has_discussions: boolean;
    has_issues: boolean;
  } | null;
  license: LicenseInfo;
  release: Release | null;
  prerelease: { tag: string; name: string; published_at: string | null; url: string } | null;
  latest_tag: { name: string; total?: number } | null;
  releases_count: number | null;
  release_checked: boolean;
  downloads_by_os: Partial<Record<'windows' | 'macos' | 'linux' | 'android', { name: string; size: number; download_count: number; url: string }>>;
  links: {
    github: string;
    zip: string | null;
    zip_release: string | null;
    release: string | null;
    releases: string;
    docs: string | null;
    demo: string | null;
    video: string | null;
    readme: string;
    issues: string | null;
    license_file: string | null;
    clone: string;
  };
  score: Score | null;
  trend: { gained: number; method: GrowthMethod; window: WindowKey } | null;
  trending: Record<WindowKey, TrendingWindow | null> | null;
  rank_prev: number | null;
  areas: AreaLabel[];
  gem: string | null;
  pinned: boolean;
  chart: [number, number][] | null;
  ai: AiAnalysis | null;
  readme_preview: { html: string; truncated: boolean; chars: number; path: string; fetched_at: string } | null;
  readme_preview_blocked: boolean;
  first_seen_at: string | null;
  renamed_from: string | null;
  readme: {
    path: string;
    original_path: string | null;
    length: number;
    sections: { install: ReadmeSection | null; usage: ReadmeSection | null; features: ReadmeSection | null } | null;
    videos: { type: 'youtube'; id: string; url: string }[];
    fetched_at: string;
  } | null;
}

export interface Library {
  generated_at: string;
  synced_at: string | null;
  oldest_fetched_at: string | null;
  last_sync: { mode: string; finished_at: string; token: boolean; totals: Record<string, number> } | null;
  stats: {
    repos: number;
    visible: number;
    synced: number;
    pending: number;
    deleted: number;
    archived: number;
    categories: number;
    by_tier: Record<TierKey, number>;
    with_contributors: number;
    radar_tracked: number;
    radar_published: number;
    tracked_total: number;
  };
  areas: AreaInfo[];
  automation: Automation;
  hub: Hub;
  area_lists: Record<string, { trending: HubCard[]; top_rated: HubCard[]; newest: HubCard[]; popular: HubCard[]; count: number }>;
  languages: { name: string; count: number }[];
  tiers: { key: TierKey; label: string; min: number }[];
  criteria: { key: string; label: string; max: number }[];
  site: SiteConfig;
  categories: Category[];
  repos: Repo[];
}

export interface AreaInfo { slug: string; name: string; en: string; icon: string; hue: number; description: string; count: number }

/** Thẻ repo trên trang Xu hướng (gồm cả repo radar chưa có trang riêng → p = null, link thẳng GitHub). */
export interface HubCard {
  i: string; gid: string | null; p: string | null; u: string; o: string; n: string; d: string; av: string;
  st: number; fk: number; l: string | null; lc: LicenseClass; ls: string;
  cr: string; lu: string | null; la: 'commit' | 'push'; c90: number | null; c90e: boolean;
  t1: number | null; t7: number | null; t30: number | null;
  q: number | null; qc: number | null; tr: TierKey | null;
  g: Record<WindowKey, { gained: number; delta: number; method: GrowthMethod; span_hours: number } | null>;
  ae: string[]; gem: string | null; gq: number | null; pin: boolean; an: boolean; og: 'curated' | 'radar'; ar: boolean; rp: number | null; why: string | null;
}

export interface Hub {
  computed_at: string;
  trending: Record<WindowKey, HubCard[]>;
  fastest: Record<WindowKey, HubCard[]>;
  new_rising: Record<'d7' | 'd30' | 'd90', HubCard[]>;
  windows: Record<WindowKey, { label: string; scored: number; with_growth: number; flagged: number; methods: Record<string, number> }>;
  /** Số repo có tín hiệu bất thường — không đưa vào danh sách nổi bật */
  flagged: number;
  top_rated: HubCard[];
  gems: HubCard[];
  active: HubCard[];
  popular: HubCard[];
  pinned: HubCard[];
  areas: (AreaInfo & { top: HubCard[] })[];
  snapshots: { first_at: string | null; ready_at: Record<WindowKey, string | null> };
}

export interface Automation {
  scheduler_enabled: boolean;
  timezone: string;
  last_data_sync_at: string | null;
  stale: boolean;
  stale_after_hours: number;
  ranking_computed_at: string;
  jobs: Record<string, { label: string; enabled: boolean; interval_hours: number; last_success_at: string | null; last_status: string | null }>;
  last_failures: { job: string; at: string; status: string }[];
  weights: Record<string, number>;
  components: { key: string; label: string }[];
  ref: Record<WindowKey, { rate: number; rel: number; forks: number }>;
  min_coverage: number;
  anomaly_damping: number;
  discovery: { radar_total: number; published: number; max_radar: number; topics: string[]; new_windows: { days: number; min_stars: number; pages: number }[]; gem_star_range: [number, number]; publish_min_stars: number };
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  url: string;
  locale: string;
  timezone: string;
  githubRepo: string;
  contactEmail: string;
}

/** Bản ghi gọn trong public/data/index.json (dùng cho tìm kiếm/bộ lọc phía trình duyệt). */
export interface CompactRepo {
  i: string; p: string | null; o: string; n: string;
  s: string; d: string;
  c: string[]; t: string[]; u: string[];
  l: string | null; st: number | null; fk: number | null; ct: number | null;
  sc: number | null; tr: TierKey | null;
  lc: LicenseClass; ls: string;
  pr: Pricing | null; df: Difficulty | null; pf: Platform[]; dp: Deploy[]; ak: ApiKey | null;
  lu: string | null; rl: string | null; rt: string | null;
  ar: boolean; ss: RepoStatus; v: boolean;
  ft: boolean; ap: number | null; av: string; cr: string | null; ad: string | null;
  an: boolean; fl: string[];
  b: (number | null)[] | null;
  /** nguồn: c = catalog biên tập, r = radar tự động */
  og: 'c' | 'r';
  t1: number | null; t7: number | null; t30: number | null;
  g1: number | null; g7: number | null; g30: number | null;
  /** phương pháp đo tăng trưởng 24h/7d/30d: s = snapshot, c = tạo trong kỳ, g = mẫu stargazer, - = chưa có */
  gm: string;
  qc: number | null; ae: string[]; gem: boolean; pin: boolean; la: 'commit' | 'push';
}

export interface CompactIndex {
  generated_at: string;
  synced_at: string | null;
  ranking_computed_at?: string;
  categories: Pick<Category, 'slug' | 'name' | 'short' | 'hue' | 'icon' | 'count'>[];
  areas: Pick<AreaInfo, 'slug' | 'name' | 'hue' | 'icon' | 'count'>[];
  languages: { name: string; count: number }[];
  repos: CompactRepo[];
}
