import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle, BookOpen, Bot, CirclePlay, ExternalLink, FileArchive, FolderGit2, Info, Monitor, Package, Radar, ShieldAlert,
} from 'lucide-react';
import { compactFor, getLibrary, getRepoByPath, relatedByArea, relatedRepos } from '@/lib/library';
import { bytes, compact, date, dateTime, num } from '@/lib/format';
import { API_KEY, CRITERIA_HELP, DEPLOY, DIFFICULTY, PLATFORM, PRICING, TIER } from '@/lib/labels';
import { absoluteUrl } from '@/lib/site';
import type { Flag, Repo } from '@/lib/types';
import ScoreSeal from '@/components/ScoreSeal';
import LicenseStamp from '@/components/LicenseStamp';
import FavoriteButton from '@/components/FavoriteButton';
import CopyButton from '@/components/CopyButton';
import CodeEnhancer from '@/components/CodeEnhancer';
import RelativeTime from '@/components/RelativeTime';
import RepoRow from '@/components/RepoRow';
import YouTubeFacade from '@/components/YouTubeFacade';
import TrendingPanel from '@/components/TrendingPanel';
import StarChart from '@/components/StarChart';

export const dynamicParams = false;

export function generateStaticParams() {
  return getLibrary().repos.map((r) => {
    const [, , owner, name] = r.path.split('/');
    return { owner, name };
  });
}

