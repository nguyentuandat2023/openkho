// Xử lý README lấy từ GitHub: trích mục Cài đặt / Sử dụng / Tính năng, làm sạch HTML (chống XSS),
// chuyển đường dẫn tương đối thành link tuyệt đối trỏ về repo gốc, tìm video demo YouTube.
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const README_PROCESSOR_VERSION = 4;

// Thứ tự ưu tiên: tiêu đề tiếng Anh khớp đầu dòng → tiêu đề tiếng Việt/Trung/Nhật/Hàn khớp đầu dòng → chứa từ khóa.
// Lưu ý: \b không dùng được với chữ có dấu/chữ Hán nên các mẫu không phải tiếng Anh không kèm \b.
const SECTION_PATTERNS = {
  install: [
    /^(installation|install|installing|quick ?start|quickstart|getting started|get started|setup|set up|how to install|download)\b/i,
    /^(cài đặt|bắt đầu nhanh|hướng dẫn cài|安装|快速开始|快速上手|部署|开始使用|インストール|설치)/i,
    /(install|quick ?start|getting started|setup|deploy|deployment|self[- ]?host|run(ning)? locally|docker|cài đặt|安装|部署|快速开始)/i,
  ],
  usage: [
    /^(usage|how to use|basic usage|using|examples?|tutorial|cli usage|commands)\b/i,
    /^(cách dùng|sử dụng|hướng dẫn sử dụng|使用|用法|使用方法|示例|使い方|사용법)/i,
    /(usage|how to use|example|tutorial|sử dụng|使用)/i,
  ],
  features: [
    /^(features|key features|main features|highlights|what can|capabilities)\b/i,
    /^(tính năng|功能|特性|主要功能|亮点|特点|機能|기능)/i,
    /(features|highlights|capabilities|tính năng|功能|特性)/i,
  ],
};

