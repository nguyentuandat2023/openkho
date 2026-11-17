'use client';
// Lưu repo yêu thích + bộ sưu tập trong trình duyệt (localStorage). Không cần tài khoản.
// Có thể xuất/nhập file JSON và chia sẻ bộ sưu tập qua đường link.
import { useSyncExternalStore } from 'react';

export interface Collection {
  id: string;
  name: string;
  note?: string;
  repos: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FavState {
  v: 1;
  favorites: Record<string, { addedAt: string }>;
  collections: Collection[];
}

const KEY = 'openkho:favorites:v1';
const EMPTY: FavState = { v: 1, favorites: {}, collections: [] };
const listeners = new Set<() => void>();
let cache: FavState | null = null;
let cacheRaw: string | null = null;

function read(): FavState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cacheRaw && cache) return cache;
    cacheRaw = raw;
    const parsed = raw ? (JSON.parse(raw) as FavState) : EMPTY;
    cache = { v: 1, favorites: parsed.favorites || {}, collections: Array.isArray(parsed.collections) ? parsed.collections : [] };
  } catch {
    cache = cache || EMPTY;
  }
  return cache;
}

function write(next: FavState) {
  cache = next;
  try {
    cacheRaw = JSON.stringify(next);
    localStorage.setItem(KEY, cacheRaw);
  } catch {
    /* trình duyệt chặn lưu trữ: vẫn giữ trong bộ nhớ trang */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cacheRaw = null; cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

export function useFavorites(): FavState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

export const fav = {
  toggle(id: string) {
    const s = read();
    const favorites = { ...s.favorites };
    if (favorites[id]) delete favorites[id];
    else favorites[id] = { addedAt: now() };
    write({ ...s, favorites });
  },
  remove(id: string) {
    const s = read();
    const favorites = { ...s.favorites };
    delete favorites[id];
    write({ ...s, favorites, collections: s.collections.map((c) => ({ ...c, repos: c.repos.filter((r) => r !== id) })) });
  },
  createCollection(name: string, repos: string[] = [], note?: string) {
    const s = read();
    const c: Collection = { id: uid(), name: name.trim() || 'Bộ sưu tập mới', note, repos: [...new Set(repos)], createdAt: now(), updatedAt: now() };
    const favorites = { ...s.favorites };
    for (const r of c.repos) favorites[r] ||= { addedAt: now() };
    write({ ...s, favorites, collections: [...s.collections, c] });
    return c.id;
  },
  renameCollection(id: string, name: string) {
    const s = read();
    write({ ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name, updatedAt: now() } : c)) });
  },
  deleteCollection(id: string) {
    const s = read();
    write({ ...s, collections: s.collections.filter((c) => c.id !== id) });
  },
  toggleInCollection(id: string, repo: string) {
    const s = read();
    const favorites = { ...s.favorites };
    favorites[repo] ||= { addedAt: now() };
    write({
      ...s,
      favorites,
      collections: s.collections.map((c) => (c.id !== id ? c : {
        ...c,
        repos: c.repos.includes(repo) ? c.repos.filter((r) => r !== repo) : [...c.repos, repo],
        updatedAt: now(),
      })),
    });
  },
  exportJson(): string {
    return JSON.stringify({ app: 'openkho', exported_at: now(), ...read() }, null, 2);
  },
  importJson(text: string): { favorites: number; collections: number } {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.favorites) throw new Error('File không đúng định dạng xuất từ trang Yêu thích.');
    const s = read();
    const favorites = { ...s.favorites, ...data.favorites };
    const known = new Set(s.collections.map((c) => c.id));
    const incoming = (Array.isArray(data.collections) ? data.collections : []).filter((c: Collection) => c && c.name && Array.isArray(c.repos) && !known.has(c.id));
    write({ v: 1, favorites, collections: [...s.collections, ...incoming] });
    return { favorites: Object.keys(data.favorites).length, collections: incoming.length };
  },
};

/** Mã hóa bộ sưu tập thành chuỗi gọn để chia sẻ qua link (?share=...). */
export function encodeShare(name: string, repos: string[]): string {
  const json = JSON.stringify({ n: name, r: repos });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(token: string): { name: string; repos: string[] } | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const d = JSON.parse(json);
    if (!d || typeof d.n !== 'string' || !Array.isArray(d.r)) return null;
    const repos = d.r.filter((x: unknown) => typeof x === 'string' && /^[\w.-]+\/[\w.-]+$/.test(x)).slice(0, 200);
    return { name: d.n.slice(0, 120), repos };
  } catch {
    return null;
  }
}
