// Tra cứu một repo (để thêm vào thư viện), gợi ý danh mục theo topic, và khám phá ứng viên mới qua GitHub Search API.
import { request, rateState } from './http.mjs';
import { loadCatalog } from './catalog.mjs';
import { readJson, writeJson, CANDIDATES_FILE } from './config.mjs';

const API = 'https://api.github.com';

/** Chấp nhận "owner/repo", link github.com/owner/repo(...), hoặc link .git */
export function parseRepoInput(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/i) || s.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

const TOPIC_MAP = {
  'ai-agents': ['agent', 'agents', 'ai-agent', 'ai-agents', 'autonomous-agents', 'multi-agent', 'agentic', 'browser-automation', 'coding-agent'],
  'ai-automation': ['workflow', 'workflow-automation', 'automation', 'n8n', 'zapier', 'ipaas', 'rag', 'llmops', 'orchestration'],
  'ai-video-image': ['stable-diffusion', 'image-generation', 'video-generation', 'comfyui', 'diffusion', 'text-to-image', 'text-to-video', 'upscaling', 'image-editing'],
  'ai-audio': ['tts', 'text-to-speech', 'speech-to-text', 'asr', 'whisper', 'voice', 'voice-cloning', 'audio', 'speech', 'music-generation'],
  'chatbot-llm': ['llm', 'chatbot', 'chatgpt', 'ollama', 'local-llm', 'openai', 'gpt', 'llama', 'chat', 'inference'],
  'mcp-ai-tools': ['mcp', 'mcp-server', 'model-context-protocol', 'claude-code', 'agent-skills', 'claude', 'cursor'],
  'ai-marketing': ['marketing', 'social-media', 'content-generation', 'short-video', 'youtube-shorts', 'tiktok', 'copywriting', 'web-scraping'],
  'marketing-seo': ['seo', 'web-analytics', 'analytics', 'email-marketing', 'newsletter', 'marketing-automation', 'surveys', 'link-shortener'],
  'web-dev': ['react', 'nextjs', 'website', 'cms', 'static-site-generator', 'tailwindcss', 'frontend', 'web', 'website-builder'],
  'no-code': ['no-code', 'low-code', 'nocode', 'lowcode', 'airtable-alternative', 'internal-tools', 'app-builder'],
  'data-bi': ['bi', 'business-intelligence', 'data-visualization', 'dashboard', 'sql', 'data-engineering', 'etl', 'data-analysis', 'dataframe'],
  productivity: ['productivity', 'notes', 'note-taking', 'pdf', 'project-management', 'knowledge-base', 'windows', 'utilities'],
  'video-media': ['video', 'video-editing', 'video-editor', 'ffmpeg', 'streaming', 'subtitles', 'media', 'livestream', 'screen-recorder'],
  design: ['design', 'figma', 'graphics', 'svg', 'icons', '3d', 'drawing', 'whiteboard', 'diagrams', 'photo-editing'],
  ecommerce: ['ecommerce', 'e-commerce', 'shop', 'shopify', 'payments', 'affiliate', 'headless-commerce', 'marketplace'],
  'crm-sales': ['crm', 'erp', 'helpdesk', 'customer-support', 'sales', 'e-signature', 'scheduling', 'invoicing'],
  'self-hosted': ['self-hosted', 'selfhosted', 'homelab', 'docker-compose', 'home-server', 'nas', 'paas'],
  'dev-tools': ['developer-tools', 'cli', 'editor', 'ide', 'terminal', 'devtools', 'api-client', 'package-manager'],
  'database-backend': ['database', 'backend', 'api', 'orm', 'vector-database', 'postgres', 'postgresql', 'baas', 'search-engine'],
  learning: ['awesome', 'awesome-list', 'tutorial', 'course', 'learning', 'education', 'book', 'roadmap', 'prompts'],
  'ai-ml': ['machine-learning', 'deep-learning', 'pytorch', 'tensorflow', 'computer-vision', 'nlp', 'ocr', 'fine-tuning', 'ai'],
};

export function suggestCategories(topics = [], description = '') {
  const text = `${topics.join(' ')} ${description || ''}`.toLowerCase();
  const scores = Object.entries(TOPIC_MAP).map(([slug, words]) => [slug, words.reduce((s, w) => s + (topics.includes(w) ? 3 : text.includes(w) ? 1 : 0), 0)]);
  return scores.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([slug]) => slug).slice(0, 3);
}

function pick(r) {
  return {
    full_name: r.full_name, description: r.description, stars: r.stargazers_count, forks: r.forks_count, language: r.language,
    license: r.license?.spdx_id || null, topics: r.topics || [], homepage: r.homepage || null, archived: r.archived,
    created_at: r.created_at, pushed_at: r.pushed_at, html_url: r.html_url, avatar_url: r.owner?.avatar_url,
  };
}

