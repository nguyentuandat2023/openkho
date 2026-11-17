// 1) Tìm lại các repo chưa xác minh được (bị giới hạn REST) bằng Search theo tên.
// 2) Khám phá các dự án mới nổi/được quan tâm nhiều theo chủ đề (GitHub Search API).
// Kết quả: research/discovered.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const headers = { 'User-Agent': 'oss-library-research', Accept: 'application/vnd.github+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verified = JSON.parse(fs.readFileSync(path.join(dir, 'candidates-verified.json'), 'utf8'));
const known = new Set(verified.results.filter((r) => r.full_name).map((r) => r.full_name.toLowerCase()));

async function search(q, per = 30) {
  for (let a = 0; a < 6; a++) {
    const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${per}`, { headers });
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000;
      await sleep(Math.max(5000, reset - Date.now() + 1500));
      continue;
    }
    const j = await r.json();
    await sleep(6500);
    if (!r.ok) { console.log('ERR', q, j.message); return []; }
    return j.items || [];
  }
  return [];
}
const days = (d) => Math.round((Date.now() - Date.parse(d)) / 86400000);
const row = (r) => `${r.full_name.padEnd(42)} ${String(r.stargazers_count).padStart(7)}★ ${String(r.license?.spdx_id).padEnd(11)} c:${r.created_at.slice(0, 7)} p:${String(days(r.pushed_at)).padStart(3)}d ${r.archived ? 'ARCH ' : ''}${(r.description || '').slice(0, 78)}`;

const out = { resolved: {}, discovered: {} };
const unresolved = {
  'Pixelorama/Pixelorama': 'Pixelorama in:name',
  'vendure-ecommerce/vendure': 'vendure in:name',
  'salesagility/SuiteCRM': 'SuiteCRM in:name',
  'calcom/cal.com': 'cal.com in:name',
  'freescout-helpdesk/freescout': 'freescout in:name',
  'facebook/react-native': 'react-native in:name',
  'prisma/prisma': 'prisma in:name',
  'f/awesome-chatgpt-prompts': 'awesome-chatgpt-prompts OR prompts.chat in:name',
  'anthropics/anthropic-cookbook': 'cookbook in:name user:anthropics',
  'kamranahmedse/developer-roadmap': 'developer-roadmap in:name',
  'linkstack/linkstack': 'linkstack in:name',
};
console.log('# Tìm lại repo chưa xác minh');
for (const [orig, q] of Object.entries(unresolved)) {
  const items = await search(q, 5);
  out.resolved[orig] = items.map((r) => ({ full_name: r.full_name, stars: r.stargazers_count }));
  console.log(`\n${orig}  ←  ${q}`);
  for (const r of items.slice(0, 3)) console.log('   ' + row(r));
}

const queries = [
  'created:>2025-06-01 stars:>15000',
  'created:>2025-10-01 stars:>4000',
  'topic:mcp stars:>3000 pushed:>2026-08-01',
  'topic:ai-agents stars:>8000 pushed:>2026-08-01',
  'topic:claude-code stars:>4000',
  'topic:text-to-speech stars:>3000 pushed:>2026-06-01',
  'topic:video-generation stars:>2500 pushed:>2026-06-01',
  'topic:image-generation stars:>6000 pushed:>2026-06-01',
  'topic:marketing stars:>1000 pushed:>2026-06-01',
  'topic:seo stars:>1500 pushed:>2026-06-01',
  'topic:social-media stars:>2000 pushed:>2026-06-01',
  'topic:email-marketing stars:>1000 pushed:>2026-06-01',
  'topic:vietnamese stars:>300',
  'topic:self-hosted stars:>20000 pushed:>2026-08-01',
  'topic:workflow-automation stars:>4000 pushed:>2026-08-01',
  'topic:low-code stars:>8000 pushed:>2026-08-01',
  'topic:crm stars:>2000 pushed:>2026-06-01',
  'topic:ecommerce stars:>4000 pushed:>2026-06-01',
  'topic:analytics stars:>10000 pushed:>2026-06-01',
  'topic:rag stars:>10000 pushed:>2026-07-01',
];
for (const q of queries) {
  const items = await search(q, 30);
  out.discovered[q] = items.map((r) => ({ full_name: r.full_name, stars: r.stargazers_count, license: r.license?.spdx_id, created_at: r.created_at, pushed_at: r.pushed_at, archived: r.archived, description: r.description, topics: r.topics }));
  const fresh = items.filter((r) => !known.has(r.full_name.toLowerCase()));
  console.log(`\n## ${q}  (${items.length} kết quả, ${fresh.length} chưa có trong danh sách)`);
  for (const r of fresh.slice(0, 18)) console.log('   ' + row(r));
}
fs.writeFileSync(path.join(dir, 'discovered.json'), JSON.stringify({ discovered_at: new Date().toISOString(), ...out }, null, 1));
