// Job "ai_analyze" (TÙY CHỌN, mặc định tắt): tóm tắt README bằng Claude cho repo radar đã có trang chi tiết.
// Chỉ chạy khi ai.enabled = true VÀ có ANTHROPIC_API_KEY. Mỗi repo chỉ phân tích lại khi README/mô tả thay đổi.
import Anthropic from '@anthropic-ai/sdk';
import { request } from '../http.mjs';
import { loadRadar, loadPublished, loadModeration, isExcluded } from '../radar.mjs';
import { aiAvailable, createClient, analyzeRepo, saveAnalysis, loadAnalysis, inputHash } from '../ai.mjs';
import { checkAbort } from './common.mjs';

async function fetchReadmeText(full, branch, path) {
  for (const p of [path, 'README.md', 'readme.md', 'README.rst', 'README'].filter(Boolean)) {
    const res = await request(`https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch || 'HEAD')}/${encodeURIComponent(p)}`, { api: false, retries: 2 });
    if (res.ok) return { text: res.text(), path: p };
  }
  return null;
}

export default async function aiAnalyze(ctx, deps = {}) {
  const { settings, log, signal } = ctx;
  const avail = deps.client ? { ok: true } : aiAvailable(settings);
  if (!avail.ok) {
    log(`Bỏ qua: ${avail.reason}`);
    return { stats: { skipped: true, reason: avail.reason }, changed: false, summary: `Bỏ qua — ${avail.reason}` };
  }
  const client = deps.client || createClient();
  const radar = deps.radar || loadRadar();
  const published = deps.published || loadPublished();
  const mod = loadModeration();
  const gids = Object.keys(published.repos).filter((g) => radar.repos[g] && !isExcluded(mod, g, radar.repos[g].full_name));
  const stats = { candidates: gids.length, analyzed: 0, cached: 0, rejected: 0, refused: 0, errors: 0, input_tokens: 0, output_tokens: 0 };
  for (const gid of gids) {
    if (stats.analyzed + stats.rejected + stats.refused >= settings.ai.max_per_run) break;
    checkAbort(signal);
    const r = radar.repos[gid];
    const rd = deps.readme ? deps.readme(gid) : await fetchReadmeText(r.full_name, r.meta?.default_branch, r.readme?.path);
    if (!rd || rd.text.length < 200) continue;
    const truncated = rd.text.length > settings.ai.readme_max_chars;
    const text = truncated ? rd.text.slice(0, settings.ai.readme_max_chars) : rd.text;
    const prev = loadAnalysis(gid);
    if (prev && prev.input?.hash === inputHash(settings.ai.model, r.meta?.description, text) && prev.status !== 'error') { stats.cached++; continue; }
    try {
      const rec = await analyzeRepo(client, { gid, full_name: r.full_name, description: r.meta?.description, readme: text, readme_path: rd.path, truncated }, settings);
      saveAnalysis(gid, rec);
      stats.input_tokens += rec.usage?.input_tokens || 0;
      stats.output_tokens += rec.usage?.output_tokens || 0;
      if (rec.status === 'ok') stats.analyzed++;
      else if (rec.status === 'refused') stats.refused++;
      else stats.rejected++;
      log(`  ${r.full_name}: ${rec.status}${rec.verification ? ` (giữ ${rec.verification.kept}/${rec.verification.claims} nhận định có trích dẫn)` : ''}`);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('ANTHROPIC_API_KEY không hợp lệ (401) — dừng phân tích AI');
      if (err instanceof Anthropic.RateLimitError) { log('  Hết hạn mức Claude API → dừng lượt này, chạy tiếp lần sau'); break; }
      stats.errors++;
      log(`  ! ${r.full_name}: ${err instanceof Anthropic.APIError ? `API ${err.status}` : ''} ${err.message.slice(0, 160)}`);
    }
  }
  log(`AI: phân tích ${stats.analyzed} · bị loại khi đối chiếu ${stats.rejected} · từ chối ${stats.refused} · dùng lại ${stats.cached} · lỗi ${stats.errors} · token vào/ra ${stats.input_tokens}/${stats.output_tokens}`);
  return { stats, changed: stats.analyzed + stats.rejected > 0, summary: `${stats.analyzed} phân tích mới, ${stats.cached} dùng lại` };
}