const BADGE_HOSTS = '(?:shields\\.io|badgen\\.net|badge\\.fury\\.io|/badge|badges?/|travis-ci|circleci|codecov|coveralls|deepwiki\\.com/badge|trendshift\\.io|producthunt\\.com/widgets|discord(?:app)?\\.com/api/guilds|readthedocs\\.org/projects/[^)\\s"]*badge|actions/workflows/[^)\\s"]*badge|img\\.shields)';
const BADGE_MD_LINK = new RegExp(`\\[!\\[[^\\]]*\\]\\([^)]*${BADGE_HOSTS}[^)]*\\)\\]\\([^)]*\\)`, 'gi');
const BADGE_MD_IMG = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${BADGE_HOSTS}[^)]*\\)`, 'gi');
const BADGE_HTML_LINK = new RegExp(`<a\\b[^>]*>\\s*<img\\b[^>]*src=["'][^"']*${BADGE_HOSTS}[^"']*["'][^>]*>\\s*</a>`, 'gi');
const BADGE_HTML_IMG = new RegExp(`<img\\b[^>]*src=["'][^"']*${BADGE_HOSTS}[^"']*["'][^>]*/?>`, 'gi');

function stripBadges(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(BADGE_MD_LINK, '')
    .replace(BADGE_MD_IMG, '')
    .replace(BADGE_HTML_LINK, '')
    .replace(BADGE_HTML_IMG, '');
}

function plainHeading(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#:]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/^\s*[\d.)\-–—]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chuẩn hóa token thành danh sách có đánh dấu heading (kể cả heading viết bằng HTML). */
function headingInfo(tok) {
  if (tok.type === 'heading') return { depth: tok.depth, text: plainHeading(tok.text) };
  if (tok.type === 'html') {
    const m = tok.raw.match(/^\s*<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>\s*$/i);
    if (m) return { depth: Number(m[1]), text: plainHeading(m[2]) };
  }
  return null;
}

function resolvePath(base, rel) {
  const parts = (base ? `${base}/${rel}` : rel).split('/');
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function makeRewriter({ full_name, branch, path: readmePath }) {
  const dir = readmePath && readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/')) : '';
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  return {
    link(href) {
      if (!href) return null;
      href = href.trim();
      if (href.startsWith('#')) return `https://github.com/${full_name}${href}`;
      if (href.startsWith('//')) return `https:${href}`;
      if (/^(https?:|mailto:)/i.test(href)) return href;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // javascript:, data:, ... → bỏ
      const [p, hash] = href.split('#');
      const target = resolvePath(href.startsWith('/') ? '' : dir, decodeURI(p.replace(/^\//, '')));
      return `https://github.com/${full_name}/blob/${encodeURIComponent(branch)}/${enc(target)}${hash ? `#${hash}` : ''}`;
    },
    img(src) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('//')) src = `https:${src}`;
      const blob = src.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+?)(\?raw=true)?$/i);
      if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}`;
      if (/^https?:/i.test(src)) return src.replace(/^http:/i, 'https:');
      if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
      const target = resolvePath(src.startsWith('/') ? '' : dir, decodeURI(src.replace(/^\//, '').split('?')[0]));
      return `https://raw.githubusercontent.com/${full_name}/${encodeURIComponent(branch)}/${enc(target)}`;
    },
  };
}

export function sanitize(html, ctx) {
  const rw = makeRewriter(ctx);
  return sanitizeHtml(html, {
    allowedTags: ['h4', 'h5', 'h6', 'p', 'a', 'img', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'em', 'strong', 'b', 'i', 'del', 's', 'br', 'hr', 'details', 'summary', 'kbd', 'sup', 'sub', 'span', 'div'],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      code: ['class'], th: ['align'], td: ['align'], ol: ['start'],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h4', h2: 'h4', h3: 'h5', h4: 'h6', h5: 'h6', h6: 'h6',
      a: (tag, attribs) => {
        const href = rw.link(attribs.href);
        return { tagName: 'a', attribs: href ? { href, title: attribs.title || '', rel: 'nofollow noopener noreferrer', target: '_blank' } : {} };
      },
      img: (tag, attribs) => {
        const src = rw.img(attribs.src);
        const out = { src: src || '', alt: attribs.alt || '', loading: 'lazy', decoding: 'async' };
        if (/^\d{1,4}%?$/.test(attribs.width || '')) out.width = attribs.width;
        if (/^\d{1,4}%?$/.test(attribs.height || '')) out.height = attribs.height;
        return { tagName: 'img', attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  }).trim();
}

/** Tìm mục theo mẫu ưu tiên (mẫu "chính xác" trước, sau đó mẫu "chứa từ khóa"). */
function findSection(tokens, heads, kind, used) {
  for (const re of SECTION_PATTERNS[kind]) {
    for (const h of heads) {
      if (used.has(h.index) || h.depth > 4) continue;
      if (re.test(h.text)) return h;
    }
  }
  return null;
}

function renderRange(tokens, start, end, ctx, limit = 9000) {
  const slice = [];
  let size = 0;
  let truncated = false;
  for (let i = start; i < end; i++) {
    const t = tokens[i];
    if (size + (t.raw?.length || 0) > limit && slice.length) { truncated = true; break; }
    slice.push(t);
    size += t.raw?.length || 0;
  }
  slice.links = tokens.links;
  const html = sanitize(marked.parser(slice), ctx);
  return { html, truncated, chars: size };
}

function meaningful(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length >= 25 || /<pre>|<a href|<img /.test(html);
}

function cjkRatio(text) {
  const plain = text.replace(/```[\s\S]*?```/g, '').replace(/https?:\/\/\S+/g, '');
  const letters = plain.match(/[\p{L}]/gu) || [];
  if (!letters.length) return 0;
  const cjk = plain.match(/[぀-ヿ㐀-鿿가-힯]/g) || [];
  return cjk.length / letters.length;
}

export function findVideos(md) {
  const ids = new Set();
  const re = /(?:youtube\.com\/watch\?(?:[^\s)"'&]*&)*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/g;
  let m;
  while ((m = re.exec(md)) && ids.size < 3) ids.add(m[1]);
  return [...ids].map((id) => ({ type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` }));
}

/**
 * markdown: nội dung README; ctx: { full_name, branch, path }
 * Trả về thông tin đã xử lý (không lưu toàn văn README để kho dữ liệu gọn nhẹ).
 */
export function processReadme(markdown, ctx) {
  const isMd = !ctx.path || /\.(md|markdown|mdx)$/i.test(ctx.path) || !/\./.test(ctx.path.split('/').pop());
  const base = {
    path: ctx.path,
    length: markdown.length,
    cjk_ratio: Number(cjkRatio(markdown).toFixed(2)),
    docker_mentioned: /\bdocker(?:\s+compose|-compose|\s+run|\s+pull)\b|docker-compose\.ya?ml|compose\.ya?ml/i.test(markdown),
    videos: findVideos(markdown),
    sections: { install: null, usage: null, features: null },
    headings: 0,
    processor: README_PROCESSOR_VERSION,
  };
  if (!isMd) return base;

  const tokens = marked.lexer(stripBadges(markdown));
  const heads = [];
  tokens.forEach((t, index) => {
    const h = headingInfo(t);
    if (h && h.text) heads.push({ ...h, index });
  });
  base.headings = heads.length;
  const used = new Set();
  for (const kind of ['install', 'usage', 'features']) {
    const h = findSection(tokens, heads, kind, used);
    if (!h) continue;
    used.add(h.index);
    let end = tokens.length;
    for (const o of heads) if (o.index > h.index && o.depth <= h.depth) { end = o.index; break; }
    const r = renderRange(tokens, h.index + 1, end, ctx);
    if (meaningful(r.html)) base.sections[kind] = { title: h.text.slice(0, 80), ...r };
  }
  return base;
}

/** Các tên file README thường gặp (ưu tiên bản tiếng Anh khi README chính là tiếng Trung/Nhật/Hàn). */
export const README_CANDIDATES = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.markdown', 'README.mdx', 'README.rst', 'README.txt', 'README', 'docs/README.md'];
export const ENGLISH_README_CANDIDATES = ['README_EN.md', 'README-EN.md', 'README.en.md', 'README_en.md', 'README-en.md', 'README.en-US.md', 'README_en-US.md', 'docs/README_EN.md', 'docs/en/README.md', 'README_ENG.md'];
