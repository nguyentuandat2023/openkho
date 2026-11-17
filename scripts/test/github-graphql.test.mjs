// Chế độ đồng bộ đầy đủ (có token) dùng GraphQL. Không thể gọi thật khi không có token, nên kiểm tra:
// 1) truy vấn hợp lệ theo schema công khai của GitHub (tải từ docs.github.com, lưu cache)
// 2) hàm chuẩn hóa xử lý đúng một phản hồi mẫu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema, parse, validate } from 'graphql';
import { buildBatchQuery, normalizeGraphql } from '../lib/github.mjs';
import { CACHE_DIR } from '../lib/config.mjs';

const SCHEMA_URL = 'https://docs.github.com/public/fpt/schema.docs.graphql';
const SCHEMA_FILE = path.join(CACHE_DIR, 'github-schema.graphql');

async function loadSchema() {
  if (!fs.existsSync(SCHEMA_FILE) || Date.now() - fs.statSync(SCHEMA_FILE).mtimeMs > 30 * 86400000) {
    const res = await fetch(SCHEMA_URL, { headers: { 'User-Agent': 'openkho-test' } });
    if (!res.ok) throw new Error(`Không tải được schema GitHub (${res.status})`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(SCHEMA_FILE, await res.text());
  }
  // assumeValid: bản thân schema công khai của GitHub có vài chỗ không nhất quán (vd. Project.id deprecated)
  // khiến graphql-js từ chối dựng schema; ta chỉ cần kiểm tra TRUY VẤN của mình hợp lệ.
  return buildSchema(fs.readFileSync(SCHEMA_FILE, 'utf8'), { assumeValidSDL: true, assumeValid: true });
}

test('truy vấn GraphQL theo lô hợp lệ với schema GitHub', async (t) => {
  let schema;
  try {
    schema = await loadSchema();
  } catch (err) {
    t.skip(`bỏ qua (không có mạng): ${err.message}`);
    return;
  }
  const { query } = buildBatchQuery(['n8n-io/n8n', 'ollama/ollama', 'Comfy-Org/ComfyUI']);
  const errors = validate(schema, parse(query));
  assert.deepEqual(errors.map((e) => e.message), []);
});

test('chuẩn hóa phản hồi GraphQL (repo đổi tên, release, prerelease, sao gần đây)', () => {
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86400000).toISOString();
  const node = {
    nameWithOwner: 'NewOrg/Tool', name: 'Tool', url: 'https://github.com/NewOrg/Tool', description: 'd', homepageUrl: '',
    owner: { login: 'NewOrg', avatarUrl: 'https://avatars.githubusercontent.com/u/1', __typename: 'Organization' },
    stargazerCount: 5000, forkCount: 300, watchers: { totalCount: 80 }, issues: { totalCount: 12 }, pullRequests: { totalCount: 4 },
    isArchived: false, isDisabled: false, isFork: false, isTemplate: false, isLocked: false, isMirror: false,
    hasIssuesEnabled: true, hasDiscussionsEnabled: false, hasWikiEnabled: true,
    createdAt: iso(900), updatedAt: iso(1), pushedAt: iso(1), diskUsage: 2048,
    primaryLanguage: { name: 'Go', color: '#00ADD8' },
    languages: { totalSize: 1000, edges: [{ size: 800, node: { name: 'Go', color: '#00ADD8' } }, { size: 200, node: { name: 'Shell', color: '#89e051' } }] },
    licenseInfo: { spdxId: 'MIT', name: 'MIT License', key: 'mit' },
    repositoryTopics: { nodes: [{ topic: { name: 'cli' } }] },
    openGraphImageUrl: 'https://repository-images.githubusercontent.com/1/abc', usesCustomOpenGraphImage: true,
    defaultBranchRef: { name: 'main', target: { committedDate: iso(1), history: { totalCount: 42 } } },
    latestRelease: { name: 'v2.0', tagName: 'v2.0', publishedAt: iso(20), url: 'https://github.com/NewOrg/Tool/releases/tag/v2.0', isPrerelease: false,
      releaseAssets: { totalCount: 2, nodes: [{ name: 'tool-win-x64.zip', size: 1000, downloadCount: 50, downloadUrl: 'https://github.com/x', contentType: 'application/zip' }] } },
    newestReleases: { totalCount: 30, nodes: [{ name: 'v2.1-rc1', tagName: 'v2.1-rc1', publishedAt: iso(2), url: 'https://github.com/NewOrg/Tool/releases/tag/v2.1-rc1', isPrerelease: true, isDraft: false }] },
    tags: { totalCount: 40, nodes: [{ name: 'v2.1-rc1' }] },
    recentStars: { edges: Array.from({ length: 100 }, (_, i) => ({ starredAt: new Date(now - i * 3600000).toISOString() })) },
    dockerfile: { __typename: 'Blob' }, compose: null, composeAlt: null,
  };
  const r = normalizeGraphql(node, 'oldorg/tool');
  assert.equal(r.renamed_from, 'oldorg/tool');
  assert.equal(r.meta.stars, 5000);
  assert.equal(r.meta.languages[0].share, 80);
  assert.equal(r.activity.commits_90d, 42);
  assert.equal(r.release.tag, 'v2.0');
  assert.equal(r.release.assets[0].download_count, 50);
  assert.equal(r.prerelease.tag, 'v2.1-rc1', 'bản thử nghiệm mới hơn bản ổn định');
  assert.equal(r.docker, true);
  assert.ok(r.stars_recent.per_day > 20 && r.stars_recent.per_day < 30, `per_day ${r.stars_recent.per_day}`);
});
