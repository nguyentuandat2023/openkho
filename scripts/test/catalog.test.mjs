import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, loadCategories, validate } from '../lib/catalog.mjs';

test('catalog thật hợp lệ: không trùng, không giá trị lạ, mỗi danh mục có repo', () => {
  const entries = loadCatalog();
  const cats = loadCategories();
  const { errors } = validate(entries, cats);
  assert.deepEqual(errors, []);
  for (const c of cats) assert.ok(entries.some((e) => e.category === c.slug || (e.also || []).includes(c.slug)), `danh mục ${c.slug} trống`);
  assert.ok(entries.length >= 200, `chỉ có ${entries.length} repo`);
});

test('validate phát hiện lỗi thường gặp', () => {
  const cats = [{ slug: 'ai-ml', name: 'AI' }];
  const { errors } = validate([
    { repo: 'bad repo name', _file: 'ai-ml.yaml', _index: 0, category: 'ai-ml' },
    { repo: 'a/b', difficulty: 'super-easy', _file: 'ai-ml.yaml', _index: 1, category: 'ai-ml' },
    { repo: 'A/B', _file: 'ai-ml.yaml', _index: 2, category: 'ai-ml' },
    { repo: 'c/d', also: ['khong-co'], applicability: 9, docs: 'http://x', _file: 'ai-ml.yaml', _index: 3, category: 'ai-ml' },
  ], cats);
  const text = errors.join('\n');
  assert.match(text, /owner\/ten-repo/);
  assert.match(text, /difficulty không hợp lệ/);
  assert.match(text, /trùng/);
  assert.match(text, /danh mục phụ không tồn tại/);
  assert.match(text, /applicability/);
  assert.match(text, /https:\/\//);
});
