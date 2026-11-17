// Tìm kiếm toàn văn phía trình duyệt (MiniSearch): không dấu vẫn tìm được ("tach nen" → "tách nền"),
// gõ sai nhẹ vẫn ra, ưu tiên khớp tên dự án, thẻ, mô tả tiếng Việt.
import MiniSearch from 'minisearch';
import type { CompactRepo } from './types';

export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const STOP = new Set([
  'va', 'cua', 'cho', 'cac', 'nhung', 'la', 'co', 'duoc', 'mot', 'trong', 'voi', 'de', 'tu', 'khi', 'nay', 'nhu', 'tren',
  'den', 'ra', 'vao', 'bang', 'theo', 'hay', 'hoac', 'toi', 'can', 'muon', 'the', 'and', 'or', 'for', 'with', 'to', 'of', 'an', 'in', 'on', 'is',
]);

export function buildIndex(docs: CompactRepo[], catNames: Record<string, string>) {
  const ms = new MiniSearch<CompactRepo>({
    idField: 'i',
    fields: ['name', 'owner', 'summary', 'desc', 'tags', 'uses', 'cats', 'lang'],
    storeFields: [],
    extractField: (doc, field) => {
      switch (field) {
        case 'i': return doc.i;
        case 'name': return `${doc.n} ${doc.n.replace(/[-_.]+/g, ' ')}`;
        case 'owner': return doc.o;
        case 'summary': return doc.s;
        case 'desc': return doc.d;
        case 'tags': return doc.t.join(' ');
        case 'uses': return doc.u.join(' ');
        case 'cats': return [...doc.c.map((c) => catNames[c] || c), ...(doc.ae || []).map((a) => catNames[`a:${a}`] || '')].join(' ');
        case 'lang': return doc.l || '';
        default: return '';
      }
    },
    processTerm: (term) => {
      const x = fold(term);
      if (!x || STOP.has(x)) return null;
      if (x.length < 2 && !/\d/.test(x)) return null;
      return x;
    },
    searchOptions: {
      boost: { name: 5, owner: 2, tags: 2.5, summary: 2, cats: 1.5, uses: 1.2, desc: 1, lang: 1 },
      prefix: (term) => term.length >= 2,
      // Gõ sai/đảo chữ: từ ≥6 ký tự cho phép sai 2 ký tự, từ 5 ký tự sai 1 ký tự
      fuzzy: (term) => (term.length >= 6 ? 0.3 : term.length >= 5 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  ms.addAll(docs);
  return ms;
}

/**
 * Trả về Map id → điểm liên quan; nếu không có kết quả khớp tất cả từ thì nới sang khớp bất kỳ từ nào.
 * Tên dự án trùng khớp chính xác với từ khóa được đẩy lên đầu (gõ "n8n" phải ra n8n trước các repo nói về n8n).
 */
export function runSearch(ms: MiniSearch<CompactRepo>, q: string, docs?: CompactRepo[]): Map<string, number> {
  const query = q.trim();
  if (!query) return new Map();
  let res = ms.search(query);
  if (!res.length) res = ms.search(query, { combineWith: 'OR' });
  const out = new Map(res.map((r) => [String(r.id), r.score]));
  if (docs) {
    const fq = fold(query).replace(/[\s._-]+/g, '');
    for (const d of docs) {
      if (!out.has(d.i)) continue;
      const fn = fold(d.n).replace(/[\s._-]+/g, '');
      if (fn === fq) out.set(d.i, out.get(d.i)! * 4);
      else if (fn.startsWith(fq) && fq.length >= 3) out.set(d.i, out.get(d.i)! * 1.6);
    }
  }
  return out;
}
