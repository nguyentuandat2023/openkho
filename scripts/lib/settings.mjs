// Cấu hình hệ thống tự động (lịch chạy, khám phá, xu hướng, xuất bản, lưu trữ, AI).
// Lưu tại data/settings.json (chỉnh từ trang quản trị hoặc sửa tay). Giá trị thiếu lấy theo DEFAULTS,
// giá trị sai kiểu/ngoài khoảng bị bỏ qua và ghi vào danh sách cảnh báo — không làm hỏng job đang chạy.
import path from 'node:path';
import { DATA_DIR, readJson, writeJson } from './config.mjs';

export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const JOB_NAMES = ['discover', 'refresh', 'rank', 'reevaluate', 'cleanup', 'ai_analyze'];

export const JOB_LABELS = {
  discover: 'Khám phá repo mới',
  refresh: 'Cập nhật số liệu ưu tiên',
  rank: 'Tính lại xếp hạng',
  reevaluate: 'Đánh giá lại chất lượng & phân loại',
  cleanup: 'Dọn dữ liệu & cache',
  ai_analyze: 'Phân tích README bằng AI',
};

export const TRENDING_COMPONENTS = [
  { key: 'star_growth', label: 'Tăng trưởng sao' },
  { key: 'activity', label: 'Hoạt động phát triển' },
  { key: 'community', label: 'Cộng đồng' },
  { key: 'momentum', label: 'Độ mới & đà tăng' },
  { key: 'docs', label: 'Tài liệu' },
  { key: 'maintenance', label: 'Bảo trì' },
];

export const DEFAULTS = {
  version: 1,
  timezone: 'Asia/Ho_Chi_Minh',
  scheduler: {
    enabled: true,
    max_job_minutes: 45,
    retry: { attempts: 3, base_delay_seconds: 30 },
    failure_backoff_minutes: 15,
    rank_after_data_jobs: true,
    site_rebuild: 'full', // off | data | full — daemon cục bộ dựng lại website sau job làm thay đổi dữ liệu
    jobs: {
      discover: { enabled: true, interval_hours: 3 },
      refresh: { enabled: true, interval_hours: 6 },
      rank: { enabled: true, interval_hours: 24 },
      reevaluate: { enabled: true, interval_hours: 168 },
      cleanup: { enabled: true, interval_hours: 720 },
      ai_analyze: { enabled: false, interval_hours: 168 },
    },
  },
  discovery: {
    max_radar_repos: 3000,
    max_queries_per_run: 30,
    new_windows: [
      { days: 7, min_stars: 30, pages: 1 },
      { days: 30, min_stars: 100, pages: 2 },
      { days: 90, min_stars: 300, pages: 2 },
    ],
    popular_min_stars: 20000,
    popular_pages: 2,
    young_active: { max_age_days: 365, min_stars: 500, pushed_within_days: 3, pages: 1 },
    topics: [
      'llm', 'ai-agents', 'agents', 'generative-ai', 'rag', 'mcp', 'machine-learning', 'deep-learning',
      'automation', 'workflow-automation', 'developer-tools', 'cli', 'nextjs', 'react', 'self-hosted',
      'devops', 'kubernetes', 'database', 'security', 'data-science', 'flutter', 'ui-components', 'api', 'productivity',
    ],
    topic_min_stars: 500,
    topic_pushed_within_days: 60,
    gem_star_range: [50, 3000],
    gem_pushed_within_days: 30,
    gem_max_age_days: 730,
    exclude_forks: true,
    exclude_archived: true,
    readme_fetch_per_run: 60,
    stargazer_samples_per_run: 12,
    commit_feeds_per_run: 60,
  },
  trending: {
    weights: { star_growth: 35, activity: 20, community: 15, momentum: 15, docs: 10, maintenance: 5 },
    min_coverage: 0.6,
    anomaly_damping: 0.5,
  },
  publish: {
    radar_detail_min_stars: 200,
    radar_detail_max_pages: 600,
    readme_min_chars: 1500,
    radar_index_without_summary: false,
  },
  retention: {
    recent_snapshot_hours: 60,
    daily_snapshot_days: 400,
    radar_unseen_days: 45,
    job_history: 300,
    score_history_days: 400,
    job_log_days: 30,
  },
  ai: {
    enabled: false,
    model: 'claude-opus-5-5',
    effort: 'medium',
    max_per_run: 15,
    readme_max_chars: 24000,
    min_verified_ratio: 0.5,
  },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Gộp giá trị người dùng vào mặc định, giữ đúng kiểu dữ liệu của mặc định. */
function merge(def, val, at, warnings) {
  if (val === undefined) return structuredClone(def);
  if (isObj(def)) {
    if (!isObj(val)) { warnings.push(`${at}: cần là object`); return structuredClone(def); }
    const out = {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], val[k], `${at}.${k}`, warnings);
    for (const k of Object.keys(val)) if (!(k in def)) warnings.push(`${at}.${k}: khóa không được hỗ trợ (bỏ qua)`);
    return out;
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(val)) { warnings.push(`${at}: cần là danh sách`); return structuredClone(def); }
    return structuredClone(val);
  }
  if (typeof def !== typeof val) { warnings.push(`${at}: cần kiểu ${typeof def}`); return def; }
  return val;
}

