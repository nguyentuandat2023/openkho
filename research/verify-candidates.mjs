// Xác minh danh sách ứng viên qua GitHub API (không cần token).
// - Search API: lấy số liệu hàng loạt (nhiều repo trong một lượt gọi bằng bộ lọc repo:)
// - REST /repos: chỉ cho các repo không thấy trong kết quả search (phân biệt đổi tên / đã xóa)
// Kết quả: research/candidates-verified.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const UA = 'oss-library-research';
const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lines = fs.readFileSync(path.join(dir, 'candidates.txt'), 'utf8').split(/\r?\n/);
const cands = [];
for (const l of lines) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const [cat, repo] = t.split(/\s+/);
  cands.push({ cat, repo });
}
console.log('candidates:', cands.length);

async function search(q) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=100`, { headers });
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000;
      const wait = Math.max(5000, reset - Date.now() + 1500);
      console.log(`  rate-limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    const j = await r.json();
    if (!r.ok) throw new Error(`search ${r.status}: ${j.message}`);
    return j;
  }
  throw new Error('search failed after retries');
}

const pick = (r) => ({
  full_name: r.full_name,
  description: r.description,
  stars: r.stargazers_count,
  forks: r.forks_count,
  open_issues: r.open_issues_count,
  language: r.language,
  license: r.license ? r.license.spdx_id : null,
  license_name: r.license ? r.license.name : null,
  topics: r.topics || [],
  homepage: r.homepage || null,
  archived: r.archived,
  disabled: r.disabled,
  fork: r.fork,
  created_at: r.created_at,
  pushed_at: r.pushed_at,
  default_branch: r.default_branch,
  owner_type: r.owner?.type,
});

const found = new Map();
const BATCH = 35;
for (let i = 0; i < cands.length; i += BATCH) {
  const batch = cands.slice(i, i + BATCH);
  const q = batch.map((c) => `repo:${c.repo}`).join('+');
  const j = await search(q);
  for (const it of j.items || []) found.set(it.full_name.toLowerCase(), pick(it));
  console.log(`batch ${i / BATCH + 1}: ${j.items?.length ?? 0}/${batch.length} found${j.incomplete_results ? ' (incomplete!)' : ''}`);
  await sleep(6500);
}

const results = [];
const missing = [];
for (const c of cands) {
  const m = found.get(c.repo.toLowerCase());
  if (m) results.push({ ...c, status: 'ok', ...m });
  else missing.push(c);
}
console.log('missing from search:', missing.length);

for (const c of missing) {
  const r = await fetch(`https://api.github.com/repos/${c.repo}`, { headers });
  const remaining = r.headers.get('x-ratelimit-remaining');
  if (r.status === 404) {
    results.push({ ...c, status: 'not_found' });
    console.log(`  404  ${c.repo} (core remaining ${remaining})`);
  } else if (r.ok) {
    const j = await r.json();
    const renamed = j.full_name.toLowerCase() !== c.repo.toLowerCase();
    results.push({ ...c, status: renamed ? 'renamed' : 'ok', renamed_to: renamed ? j.full_name : undefined, ...pick(j) });
    console.log(`  ${renamed ? 'MOVED' : 'ok   '} ${c.repo}${renamed ? ' -> ' + j.full_name : ''} (core remaining ${remaining})`);
  } else {
    results.push({ ...c, status: `http_${r.status}` });
    console.log(`  ${r.status} ${c.repo}`);
  }
  await sleep(400);
}

fs.writeFileSync(path.join(dir, 'candidates-verified.json'), JSON.stringify({ verified_at: new Date().toISOString(), results }, null, 1));

// Bảng gọn để đọc
const days = (d) => (d ? Math.round((Date.now() - Date.parse(d)) / 86400000) : '-');
let cur = '';
for (const r of [...results].sort((a, b) => a.cat.localeCompare(b.cat) || (b.stars || 0) - (a.stars || 0))) {
  if (r.cat !== cur) { cur = r.cat; console.log(`\n## ${cur}`); }
  if (!r.full_name) { console.log(`  !! ${r.repo} ${r.status}`); continue; }
  console.log(`  ${r.full_name.padEnd(44)} ${String(r.stars).padStart(7)}★ ${String(r.forks).padStart(6)}f ${String(r.license).padEnd(12)} push:${String(days(r.pushed_at)).padStart(4)}d ${r.archived ? 'ARCHIVED ' : ''}${r.status === 'renamed' ? '(renamed from ' + r.repo + ')' : ''}`);
}