/** Kiểm tra repo có thật trên GitHub: REST (theo dõi đổi tên); nếu hết hạn mức REST thì dùng Search API. */
export async function lookupRepo(input) {
  const id = parseRepoInput(input);
  if (!id) return { ok: false, error: 'Nhập dạng owner/ten-repo hoặc dán link https://github.com/owner/ten-repo' };
  const inCatalog = (name) => loadCatalog().find((e) => e.repo.toLowerCase() === name.toLowerCase())?.repo || null;
  const remaining = rateState.core?.remaining;
  if (remaining === undefined || remaining > 0) {
    const res = await request(`${API}/repos/${id}`, { maxWaitMs: 0, retries: 1 }).catch(() => null);
    if (res?.status === 404) return { ok: false, error: `Không tìm thấy ${id} trên GitHub (có thể đã bị xóa hoặc là repo riêng tư).` };
    if (res?.ok) {
      const r = pick(res.json());
      return { ok: true, repo: r, renamed: r.full_name.toLowerCase() !== id.toLowerCase(), exists: inCatalog(r.full_name), suggest: suggestCategories(r.topics, r.description) };
    }
  }
  const s = await request(`${API}/search/repositories?q=repo:${id}`, { maxWaitMs: 15_000 });
  const it = s.ok ? s.json().items?.[0] : null;
  if (!it) return { ok: false, error: `Chưa xác minh được ${id}: không có trong kết quả tìm kiếm (có thể đã đổi tên). Thử lại sau khi hạn mức GitHub API được làm mới.` };
  const r = pick(it);
  return { ok: true, repo: r, renamed: false, exists: inCatalog(r.full_name), suggest: suggestCategories(r.topics, r.description) };
}

export const DISCOVERY_PRESETS = [
  { label: 'Mới nổi 6 tháng qua', q: `created:>${new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10)} stars:>3000` },
  { label: 'AI marketing', q: 'topic:marketing stars:>800' },
  { label: 'SEO', q: 'topic:seo stars:>800' },
  { label: 'Mạng xã hội', q: 'topic:social-media stars:>800' },
  { label: 'Video AI', q: 'topic:video-generation stars:>1500' },
  { label: 'Giọng nói / TTS', q: 'topic:text-to-speech stars:>1500' },
  { label: 'MCP server', q: 'topic:mcp-server stars:>1500' },
  { label: 'AI agent', q: 'topic:ai-agents stars:>5000' },
  { label: 'Tự động hóa', q: 'topic:workflow-automation stars:>2000' },
  { label: 'Tự host', q: 'topic:self-hosted stars:>8000' },
  { label: 'CRM', q: 'topic:crm stars:>1000' },
  { label: 'Thương mại điện tử', q: 'topic:ecommerce stars:>2000' },
  { label: 'Tiếng Việt', q: 'topic:vietnamese stars:>100' },
];

/** Tìm ứng viên mới chưa có trong thư viện; lưu vào data/candidates.json (không tự thêm vào thư viện). */
export async function discover(query, { perPage = 50 } = {}) {
  const known = new Set(loadCatalog().map((e) => e.repo.toLowerCase()));
  const store = readJson(CANDIDATES_FILE, { updated_at: null, dismissed: [], items: [] });
  const dismissed = new Set((store.dismissed || []).map((x) => x.toLowerCase()));
  const res = await request(`${API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`, { maxWaitMs: 65_000 });
  if (!res.ok) throw new Error(`GitHub Search lỗi ${res.status}: ${res.text().slice(0, 120)}`);
  const found = (res.json().items || []).map(pick).filter((r) => !known.has(r.full_name.toLowerCase()) && !dismissed.has(r.full_name.toLowerCase()) && !r.archived);
  const byId = new Map((store.items || []).map((x) => [x.full_name.toLowerCase(), x]));
  const now = new Date().toISOString();
  for (const r of found) byId.set(r.full_name.toLowerCase(), { ...r, query, found_at: byId.get(r.full_name.toLowerCase())?.found_at || now, suggest: suggestCategories(r.topics, r.description) });
  const items = [...byId.values()].filter((x) => !known.has(x.full_name.toLowerCase())).sort((a, b) => b.stars - a.stars).slice(0, 500);
  writeJson(CANDIDATES_FILE, { updated_at: now, dismissed: store.dismissed || [], items });
  return found.map((r) => ({ ...r, suggest: suggestCategories(r.topics, r.description) }));
}

export function dismissCandidate(fullName) {
  const store = readJson(CANDIDATES_FILE, { updated_at: null, dismissed: [], items: [] });
  store.dismissed = [...new Set([...(store.dismissed || []), fullName])];
  store.items = (store.items || []).filter((x) => x.full_name.toLowerCase() !== fullName.toLowerCase());
  writeJson(CANDIDATES_FILE, store);
}