const RANGES = [
  ['scheduler.max_job_minutes', 5, 240],
  ['scheduler.retry.attempts', 1, 6],
  ['scheduler.retry.base_delay_seconds', 5, 600],
  ['scheduler.failure_backoff_minutes', 1, 720],
  ['discovery.max_radar_repos', 50, 5000],
  ['discovery.max_queries_per_run', 1, 60],
  ['discovery.popular_min_stars', 1000, 500000],
  ['discovery.popular_pages', 0, 10],
  ['discovery.topic_min_stars', 10, 100000],
  ['discovery.readme_fetch_per_run', 0, 300],
  ['discovery.stargazer_samples_per_run', 0, 300],
  ['discovery.commit_feeds_per_run', 0, 500],
  ['trending.min_coverage', 0.3, 1],
  ['trending.anomaly_damping', 0, 1],
  ['publish.radar_detail_min_stars', 10, 100000],
  ['publish.radar_detail_max_pages', 0, 5000],
  ['publish.readme_min_chars', 0, 20000],
  ['retention.recent_snapshot_hours', 30, 240],
  ['retention.daily_snapshot_days', 35, 2000],
  ['retention.radar_unseen_days', 3, 365],
  ['retention.job_history', 20, 5000],
  ['retention.score_history_days', 7, 2000],
  ['retention.job_log_days', 1, 365],
  ['ai.max_per_run', 0, 200],
  ['ai.readme_max_chars', 2000, 200000],
  ['ai.min_verified_ratio', 0, 1],
];

function getAt(obj, p) { return p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setAt(obj, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = v; }

/** Kiểm tra + chuẩn hóa. Trả về { settings, warnings }. */
export function normalizeSettings(raw) {
  const warnings = [];
  const s = merge(DEFAULTS, raw || {}, 'settings', warnings);
  for (const [p, min, max] of RANGES) {
    const v = getAt(s, p);
    if (!Number.isFinite(v) || v < min || v > max) {
      warnings.push(`${p}=${v} ngoài khoảng ${min}–${max} → dùng mặc định ${getAt(DEFAULTS, p)}`);
      setAt(s, p, getAt(DEFAULTS, p));
    }
  }
  for (const name of JOB_NAMES) {
    const j = s.scheduler.jobs[name];
    if (!Number.isFinite(j.interval_hours) || j.interval_hours < 0.25 || j.interval_hours > 24 * 90) {
      warnings.push(`scheduler.jobs.${name}.interval_hours=${j.interval_hours} không hợp lệ (0,25–2160 giờ)`);
      j.interval_hours = DEFAULTS.scheduler.jobs[name].interval_hours;
    }
  }
  if (!['off', 'data', 'full'].includes(s.scheduler.site_rebuild)) s.scheduler.site_rebuild = 'full';
  if (!['low', 'medium', 'high'].includes(s.ai.effort)) s.ai.effort = 'medium';
  if (typeof s.ai.model !== 'string' || !/^claude-[a-z0-9.-]+$/.test(s.ai.model)) s.ai.model = DEFAULTS.ai.model;
  // Trọng số xu hướng: không âm, tổng được chuẩn hóa về 100 khi tính (ghi lại cảnh báo nếu tổng khác 100)
  const w = s.trending.weights;
  for (const c of TRENDING_COMPONENTS) if (!Number.isFinite(w[c.key]) || w[c.key] < 0 || w[c.key] > 100) {
    warnings.push(`trending.weights.${c.key} không hợp lệ → ${DEFAULTS.trending.weights[c.key]}`);
    w[c.key] = DEFAULTS.trending.weights[c.key];
  }
  const sum = TRENDING_COMPONENTS.reduce((a, c) => a + w[c.key], 0);
  if (sum <= 0) { warnings.push('Tổng trọng số = 0 → dùng mặc định'); s.trending.weights = { ...DEFAULTS.trending.weights }; }
  else if (Math.abs(sum - 100) > 0.01) warnings.push(`Tổng trọng số xu hướng là ${sum} (sẽ được quy về 100 khi tính)`);
  s.discovery.topics = [...new Set(s.discovery.topics.map((t) => String(t).toLowerCase().trim()).filter((t) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)))];
  const gr = s.discovery.gem_star_range;
  if (!Array.isArray(gr) || gr.length !== 2 || !(gr[0] >= 1 && gr[1] > gr[0])) s.discovery.gem_star_range = [...DEFAULTS.discovery.gem_star_range];
  s.discovery.new_windows = s.discovery.new_windows
    .filter((x) => isObj(x) && x.days >= 1 && x.days <= 365 && x.min_stars >= 1 && x.pages >= 0 && x.pages <= 10)
    .slice(0, 6);
  if (!s.discovery.new_windows.length) s.discovery.new_windows = structuredClone(DEFAULTS.discovery.new_windows);
  return { settings: s, warnings };
}

/** Trọng số đã quy về tổng 100. */
export function normalizedWeights(settings) {
  const w = settings.trending.weights;
  const sum = TRENDING_COMPONENTS.reduce((a, c) => a + w[c.key], 0) || 1;
  return Object.fromEntries(TRENDING_COMPONENTS.map((c) => [c.key, (w[c.key] / sum) * 100]));
}

export function loadSettings() {
  return normalizeSettings(readJson(SETTINGS_FILE, {})).settings;
}

export function loadSettingsWithWarnings() {
  return normalizeSettings(readJson(SETTINGS_FILE, {}));
}

/** Ghi cấu hình mới (đã chuẩn hóa). Trả về { settings, warnings }. */
export function saveSettings(raw) {
  const res = normalizeSettings(raw);
  writeJson(SETTINGS_FILE, res.settings);
  return res;
}

/** Áp một bản vá (patch) lên cấu hình hiện tại. */
export function patchSettings(patch) {
  const cur = loadSettings();
  const deepPatch = (base, p) => {
    if (!isObj(p)) return p;
    const out = isObj(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(p)) out[k] = isObj(v) && isObj(base?.[k]) ? deepPatch(base[k], v) : v;
    return out;
  };
  return saveSettings(deepPatch(cur, patch));
}
