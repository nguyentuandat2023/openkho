'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FolderPlus, Link2, Pencil, Trash2, Upload } from 'lucide-react';
import type { CompactIndex, CompactRepo } from '@/lib/types';
import { asset } from '@/lib/site';
import { decodeShare, encodeShare, fav, useFavorites } from '@/lib/favorites';
import RepoRow, { type CatLite } from './RepoRow';

export default function FavoritesView() {
  const state = useFavorites();
  const [index, setIndex] = useState<CompactIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'saved' | 'collections'>('saved');
  const [shared, setShared] = useState<{ name: string; repos: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(asset('/data/index.json'))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setIndex)
      .catch((e) => setError(`Không tải được dữ liệu thư viện (${e.message}).`));
    const token = new URLSearchParams(window.location.search).get('share');
    if (token) setShared(decodeShare(token));
  }, []);

  const byId = useMemo(() => new Map((index?.repos || []).map((r) => [r.i.toLowerCase(), r])), [index]);
  const cats: Record<string, CatLite> = useMemo(() => Object.fromEntries((index?.categories || []).map((c) => [c.slug, c])), [index]);
  const savedIds = Object.entries(state.favorites).sort((a, b) => b[1].addedAt.localeCompare(a[1].addedAt)).map(([id]) => id);
  const find = (id: string) => byId.get(id.toLowerCase());

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const exportFile = () => {
    const blob = new Blob([fav.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `openkho-yeu-thich-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const res = fav.importJson(await file.text());
      flash(`Đã nhập ${res.favorites} dự án và ${res.collections} bộ sưu tập.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'File không hợp lệ.');
    }
  };

  const share = async (name: string, repos: string[]) => {
    const url = `${window.location.origin}${window.location.pathname}?share=${encodeShare(name, repos)}`;
    try { await navigator.clipboard.writeText(url); flash('Đã sao chép link chia sẻ. Người nhận mở link sẽ thấy danh sách và có thể lưu lại.'); }
    catch { window.prompt('Sao chép link chia sẻ:', url); }
  };

  const Row = ({ id, collectionId }: { id: string; collectionId?: string }) => {
    const r = find(id);
    if (!r) {
      return (
        <div className="flex items-center justify-between gap-3 border-b border-line py-4 text-sm">
          <span><span className="font-semibold">{id}</span> <span className="text-ink-3">không còn trong thư viện.</span> <a className="link" href={`https://github.com/${id}`} target="_blank" rel="noopener noreferrer">Mở trên GitHub</a></span>
          <button type="button" className="btn btn-sm" onClick={() => (collectionId ? fav.toggleInCollection(collectionId, id) : fav.remove(id))}>Bỏ</button>
        </div>
      );
    }
    return (
      <div>
        <RepoRow r={r} cats={cats} showCategory />
        {!collectionId && state.collections.length > 0 && (
          <div className="-mt-2 mb-2 flex flex-wrap items-center gap-2 pl-[52px] text-xs sm:pl-[56px]">
            <span className="text-ink-3">Bộ sưu tập:</span>
            {state.collections.map((c) => (
              <button key={c.id} type="button" className="chip !min-h-7 !text-xs" aria-pressed={c.repos.includes(r.i)} onClick={() => fav.toggleInCollection(c.id, r.i)}>{c.name}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {shared && (
        <div className="panel mb-8 p-5">
          <p className="font-semibold">Bộ sưu tập được chia sẻ: “{shared.name}” ({shared.repos.length} dự án)</p>
          <div className="mt-2">{shared.repos.slice(0, 50).map((id) => { const r = find(id); return r ? <RepoRow key={id} r={r} cats={cats} showCategory /> : null; })}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => { fav.createCollection(shared.name, shared.repos.filter((id) => find(id)).map((id) => find(id)!.i)); setShared(null); setTab('collections'); window.history.replaceState(null, '', window.location.pathname); flash('Đã lưu bộ sưu tập vào trình duyệt này.'); }}>
              <FolderPlus size={16} aria-hidden="true" /> Lưu bộ sưu tập này
            </button>
            <button type="button" className="btn" onClick={() => { setShared(null); window.history.replaceState(null, '', window.location.pathname); }}>Bỏ qua</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Yêu thích" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {([['saved', `Đã lưu (${savedIds.length})`], ['collections', `Bộ sưu tập (${state.collections.length})`]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-raised text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={exportFile} disabled={!savedIds.length}><Download size={15} aria-hidden="true" /> Xuất file</button>
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden="true" /> Nhập file</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {msg && <p role="status" className="mt-4 rounded-lg bg-ok-soft p-3 text-sm text-ok">{msg}</p>}
      {error && <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      {tab === 'saved' && (
        <div className="mt-4">
          {savedIds.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-line-strong p-6">
              <p className="font-semibold">Chưa lưu dự án nào.</p>
              <p className="mt-1 text-sm text-ink-2">Bấm biểu tượng trái tim ở dự án bạn quan tâm để lưu vào đây. Danh sách được giữ trong trình duyệt này; dùng “Xuất file” để chuyển sang máy khác.</p>
              <Link href="/tim-kiem/" className="btn btn-sm mt-3">Tìm dự án</Link>
            </div>
          ) : index ? savedIds.map((id) => <Row key={id} id={id} />) : <p className="mt-6 text-sm text-ink-2">Đang tải…</p>}
          {savedIds.length > 0 && (
            <p className="mt-4"><button type="button" className="link text-sm" onClick={() => share('Danh sách yêu thích', savedIds)}><Link2 size={14} className="mr-1 inline" aria-hidden="true" />Chia sẻ toàn bộ danh sách qua link</button></p>
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div className="mt-6 grid gap-8">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; fav.createCollection(newName); setNewName(''); }}>
            <label htmlFor="new-col" className="sr-only">Tên bộ sưu tập mới</label>
            <input id="new-col" className="field max-w-sm flex-1" placeholder="Tên bộ sưu tập, ví dụ: Bộ công cụ làm video Tết" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
            <button type="submit" className="btn btn-primary"><FolderPlus size={16} aria-hidden="true" /> Tạo bộ sưu tập</button>
          </form>
          {state.collections.length === 0 && <p className="text-sm text-ink-2">Chưa có bộ sưu tập. Tạo một bộ sưu tập rồi thêm dự án từ tab “Đã lưu”.</p>}
          {state.collections.map((c) => (
            <section key={c.id} className="rounded-xl border border-line p-5" aria-label={c.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{c.name} <span className="tnum text-sm font-medium text-ink-3">({c.repos.length})</span></h2>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => share(c.name, c.repos)} disabled={!c.repos.length}><Link2 size={15} aria-hidden="true" /> Chia sẻ</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { const n = window.prompt('Tên mới của bộ sưu tập:', c.name); if (n) fav.renameCollection(c.id, n); }}><Pencil size={15} aria-hidden="true" /> Đổi tên</button>
                  <button type="button" className="btn btn-sm btn-ghost text-danger" onClick={() => { if (window.confirm(`Xóa bộ sưu tập “${c.name}”? Các dự án vẫn còn trong danh sách đã lưu.`)) fav.deleteCollection(c.id); }}><Trash2 size={15} aria-hidden="true" /> Xóa</button>
                </div>
              </div>
              <div className="mt-2">
                {c.repos.length === 0 ? <p className="text-sm text-ink-2">Chưa có dự án. Thêm từ tab “Đã lưu”.</p> : index && c.repos.map((id) => <Row key={id} id={id} collectionId={c.id} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
