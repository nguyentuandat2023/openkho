// HTTP client cho GitHub: thử lại khi lỗi mạng/5xx, tôn trọng giới hạn tốc độ (primary +
// secondary rate limit), cache ETag để các lần đồng bộ sau gần như không tốn lượt gọi API.
import path from 'node:path';
import { CACHE_DIR, githubToken, readJson, writeJson, sleep } from './config.mjs';

const UA = 'openkho-sync/1.0 (+https://github.com)';
const ETAG_FILE = path.join(CACHE_DIR, 'etags.json');

export class RateLimitError extends Error {
  constructor(resource, resetAt) {
    super(`Hết hạn mức GitHub API (${resource}) – mở lại lúc ${new Date(resetAt).toLocaleString('vi-VN')}`);
    this.resource = resource;
    this.resetAt = resetAt;
  }
}

/** Trạng thái hạn mức theo từng nhóm tài nguyên (core, search, graphql). */
export const rateState = {};

let etags = null;
function etagStore() {
  if (!etags) etags = readJson(ETAG_FILE, {});
  return etags;
}
export function saveEtags() {
  if (etags) writeJson(ETAG_FILE, etags, false);
}

function trackRate(res) {
  const resource = res.headers.get('x-ratelimit-resource');
  if (!resource) return;
  rateState[resource] = {
    limit: Number(res.headers.get('x-ratelimit-limit')),
    remaining: Number(res.headers.get('x-ratelimit-remaining')),
    reset: Number(res.headers.get('x-ratelimit-reset')) * 1000,
  };
}

/**
 * Gọi HTTP có kiểm soát.
 * opts: method, headers, body, api (thêm header GitHub + token), etagKey (bật cache ETag),
 *       redirect, maxWaitMs (chờ tối đa khi hết hạn mức, mặc định 70 giây), retries
 * Trả về { status, ok, headers, notModified, json(), text(), url }
 */
export async function request(url, opts = {}) {
  const {
    method = 'GET', body, api = url.startsWith('https://api.github.com'), etagKey, redirect = 'follow',
    maxWaitMs = 70_000, retries = 4, accept,
  } = opts;
  const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
  if (api) {
    headers.Accept = accept || 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    const token = githubToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (accept) headers.Accept = accept;
  const store = etagKey ? etagStore() : null;
  if (store && store[etagKey] && !opts.force) headers['If-None-Match'] = store[etagKey];

  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(url, { method, headers, body, redirect, signal: AbortSignal.timeout(45_000) });
    } catch (err) {
      if (attempt++ < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Lỗi mạng khi gọi ${url}: ${err.cause?.code || err.message}`);
    }
    if (api) trackRate(res);

    if (res.status === 304) return wrap(res, url, null, true);

    if ((res.status === 403 || res.status === 429) && api) {
      const text = await res.text();
      const remaining = res.headers.get('x-ratelimit-remaining');
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      const isSecondary = /secondary rate limit|abuse/i.test(text) || retryAfter > 0;
      if (remaining === '0' && !isSecondary) {
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
        const wait = reset - Date.now() + 1500;
        const resource = res.headers.get('x-ratelimit-resource') || 'core';
        if (wait <= maxWaitMs && attempt++ < retries) {
          await sleep(Math.max(wait, 1000));
          continue;
        }
        throw new RateLimitError(resource, reset);
      }
      if (isSecondary && attempt++ < retries) {
        await sleep(Math.min((retryAfter || 60) * 1000, 120_000));
        continue;
      }
      return wrap(res, url, text);
    }
    if (res.status >= 500 && attempt++ < retries) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 && attempt++ < retries) {
      // github.com (không phải API) giới hạn tốc độ → chờ rồi thử lại
      await sleep(Number(res.headers.get('retry-after') || 30) * 1000);
      continue;
    }
    const text = method === 'HEAD' ? '' : await res.text();
    if (store && res.ok) {
      const tag = res.headers.get('etag');
      if (tag) store[etagKey] = tag;
    }
    return wrap(res, url, text);
  }
}

function wrap(res, url, text, notModified = false) {
  return {
    status: res.status,
    ok: res.ok,
    notModified,
    headers: res.headers,
    url: res.url || url,
    text: () => text ?? '',
    json: () => (text ? JSON.parse(text) : null),
  };
}

/** Lượt gọi còn lại của một nhóm tài nguyên (gọi /rate_limit – không tốn lượt). */
export async function fetchRateLimit() {
  const r = await request('https://api.github.com/rate_limit', { retries: 1 });
  if (!r.ok) return null;
  const j = r.json();
  for (const [k, v] of Object.entries(j.resources || {})) rateState[k] = { limit: v.limit, remaining: v.remaining, reset: v.reset * 1000 };
  return j.resources;
}

/** Đếm số trang từ header Link (dùng cho per_page=1 → tổng số phần tử). */
export function countFromLink(link, fallbackLen) {
  if (!link) return fallbackLen;
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : fallbackLen;
}
