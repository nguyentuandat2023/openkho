const headers = { 'User-Agent': 'oss-library-research', Accept: 'application/vnd.github+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qs = ['user:calcom', 'OpenKey in:name vietnamese', 'EVKey in:name', 'user:pocketbase', 'user:FlowiseAI', 'unikey OR "bo go tieng viet" in:name,description stars:>200'];
for (const q of qs) {
  const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`, { headers });
  const j = await r.json();
  console.log(`\n## ${q} (${r.status})`);
  for (const it of j.items || []) console.log(`  ${it.full_name.padEnd(36)} ${String(it.stargazers_count).padStart(7)}★ ${String(it.license?.spdx_id).padEnd(12)} ${it.archived ? 'ARCHIVED' : '        '} push:${it.pushed_at.slice(0, 10)} ${(it.description || '').slice(0, 70)}`);
  await sleep(6500);
}
const core = await fetch('https://api.github.com/rate_limit', { headers }).then((r) => r.json());
console.log('\ncore remaining', core.resources.core.remaining, 'reset at', new Date(core.resources.core.reset * 1000).toISOString());