type P = { params: Promise<{ owner: string; name: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { owner, name } = await params;
  const r = getRepoByPath(decodeURIComponent(owner), decodeURIComponent(name));
  if (!r) return {};
  const desc = r.summary || r.ai?.summary_vi || r.description || `${r.full_name} trên GitHub`;
  return {
    title: `${r.name}: ${desc.length > 60 ? `${desc.slice(0, 57)}…` : desc}`,
    description: `${desc} Điểm ${r.score ? Math.round(r.score.total) : '—'}/100, ${r.license.display}. Link tải chính thức, hướng dẫn cài đặt và đánh giá.`,
    alternates: { canonical: r.path },
    openGraph: { title: `${r.name} – ${r.owner}`, description: desc, images: [{ url: r.og_image, width: 1200, height: 600 }] },
    robots: r.visible && !r.noindex ? undefined : { index: false, follow: true },
  };
}

const SUB_LABEL: Record<string, string> = {
  stars: 'Số sao', forks: 'Số fork', license: 'Giấy phép', releases: 'Bản phát hành', maturity: 'Độ trưởng thành',
  metadata: 'Thông tin dự án đầy đủ', editorial: 'Đánh giá biên tập', last_commit: 'Commit gần nhất', activity: 'Số commit 90 ngày',
  readme: 'Độ đầy đủ README', install: 'Hướng dẫn cài đặt', usage: 'Hướng dẫn sử dụng', docs_site: 'Trang tài liệu riêng',
  contributors: 'Số người đóng góp', discussions: 'Kênh thảo luận', issues: 'Kênh báo lỗi',
};
const SOURCE: Record<string, string> = { graphql: 'GitHub GraphQL API', search: 'GitHub Search API và Atom feed chính thức', rest: 'GitHub REST API và Atom feed chính thức' };
const OS_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' } as const;

function FlagBox({ f }: { f: Flag }) {
  const Icon = f.level === 'danger' ? ShieldAlert : f.level === 'warning' ? AlertTriangle : Info;
  const tone = f.level === 'danger' ? 'border-danger text-danger bg-danger-soft' : f.level === 'warning' ? 'border-warn text-warn bg-warn-soft' : 'border-info text-info bg-info-soft';
  return (
    <div role={f.level === 'info' ? 'note' : 'alert'} className={`flex gap-3 rounded-xl border p-4 text-sm ${tone}`}>
      <Icon size={18} className="mt-0.5 flex-none" aria-hidden="true" />
      <p className="text-ink">{f.text}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="scroll-mt-24 border-t border-line pt-8">
      <h2 id={`h-${id}`} className="text-xl font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function jsonLd(r: Repo) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: r.name,
    description: r.summary || r.description || undefined,
    codeRepository: r.links.github,
    url: absoluteUrl(r.path),
    programmingLanguage: r.language || undefined,
    license: r.links.license_file || undefined,
    author: { '@type': r.owner_type === 'Organization' ? 'Organization' : 'Person', name: r.owner, url: `https://github.com/${r.owner}` },
    dateCreated: r.stats?.created_at,
    dateModified: r.stats?.last_commit_at,
    keywords: [...r.tags, ...r.topics].slice(0, 12).join(', ') || undefined,
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function RepoPage({ params }: P) {
  const { owner, name } = await params;
  const r = getRepoByPath(decodeURIComponent(owner), decodeURIComponent(name));
  if (!r) notFound();
  const lib = getLibrary();
  const cats = Object.fromEntries(lib.categories.map((c) => [c.slug, c]));
  const catLite = Object.fromEntries(lib.categories.map((c) => [c.slug, { slug: c.slug, short: c.short, hue: c.hue }]));
  const s = r.stats;
  const sc = r.score;
  const sec = r.readme?.sections;
  const isRadar = r.origin === 'radar';
  const areaInfo = Object.fromEntries(lib.areas.map((a) => [a.slug, a]));
  const related = isRadar || r.categories.length === 0 ? relatedByArea(r, 6) : relatedRepos(r, 6);
  const relatedCompact = compactFor(new Set(related.map((x) => x.id)));
  const altRepos = r.alternatives.map((a) => lib.repos.find((x) => x.id.toLowerCase() === a.toLowerCase()) || null);
  const flags = sc?.flags || [];
  const onlyIssues = r.source !== 'graphql';
  const pros = [...r.pros];
  const cons = [...r.cons];

  return (
    <div className="page pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(r) }} />
      <nav aria-label="Đường dẫn" className="text-sm text-ink-3">
        {isRadar ? (
          <><Link href="/xu-huong/" className="hover:text-ink">Xu hướng</Link> <span aria-hidden="true">/</span> <span>Tự động phát hiện</span></>
        ) : (
          <><Link href="/danh-muc/" className="hover:text-ink">Danh mục</Link> <span aria-hidden="true">/</span>{' '}
          <Link href={`/danh-muc/${r.category}/`} className="hover:text-ink">{cats[r.category]?.name}</Link></>
        )}
      </nav>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-12 lg:gap-y-10">
        <header className="min-w-0">
          <div className="flex items-start gap-4">
            <img src={r.avatar_url} alt={`Ảnh đại diện của ${r.owner}`} width={64} height={64} className="h-16 w-16 flex-none rounded-2xl border border-line bg-surface-2 object-cover" />
            <div className="min-w-0">
              <p className="text-sm text-ink-3">
                <a href={`https://github.com/${r.owner}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink">{r.owner}</a>
                {r.owner_type === 'Organization' ? ' (tổ chức)' : ''}
              </p>
              <h1 className="break-words text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{r.name}</h1>
            </div>
          </div>
          {r.summary && <p className="mt-5 max-w-3xl text-lg leading-relaxed">{r.summary}</p>}
          {!r.summary && r.ai?.summary_vi && (
            <div className="mt-5 max-w-3xl">
              <p className="text-lg leading-relaxed">{r.ai.summary_vi}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Bot size={13} aria-hidden="true" /> Tóm tắt do AI ({r.ai.model}) tạo từ README lúc {dateTime(r.ai.generated_at)} — có thể chưa chính xác, hãy đối chiếu README.</p>
            </div>
          )}
          {isRadar && (
            <p role="note" className="mt-5 flex max-w-3xl gap-2.5 rounded-xl border border-info bg-info-soft p-3.5 text-sm">
              <Radar size={17} className="mt-0.5 flex-none text-info" aria-hidden="true" />
              <span>Repo do hệ thống <strong>tự động phát hiện</strong> qua GitHub Search API{r.first_seen_at ? <> (lần đầu thấy lúc <span className="tnum">{dateTime(r.first_seen_at)}</span>)</> : null} và chưa được biên tập viên kiểm tra. Số liệu, điểm và trích đoạn bên dưới đều lấy tự động — hãy tự đánh giá trước khi cài đặt.</span>
            </p>
          )}
          {r.description && (
            <p className="mt-3 max-w-3xl text-[0.9375rem] text-ink-2">
              <span className="text-ink-3">Mô tả gốc trên GitHub: </span>{r.description}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {sc && <ScoreSeal score={sc.total} tier={sc.tier} showLabel />}
            <LicenseStamp cls={r.license.class} name={r.license.display} />
            {r.categories.map((c) => cats[c] && (
              <Link key={c} href={`/danh-muc/${c}/`} className="chip" style={{ ['--h' as string]: cats[c].hue }}>
                <span className="hue-dot" aria-hidden="true" /> {cats[c].short}
              </Link>
            ))}
            {r.gem && <span className="stamp tone-gold" title={r.gem}>Viên ngọc ẩn</span>}
            {r.areas.filter((a) => areaInfo[a.slug]).slice(0, 4).map((a) => (
              <Link key={a.slug} href={`/xu-huong/linh-vuc/${a.slug}/`} className="chip" title={`Phân loại tự động · độ tin cậy ${Math.round(a.confidence * 100)}% · tín hiệu: ${a.signals.slice(0, 4).join(', ')}`}>
                #{areaInfo[a.slug].name}
              </Link>
            ))}
          </div>
          {(flags.length > 0 || r.note) && (
            <div className="mt-6 grid gap-3">
              {flags.filter((f) => f.level !== 'info' || f.key === 'renamed' || f.key === 'unverified').map((f) => <FlagBox key={f.key} f={f} />)}
              {r.note && <FlagBox f={{ key: 'note', level: 'info', text: r.note }} />}
            </div>
          )}
        </header>

        <aside className="lg:row-span-2" aria-label="Tải về và liên kết">
          <div className="lg:sticky lg:top-20">
            <img src={r.og_image} alt={`Ảnh minh họa của ${r.full_name}`} width={1200} height={600} loading="lazy" className="w-full rounded-xl border border-line bg-surface-2" />
            <div className="panel mt-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">Tải về và liên kết chính thức</h2>
                <FavoriteButton id={r.id} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <a className="btn btn-primary w-full justify-start" href={r.links.github} target="_blank" rel="noopener noreferrer">
                  <FolderGit2 size={17} aria-hidden="true" /> Xem mã nguồn trên GitHub
                </a>
                {r.links.zip && (
                  <a className="btn w-full justify-start" href={r.links.zip} rel="nofollow noopener">
                    <FileArchive size={17} aria-hidden="true" /> Tải ZIP mã nguồn mới nhất
                    <span className="ml-auto text-xs font-medium text-ink-3">nhánh {r.branch}</span>
                  </a>
                )}
                {r.release && r.links.release && (
                  <a className="btn w-full justify-start" href={r.links.release} target="_blank" rel="noopener noreferrer">
                    <Package size={17} aria-hidden="true" /> <span className="min-w-0 truncate">Bản phát hành {r.release.tag}</span>
                    <span className="tnum ml-auto text-xs font-medium text-ink-3">{date(r.release.published_at)}</span>
                  </a>
                )}
                {(Object.keys(r.downloads_by_os) as (keyof typeof OS_LABEL)[]).map((os) => {
                  const a = r.downloads_by_os[os]!;
                  return (
                    <a key={os} className="btn w-full justify-start" href={a.url} rel="nofollow noopener">
                      <Monitor size={17} aria-hidden="true" /> Bộ cài {OS_LABEL[os]}
                      <span className="tnum ml-auto text-xs font-medium text-ink-3">{bytes(a.size)}</span>
                    </a>
                  );
                })}
                {r.links.zip_release && (
                  <a className="btn w-full justify-start" href={r.links.zip_release} rel="nofollow noopener">
                    <FileArchive size={17} aria-hidden="true" /> <span className="min-w-0 truncate">Mã nguồn bản {r.release?.tag} (ZIP)</span>
                  </a>
                )}
                {r.links.docs && (
                  <a className="btn w-full justify-start" href={r.links.docs} target="_blank" rel="noopener noreferrer">
                    <BookOpen size={17} aria-hidden="true" /> Trang chủ và tài liệu
                  </a>
                )}
                {r.links.demo && (
                  <a className="btn w-full justify-start" href={r.links.demo} target="_blank" rel="noopener noreferrer">
                    <CirclePlay size={17} aria-hidden="true" /> Demo chính thức
                  </a>
                )}
              </div>
              {r.visible && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-ink-3">Hoặc tải bằng Git</p>
                  <div className="mt-1.5 flex items-stretch gap-2">
                    <code className="codebox min-w-0 flex-1 py-2 text-xs">git clone {r.links.clone}</code>
                    <CopyButton text={`git clone ${r.links.clone}`} label="Chép" />
                  </div>
                </div>
              )}
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Mọi liên kết trỏ tới GitHub hoặc trang chính thức của dự án. OpenKho không lưu trữ hay phân phối lại mã nguồn.
                {!r.release && r.visible && ' Dự án chưa có bản phát hành chính thức trên GitHub.'}
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          <Section id="so-lieu" title="Số liệu từ GitHub">
            {s ? (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  {[
                    ['Sao', num(s.stars)],
                    ['Fork', num(s.forks)],
                    ['Người đóng góp', s.contributors !== null ? num(s.contributors) : s.contributors_capped ? 'Rất nhiều' : 'Đang cập nhật'],
                    [onlyIssues ? 'Issue và PR đang mở' : 'Issue đang mở', num(s.open_issues)],
                    [s.last_commit_verified ? 'Commit gần nhất (nhánh chính)' : 'Push mã gần nhất', <RelativeTime key="lc" iso={s.last_commit_at} />],
                    ...(s.metadata_updated_at ? [['Cập nhật metadata', <RelativeTime key="mu" iso={s.metadata_updated_at} />]] : []),
                    ['Commit trong 90 ngày', s.commits_90d === null ? '—' : s.commits_90d_estimated ? `≥ 20 (ước tính ≈ ${num(s.commits_90d)})` : num(s.commits_90d)],
                    ['Bản phát hành mới nhất', r.release ? `${r.release.tag}${r.release.published_at ? ` (${date(r.release.published_at)})` : ''}` : r.prerelease ? `Chỉ có bản thử nghiệm ${r.prerelease.tag}` : r.release_checked ? 'Chưa có' : 'Chưa kiểm tra'],
                    ['Ngôn ngữ chính', r.language || '—'],
                    ['Ngày tạo repo', date(s.created_at)],
                    ...(s.watchers !== null ? [['Người theo dõi', num(s.watchers)]] : []),
                    ...(s.size_kb ? [['Dung lượng repo', bytes(s.size_kb * 1024)]] : []),
                  ].map(([k, v]) => (
                    <div key={String(k)} className="min-w-0">
                      <dt className="text-xs text-ink-3">{k}</dt>
                      <dd className="tnum mt-0.5 break-words font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {r.languages && r.languages.length > 1 && (
                  <p className="mt-4 text-sm text-ink-2">Thành phần mã: {r.languages.filter((l) => (l.share ?? 0) >= 1).map((l) => `${l.name} ${String(l.share).replace('.', ',')}%`).join(', ')}.</p>
                )}
                <p className="mt-4 text-xs text-ink-3">
                  Lấy lúc <span className="tnum">{dateTime(r.fetched_at)}</span> (giờ Việt Nam) qua {SOURCE[r.source || 'search'] || 'GitHub'}.
                  {s.contributors_fetched_at && s.contributors !== null && <> Số người đóng góp lấy lúc <span className="tnum">{dateTime(s.contributors_fetched_at)}</span>.</>}
                  {onlyIssues && ' Ở chế độ đồng bộ không token, GitHub gộp issue và pull request đang mở thành một con số.'}
                  {' '}“Cập nhật metadata” thay đổi cả khi chỉ sửa mô tả hay có người gắn sao — không phải hoạt động mã nguồn.
                </p>
              </>
            ) : (
              <p className="text-ink-2">Chưa có số liệu: dự án chưa được đồng bộ từ GitHub.</p>
            )}
          </Section>

          {s && (
            <Section id="xu-huong" title="Xu hướng">
              <TrendingPanel r={r} a={lib.automation} />
              {r.chart ? (
                <div className="mt-8">
                  <h3 className="font-semibold">Số sao theo thời gian</h3>
                  <div className="mt-3"><StarChart points={r.chart} name={r.name} /></div>
                </div>
              ) : (
                <p className="mt-6 text-sm text-ink-3">Biểu đồ số sao sẽ hiển thị khi có ít nhất hai ngày đo thật (hệ thống không vẽ lịch sử ước đoán).</p>
              )}
            </Section>
          )}

          {sc && (
            <Section id="danh-gia" title="Đánh giá chất lượng">
              <div className="flex flex-wrap items-center gap-4">
                <ScoreSeal score={sc.total} tier={sc.tier} size={64} />
                <div>
                  <p className="text-lg font-bold">{TIER[sc.tier].label}</p>
                  <p className="text-sm text-ink-2">{Math.round(sc.total)}/100 điểm (Quality Score) · độ phủ dữ liệu {Math.round((sc.coverage ?? 1) * 100)}%. <Link href="/phuong-phap/" className="link">Cách tính</Link></p>
                </div>
              </div>
              <div className="mt-6 grid gap-4">
                {lib.criteria.map((c) => {
                  const b = sc.breakdown[c.key];
                  if (!b) return null;
                  if (b.na) {
                    return (
                      <div key={c.key} className="rounded-xl border border-dashed border-line p-4">
                        <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{c.label}</span><span className="text-sm text-ink-3">không áp dụng</span></div>
                        <p className="mt-1 text-xs text-ink-3">{c.key === 'applicability' ? 'Repo chưa được biên tập viên đánh giá tính ứng dụng nên tiêu chí này không được tính (không đoán điểm); tổng điểm quy về thang 100 trên các tiêu chí còn lại.' : 'Không áp dụng cho loại dự án này.'}</p>
                      </div>
                    );
                  }
                  return (
                    <details key={c.key} className="group rounded-xl border border-line p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{c.label}</span>
                          <span className="tnum text-sm font-semibold">{b.score === null ? <span className="font-normal text-ink-3">không đủ dữ liệu</span> : <>{String(b.score).replace('.', ',')}<span className="text-ink-3">/{c.max}</span></>}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                          {b.score !== null && <div className="h-full rounded-full bg-gold" style={{ width: `${(b.score / c.max) * 100}%` }} />}
                        </div>
                        <p className="mt-2 text-xs text-ink-3">{CRITERIA_HELP[c.key]}{b.excluded ? ' Thiếu hơn một nửa dữ liệu nên tiêu chí này không được tính vào tổng.' : b.partial ? ' Thiếu một phần dữ liệu — phần thiếu không được tính, điểm nhóm tính trên phần có dữ liệu.' : ''} <span className="text-gold group-open:hidden">Xem chi tiết</span></p>
                      </summary>
                      <ul className="mt-3 grid gap-1.5 text-sm">
                        {b.items.map((it) => (
                          <li key={it.name} className="flex justify-between gap-3 border-t border-line pt-1.5">
                            <span className="text-ink-2">{SUB_LABEL[it.name] || it.name}</span>
                            <span className="tnum">{it.pts === null ? <span className="text-ink-3">thiếu dữ liệu</span> : `${String(it.pts).replace('.', ',')}/${it.max}`}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </Section>
          )}

          <Section id="tong-quan" title="Tổng quan">
            <div className="grid gap-8">
              {r.ai && (
                <div className="rounded-xl border border-line p-4 sm:p-5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3"><Bot size={14} aria-hidden="true" /> Phân tích tự động bằng AI · {r.ai.model} · {dateTime(r.ai.generated_at)}</p>
                  {r.ai.problem && <p className="mt-3"><span className="font-semibold">Vấn đề giải quyết: </span>{r.ai.problem}</p>}
                  {r.ai.audiences.length > 0 && <p className="mt-2 text-sm text-ink-2"><span className="font-semibold text-ink">Phù hợp với: </span>{r.ai.audiences.join('; ')}</p>}
                  {([['Lợi ích', r.ai.benefits], ['Điểm nổi bật', r.ai.highlights], ['Tình huống sử dụng', r.ai.use_cases]] as const).map(([title, list]) => list.length > 0 && (
                    <div key={title} className="mt-4">
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <ul className="mt-1.5 space-y-2 text-sm">
                        {list.map((x) => <li key={x.text}><span>{x.text}</span><span className="mt-0.5 block text-xs text-ink-3">README: “{x.evidence}”</span></li>)}
                      </ul>
                    </div>
                  ))}
                  {r.ai.docs_accessibility && <p className="mt-4 text-sm text-ink-2"><span className="font-semibold text-ink">Tài liệu: </span>{r.ai.docs_accessibility.note}</p>}
                  {r.ai.summary_en && <p lang="en" className="mt-4 text-sm text-ink-3">{r.ai.summary_en}</p>}
                  <p className="mt-4 text-xs text-ink-3">
                    Nội dung do AI tạo từ README{r.ai.truncated ? ' (đã cắt bớt phần cuối)' : ''}; mỗi nhận định đã được đối chiếu tự động với trích dẫn nguyên văn ({r.ai.verification.kept}/{r.ai.verification.claims} được giữ).
                    Đây không phải đánh giá bảo mật hay cam kết về chất lượng.
                  </p>
                </div>
              )}
              {r.readme_preview && (
                <div>
                  <h3 className="font-semibold">Giới thiệu (trích README)</h3>
                  <p className="mt-1 text-xs text-ink-3">Trích nguyên văn đoạn đầu README của {r.full_name} ({r.readme_preview.path}, lấy lúc {dateTime(r.readme_preview.fetched_at)}) theo giấy phép {r.license.display}{r.readme_preview.truncated ? '; đã rút gọn' : ''}.</p>
                  <div className="prose-readme mt-3" dangerouslySetInnerHTML={{ __html: r.readme_preview.html }} />
                </div>
              )}
              {r.readme_preview_blocked && (
                <p className="text-sm text-ink-2">Không trích README vì giấy phép của dự án ({r.license.display}) không cho phép tái sử dụng nội dung. <a className="link" href={r.links.readme} target="_blank" rel="noopener noreferrer">Đọc README trên GitHub</a>.</p>
              )}
              {(r.features.length > 0 || sec?.features) && (
                <div>
                  <h3 className="font-semibold">Tính năng nổi bật</h3>
                  {r.features.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{r.features.map((x) => <li key={x}>{x}</li>)}</ul>
                  ) : sec?.features && (
                    <>
                      <p className="mt-1 text-xs text-ink-3">Trích từ README, mục “{sec.features.title}” (tiếng Anh).</p>
                      <div className="prose-readme mt-3" dangerouslySetInnerHTML={{ __html: sec.features.html }} />
                    </>
                  )}
                </div>
              )}
              {r.use_cases.length > 0 && (
                <div>
                  <h3 className="font-semibold">Ứng dụng thực tế</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{r.use_cases.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-ok">Ưu điểm</h3>
                  <ul className="mt-2 space-y-1.5 text-[0.9375rem] text-ink-2">
                    {pros.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-ok">+</span>{x}</li>)}
                    {(sc?.auto_pros || []).map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-ok">+</span><span>{x} <span className="text-xs text-ink-3">(từ số liệu)</span></span></li>)}
                    {!pros.length && !(sc?.auto_pros || []).length && <li className="text-ink-3">Chưa có đánh giá.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-warn">Nhược điểm và lưu ý</h3>
                  <ul className="mt-2 space-y-1.5 text-[0.9375rem] text-ink-2">
                    {cons.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-warn">–</span>{x}</li>)}
                    {(sc?.auto_cons || []).map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-warn">–</span><span>{x} <span className="text-xs text-ink-3">(từ số liệu)</span></span></li>)}
                    {!cons.length && !(sc?.auto_cons || []).length && <li className="text-ink-3">Chưa ghi nhận.</li>}
                  </ul>
                </div>
              </div>
              {!r.applicability && <p className="text-sm text-ink-3">Dự án chưa được biên tập viên đánh giá tính ứng dụng; tiêu chí này không được tính vào điểm.</p>}
            </div>
          </Section>

          <Section id="giay-phep" title="Giấy phép và quyền sử dụng">
            <div className="flex flex-wrap items-center gap-2">
              <LicenseStamp cls={r.license.class} name={r.license.display} />
              <span className="text-sm text-ink-2">{r.license.label}</span>
            </div>
            <p className="mt-3 max-w-3xl text-ink-2">{r.license.text}</p>
            {r.license.spdx_note && <p className="mt-2 max-w-3xl text-sm text-ink-2">{r.license.spdx_note}</p>}
            {r.license_note && <p className="mt-3 max-w-3xl rounded-lg bg-surface-2 p-3 text-sm"><span className="font-semibold">Ghi chú biên tập: </span>{r.license_note}</p>}
            <p className="mt-3 text-xs text-ink-3">
              GitHub nhận diện: {r.license.spdx || 'không có giấy phép'}{r.license.github_name && r.license.github_name !== r.license.spdx ? ` (${r.license.github_name})` : ''}.
              {r.license.overridden && ' Phân loại trên được biên tập viên bổ sung vì GitHub không tự nhận diện đầy đủ.'}
              {r.links.license_file && <> <a href={`${r.links.github}#license-ov-file`} className="link" target="_blank" rel="noopener noreferrer">Đọc giấy phép gốc</a>.</>}
              {' '}Thông tin chỉ để tham khảo, không phải tư vấn pháp lý.
            </p>
          </Section>

          <Section id="cai-dat" title="Hướng dẫn cài đặt">
            {r.quick_start && (
              <div>
                <p className="text-sm font-semibold">Cài nhanh</p>
                <div className="mt-2 flex items-start gap-2">
                  <pre className="codebox min-w-0 flex-1">{r.quick_start}</pre>
                  <CopyButton text={r.quick_start} label="Chép" />
                </div>
              </div>
            )}
            {sec?.install ? (
              <div className={r.quick_start ? 'mt-6' : ''}>
                <p className="text-xs text-ink-3">
                  Trích từ README của dự án, mục “{sec.install.title}”{sec.install.truncated ? ' (đã rút gọn)' : ''}.
                  {r.readme?.original_path && ` README chính viết bằng tiếng Trung/Nhật/Hàn nên hiển thị bản tiếng Anh (${r.readme.path}).`}
                </p>
                <div className="prose-readme mt-3" dangerouslySetInnerHTML={{ __html: sec.install.html }} />
              </div>
            ) : !r.quick_start && (
              <p className="text-ink-2">README chưa có mục cài đặt riêng. Xem hướng dẫn đầy đủ trong README hoặc trang tài liệu của dự án.</p>
            )}
            <p className="mt-4 text-sm"><a className="link" href={r.links.readme} target="_blank" rel="noopener noreferrer">Đọc README đầy đủ trên GitHub</a></p>
          </Section>

          {sec?.usage && (
            <Section id="su-dung" title="Hướng dẫn sử dụng">
              <p className="text-xs text-ink-3">Trích từ README, mục “{sec.usage.title}”{sec.usage.truncated ? ' (đã rút gọn)' : ''}.</p>
              <div className="prose-readme mt-3" dangerouslySetInnerHTML={{ __html: sec.usage.html }} />
            </Section>
          )}

          {!isRadar && <Section id="yeu-cau" title="Yêu cầu hệ thống và cách dùng">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-3">Nền tảng hỗ trợ</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">{r.platforms.length ? r.platforms.map((p) => <span key={p} className="tag">{PLATFORM[p]}</span>) : <span className="text-ink-2">Xem README</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Cách sử dụng</dt>
                <dd className="mt-1 text-[0.9375rem]">{r.deploy.length ? r.deploy.map((d) => DEPLOY[d]).join('; ') : 'Xem README'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Độ khó cài đặt</dt>
                <dd className="mt-1 text-[0.9375rem]">{r.difficulty ? DIFFICULTY[r.difficulty] : 'Chưa đánh giá'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Chi phí</dt>
                <dd className="mt-1 text-[0.9375rem]">{r.pricing ? PRICING[r.pricing] : 'Chưa đánh giá'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-3">Dịch vụ AI / khóa API</dt>
                <dd className="mt-1 text-[0.9375rem]">{r.needs_api_key ? API_KEY[r.needs_api_key] : 'Chưa đánh giá'}</dd>
              </div>
              {r.requirements && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-3">Cấu hình khuyến nghị</dt>
                  <dd className="mt-1 text-[0.9375rem]">{r.requirements}</dd>
                </div>
              )}
            </dl>
          </Section>}

          {r.readme?.videos && r.readme.videos.length > 0 && (
            <Section id="video" title="Video demo">
              <p className="mb-3 text-xs text-ink-3">Video được dự án gắn trong README.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {r.readme.videos.slice(0, 2).map((v) => <YouTubeFacade key={v.id} id={v.id} title={`Video demo ${r.name}`} />)}
              </div>
            </Section>
          )}

          {r.release?.assets && r.release.assets.length > 0 && (
            <Section id="file-tai" title={`File tải về của bản ${r.release.tag}`}>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-ink-2">
                    <tr><th className="px-3 py-2 font-semibold">Tên file</th><th className="px-3 py-2 text-right font-semibold">Dung lượng</th><th className="px-3 py-2 text-right font-semibold">Lượt tải</th></tr>
                  </thead>
                  <tbody>
                    {r.release.assets.slice(0, 20).map((a) => (
                      <tr key={a.name} className="border-t border-line">
                        <td className="max-w-[18rem] truncate px-3 py-2"><a className="link" href={a.url} rel="nofollow noopener">{a.name}</a></td>
                        <td className="tnum px-3 py-2 text-right">{bytes(a.size)}</td>
                        <td className="tnum px-3 py-2 text-right">{compact(a.download_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {r.alternatives.length > 0 && (
            <Section id="thay-the" title="Có thể thay thế bằng">
              <ul className="flex flex-wrap gap-2">
                {r.alternatives.map((a, i) => (
                  <li key={a}>{altRepos[i] ? <Link className="chip" href={altRepos[i]!.path}>{altRepos[i]!.name}</Link> : <a className="chip" href={`https://github.com/${a}`} target="_blank" rel="noopener noreferrer">{a} <ExternalLink size={12} aria-hidden="true" /></a>}</li>
                ))}
              </ul>
            </Section>
          )}

          {relatedCompact.length > 0 && (
            <Section id="lien-quan" title="Dự án liên quan">
              <div>{related.map((x) => relatedCompact.find((c) => c.i === x.id)).filter(Boolean).map((c) => <RepoRow key={c!.i} r={c!} cats={catLite} showCategory />)}</div>
            </Section>
          )}
        </div>
      </div>
      <CodeEnhancer />
    </div>
  );
}
