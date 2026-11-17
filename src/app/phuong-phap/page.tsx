import type { Metadata } from 'next';
import Link from 'next/link';
import { getLibrary } from '@/lib/library';
import { dateTime } from '@/lib/format';
import { proposeUrl } from '@/lib/site';
import LicenseStamp from '@/components/LicenseStamp';
import type { LicenseClass } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Phương pháp đánh giá và nguồn dữ liệu',
  description: 'Cách thư viện thu thập số liệu từ GitHub API, công thức Quality Score và Trending Score, cách xử lý dữ liệu thiếu, phát hiện tín hiệu bất thường, lịch cập nhật tự động và phân loại giấy phép.',
  alternates: { canonical: '/phuong-phap/' },
};

const RULES: { key: string; label: string; max: number; rows: [string, string][] }[] = [
  { key: 'popularity', label: 'Mức độ phổ biến', max: 20, rows: [
    ['Số sao (15 điểm)', 'Thang logarit: 100 sao = 0 điểm, 1.000 ≈ 4,5, 10.000 ≈ 9,1, 50.000 ≈ 12,3, từ 200.000 sao = 15 điểm. Nhiều sao không đồng nghĩa chất lượng tốt nên tiêu chí này bị giới hạn ở 15/100.'],
    ['Số fork (5 điểm)', 'Thang logarit: 10 fork = 0, từ 30.000 fork = 5 điểm.'],
  ] },
  { key: 'quality', label: 'Chất lượng dự án', max: 20, rows: [
    ['Giấy phép (7)', 'Dễ dãi 7; copyleft yếu 6; copyleft 5,5; nội dung CC 5,5; tùy chỉnh 3,5; hạn chế 3; phi thương mại 1; không có giấy phép 0.'],
    ['Bản phát hành (5)', 'Bản ổn định trong 6 tháng: 5; trong 1 năm: 4; cũ hơn: 2,5; chỉ có bản thử nghiệm/tag: 1,5; không có: 0. Không áp dụng cho tài liệu, danh sách và kỹ năng AI.'],
    ['Độ trưởng thành (4)', 'Tuổi repo (từ 3 năm: 3, 1 năm: 2, 6 tháng: 1, còn lại 0,5) cộng 1 điểm nếu không có tín hiệu tăng sao bất thường.'],
    ['Thông tin đầy đủ (4)', 'Có mô tả, có ít nhất 3 chủ đề (topic), có trang chủ/tài liệu, có mở kênh báo lỗi (issue): mỗi mục 1 điểm.'],
  ] },
  { key: 'applicability', label: 'Tính ứng dụng', max: 20, rows: [
    ['Đánh giá biên tập (20)', 'Biên tập viên chấm 1–5 (×4 điểm) theo giá trị thực tế cho người dùng Việt Nam: giải quyết việc gì, có dùng được cho kinh doanh không, có chạy được trên máy cá nhân không. Đây là tiêu chí chủ quan duy nhất và luôn được ghi rõ.'],
  ] },
  { key: 'freshness', label: 'Mức độ cập nhật', max: 15, rows: [
    ['Commit gần nhất (11)', 'Trong 7 ngày: 11; 30 ngày: 10; 3 tháng: 8; 6 tháng: 6; 1 năm: 4; 2 năm: 2; lâu hơn: 0.'],
    ['Số commit 90 ngày (4)', 'Từ 60 commit: 4; 20: 3; 5: 2; ít nhất 1: 1. Khi không có token, con số được ước tính từ 20 commit mới nhất trong Atom feed (đánh dấu ≈).'],
  ] },
  { key: 'docs', label: 'Tài liệu hướng dẫn', max: 15, rows: [
    ['Độ đầy đủ README (5)', 'Theo độ dài: từ 15.000 ký tự: 5; 8.000: 4; 4.000: 3; 2.000: 2; 500: 1.'],
    ['Hướng dẫn cài đặt (4)', 'README có mục cài đặt/bắt đầu nhanh (nhận diện tự động, cả tiếng Anh, Việt, Trung) hoặc có hướng dẫn cài nhanh do biên tập viên viết.'],
    ['Hướng dẫn sử dụng (3)', 'Có mục sử dụng/ví dụ: 3; chỉ có mục tính năng: 1,5.'],
    ['Trang tài liệu (3)', 'Có trang chủ hoặc trang tài liệu riêng.'],
  ] },
  { key: 'community', label: 'Cộng đồng và hỗ trợ', max: 10, rows: [
    ['Người đóng góp (6)', 'Thang logarit: 1 người = 0, 10 = 2, 100 = 4, từ 1.000 người = 6.'],
    ['Kênh thảo luận (2)', 'Có bật GitHub Discussions.'],
    ['Kênh báo lỗi (2)', 'Có issue đang mở: 2; có kênh nhưng không có issue mở: 1; tắt kênh issue: 0.'],
  ] },
];

const CLASSES: { cls: LicenseClass; name: string; text: string }[] = [
  { cls: 'permissive', name: 'MIT, Apache-2.0, BSD…', text: 'Được dùng, sửa đổi, dùng thương mại; giữ thông báo bản quyền.' },
  { cls: 'weak-copyleft', name: 'LGPL, MPL, EPL', text: 'Dùng thương mại được; sửa chính các file của dự án và phân phối lại thì công khai phần sửa.' },
  { cls: 'copyleft', name: 'GPL, AGPL', text: 'Dùng thương mại được; phân phối bản sửa đổi phải mở mã. AGPL áp dụng cả khi chỉ cung cấp qua mạng.' },
  { cls: 'content', name: 'CC-BY, CC-BY-SA', text: 'Cho tài liệu và danh sách: được dùng, chia sẻ, ghi nguồn.' },
  { cls: 'source-available', name: 'BSL, SSPL, Elastic, fair-code…', text: 'Mã công khai nhưng có hạn chế (cấm làm dịch vụ cạnh tranh, giới hạn quy mô…).' },
  { cls: 'custom', name: 'Tùy chỉnh / nhiều giấy phép', text: 'GitHub không nhận diện được; phải đọc file LICENSE.' },
  { cls: 'noncommercial', name: 'CC-BY-NC, giấy phép mô hình NC', text: 'Không được dùng cho mục đích thương mại.' },
  { cls: 'none', name: 'Không có giấy phép', text: 'Mặc định tác giả giữ mọi quyền.' },
];

export default function MethodPage() {
  const lib = getLibrary();
  const ls = lib.last_sync;
  return (
    <div className="page max-w-4xl pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Phương pháp đánh giá và nguồn dữ liệu</h1>
      <p className="mt-3 text-lg text-ink-2">
        Thư viện tách bạch hai loại thông tin: số liệu khách quan lấy tự động từ GitHub, và nội dung biên tập (mô tả tiếng Việt, ứng dụng, ưu nhược điểm, độ khó, đánh giá tính ứng dụng).
      </p>

      <section className="mt-12" aria-labelledby="h-src">
        <h2 id="h-src" className="text-2xl font-bold">Nguồn dữ liệu</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
          <li>Danh sách dự án do biên tập viên tuyển chọn sau khi xác minh qua GitHub API. Lần nghiên cứu đầu tiên xem xét 556 ứng viên và giữ lại {lib.stats.repos} dự án.</li>
          <li>Số liệu (sao, fork, người đóng góp, giấy phép, commit, bản phát hành, README) được script đồng bộ lấy trực tiếp từ GitHub. <strong className="text-ink">Không có con số nào được nhập tay.</strong></li>
          <li>Có token GitHub: dùng GraphQL API và REST API (đầy đủ nhất, kể cả danh sách file tải về). Không có token: dùng Search API, Atom feed chính thức của GitHub và tệp README gốc. Không quét HTML.</li>
          <li>Mỗi dự án ghi rõ thời điểm lấy dữ liệu. Lần đồng bộ gần nhất: <span className="tnum font-semibold text-ink">{dateTime(ls?.finished_at || lib.synced_at)}</span>{ls ? `, chế độ ${ls.mode === 'full' ? 'đầy đủ (có token)' : 'không token'}` : ''}. Số dự án đã có số người đóng góp: {lib.stats.with_contributors}/{lib.stats.synced}.</li>
          <li>Repo đổi tên được nhận ra qua chuyển hướng của API. Repo chỉ bị coi là đã xóa khi API trả lỗi 404 thật; nếu hết hạn mức truy cập, dữ liệu cũ được giữ nguyên và đánh dấu “chưa kiểm tra lại”.</li>
          <li>Ngoài danh sách biên tập, hệ thống <strong className="text-ink">tự động khám phá</strong> repo mới qua GitHub Search API (repo mới tạo 7/30/90 ngày, repo phổ biến, repo trẻ đang hoạt động, theo topic, ứng viên “viên ngọc ẩn”) — hiện theo dõi {lib.automation.discovery.radar_total.toLocaleString('vi-VN')} repo. Định danh ổn định là GitHub Repository ID nên repo đổi tên/chuyển chủ không bị trùng lặp. Không dùng trang Trending của GitHub (không có API chính thức).</li>
          <li>Lịch tự động (chạy phía máy chủ/GitHub Actions, không chạy trên trình duyệt): {Object.values(lib.automation.jobs).filter((j) => j.enabled).map((j) => `${j.label.toLowerCase()} mỗi ${j.interval_hours} giờ`).join('; ')}. Khi GitHub không phản hồi, website tiếp tục hiển thị dữ liệu đã lưu kèm thời điểm, không giả làm số liệu trực tiếp.</li>
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="h-score">
        <h2 id="h-score" className="text-2xl font-bold">Công thức chấm điểm (100 điểm)</h2>
        <p className="mt-2 text-ink-2">
          Dữ liệu thiếu <strong className="text-ink">không được tính như dữ liệu thật</strong>: mục thiếu (ví dụ chưa lấy được số người đóng góp) bị loại khỏi cả tử số và mẫu số của tiêu chí;
          tiêu chí còn dưới 50% dữ liệu bị loại khỏi tổng; tổng điểm được quy về thang 100 trên phần có dữ liệu và công bố kèm <strong className="text-ink">độ phủ dữ liệu</strong>.
          Hạng “Xuất sắc” cần độ phủ từ 70%. Repo tự động phát hiện chưa có đánh giá biên tập nên tiêu chí “Tính ứng dụng” không áp dụng (không đoán điểm).
        </p>
        <div className="mt-6 grid gap-6">
          {RULES.map((g) => (
            <div key={g.key} className="rounded-xl border border-line p-5">
              <h3 className="flex items-baseline justify-between gap-3 text-lg font-bold">{g.label}<span className="tnum text-base text-ink-2">{g.max} điểm</span></h3>
              <dl className="mt-3 grid gap-3 text-[0.9375rem]">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-4">
                    <dt className="font-semibold">{k}</dt>
                    <dd className="text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="h-tier">
        <h2 id="h-tier" className="text-2xl font-bold">Xếp loại</h2>
        <ul className="mt-4 grid gap-2 text-ink-2">
          {lib.tiers.map((t) => <li key={t.key}><strong className="text-ink">{t.label}</strong>{t.min ? `: từ ${t.min} điểm` : ': dưới 58 điểm'} ({lib.stats.by_tier[t.key]} dự án)</li>)}
        </ul>
        <p className="mt-3 text-ink-2">
          Dự án đã lưu trữ, không còn tồn tại, không có giấy phép hoặc chỉ cho phép phi thương mại luôn bị xếp “Cần kiểm tra thêm” dù điểm cao.
          Dự án có tín hiệu tăng sao bất thường không được xếp cao hơn “Tiềm năng”.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="h-flags">
        <h2 id="h-flags" className="text-2xl font-bold">Cảnh báo tự động</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
          <li><strong className="text-ink">Không còn tồn tại:</strong> GitHub trả lỗi 404 (repo bị xóa, chuyển riêng tư). Dự án bị ẩn khỏi danh sách nhưng trang chi tiết vẫn giữ để cảnh báo.</li>
          <li><strong className="text-ink">Đã lưu trữ (archived):</strong> chủ dự án ngừng phát triển; kèm gợi ý thay thế nếu có.</li>
          <li><strong className="text-ink">Đổi tên/chuyển chủ sở hữu:</strong> link luôn trỏ tới địa chỉ mới.</li>
          <li><strong className="text-ink">Không cập nhật hơn 1 năm</strong>, <strong className="text-ink">giấy phép hạn chế</strong>, <strong className="text-ink">chưa có giấy phép</strong>.</li>
          <li><strong className="text-ink">Tăng sao bất thường:</strong> hơn 150 sao/ngày từ khi tạo nhưng dưới 10 người đóng góp (hoặc hơn 300 sao/ngày với dưới 25 người). Chỉ gắn khi đã xác minh được số người đóng góp, và không áp dụng cho tài liệu/danh sách/kỹ năng AI vốn thường do một người duy trì. Đây là tín hiệu để tự kiểm tra, không phải kết luận.</li>
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="h-lic">
        <h2 id="h-lic" className="text-2xl font-bold">Giấy phép và quyền dùng thương mại</h2>
        <p className="mt-2 text-ink-2">Giấy phép lấy từ GitHub (mã SPDX). Khi GitHub không nhận diện được nhưng giấy phép thực tế đã rõ, biên tập viên bổ sung phân loại và trang dự án hiển thị cả hai.</p>
        <ul className="mt-5 grid gap-3">
          {CLASSES.map((c) => (
            <li key={c.cls} className="grid items-start gap-2 sm:grid-cols-[14rem_1fr]">
              <span><LicenseStamp cls={c.cls} compact /></span>
              <span className="text-[0.9375rem] text-ink-2"><strong className="text-ink">{c.name}.</strong> {c.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-3">Với công cụ AI, giấy phép của mã nguồn và giấy phép của trọng số mô hình có thể khác nhau (ví dụ mã MIT nhưng mô hình chỉ cho phép phi thương mại). Các trường hợp đã biết được ghi chú trên trang dự án.</p>
      </section>

      <section id="xu-huong" className="mt-12 scroll-mt-24" aria-labelledby="h-trend">
        <h2 id="h-trend" className="text-2xl font-bold">Trending Score (điểm xu hướng)</h2>
        <p className="mt-2 text-ink-2">
          Đo đà phát triển hiện tại trong 3 kỳ: 24 giờ, 7 ngày, 30 ngày — thang 0–100, <strong className="text-ink">tách biệt hoàn toàn với Quality Score</strong>.
          Trọng số hiện hành (quản trị viên có thể điều chỉnh, luôn quy về tổng 100):
        </p>
        <ul className="mt-3 grid gap-1.5 text-ink-2 sm:grid-cols-2">
          {lib.automation.components.map((c) => <li key={c.key} className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2"><span>{c.label}</span><span className="tnum font-semibold text-ink">{Math.round(lib.automation.weights[c.key])}%</span></li>)}
        </ul>
        <h3 className="mt-6 text-lg font-bold">Đo tăng trưởng sao — chỉ từ số liệu thật</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-2">
          <li><strong className="text-ink">Đo trực tiếp:</strong> mỗi lần đồng bộ, số sao và fork được lưu kèm thời điểm (snapshot). Tăng trưởng = hiệu hai lần đo cách nhau đúng kỳ (dung sai: 24 giờ ±6 giờ, 7 ngày ±1 ngày, 30 ngày ±3 ngày).</li>
          <li><strong className="text-ink">Repo tạo trong kỳ:</strong> toàn bộ số sao hiện có đều phát sinh trong kỳ — chính xác mà không cần lịch sử.</li>
          <li><strong className="text-ink">Đếm lượt gắn sao:</strong> (khi có token GitHub) đếm thời điểm gắn sao của các lượt gần nhất; chỉ dùng khi mẫu bao trùm cả kỳ.</li>
          <li>Không có cách đo hợp lệ → repo <strong className="text-ink">không có điểm</strong> trong kỳ đó (hiển thị “chưa đủ dữ liệu”). Không nội suy, không vẽ lịch sử giả.</li>
        </ul>
        <h3 className="mt-6 text-lg font-bold">Chuẩn hóa để repo lớn không luôn áp đảo</h3>
        <p className="mt-2 text-ink-2">
          Điểm tăng trưởng sao = 60% theo số sao tăng tuyệt đối (thang log, đạt tối đa ở {lib.automation.ref.d1.rate}/{lib.automation.ref.d7.rate}/{lib.automation.ref.d30.rate} sao/ngày cho kỳ 24 giờ/7 ngày/30 ngày)
          + 40% theo tỉ lệ tăng so với đầu kỳ (đạt tối đa khi tăng {Math.round(lib.automation.ref.d1.rel * 100)}%/{Math.round(lib.automation.ref.d7.rel * 100)}%/{Math.round(lib.automation.ref.d30.rel * 100)}%; đầu kỳ tối thiểu tính 50 sao).
          Hoạt động phát triển chỉ dùng commit/push mã nguồn — không dùng “updated_at” vì giá trị này đổi cả khi chỉ sửa mô tả hoặc có người gắn sao.
        </p>
        <h3 className="mt-6 text-lg font-bold">Dữ liệu thiếu và độ phủ</h3>
        <p className="mt-2 text-ink-2">
          Mục thiếu dữ liệu bị loại khỏi phép tính; thành phần còn dưới 50% dữ liệu bị loại; điểm tính trên phần còn lại. Độ phủ dữ liệu dưới {Math.round(lib.automation.min_coverage * 100)}% → repo không được xếp hạng trong kỳ đó.
          Mỗi repo đều có phần giải thích: lý do (kèm số liệu cụ thể), phần thiếu và cảnh báo.
        </p>
        <h3 className="mt-6 text-lg font-bold">Tín hiệu bất thường</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-2">
          <li>Tăng nhiều sao nhưng gần như không có fork mới, hoặc repo mới nhiều sao nhưng không có fork/issue nào, hoặc rất ít người đóng góp so với tốc độ tăng sao → điểm tăng trưởng nhân hệ số {lib.automation.anomaly_damping} và gắn nhãn “Cần kiểm chứng”.</li>
          <li><strong className="text-ink">Cụm repo nhân bản:</strong> từ 3 repo cùng tên do các tài khoản khác nhau tạo gần như cùng lúc với số liệu giống hệt nhau (dấu hiệu spam/sao ảo) → tự động loại khỏi mọi bảng xếp hạng và báo cho quản trị viên.</li>
          <li>Đây là tín hiệu để tự kiểm tra, không phải kết luận về hành vi của chủ repo.</li>
        </ul>
        <h3 className="mt-6 text-lg font-bold">Viên ngọc ẩn và trang repo tự phát hiện</h3>
        <p className="mt-2 text-ink-2">
          “Viên ngọc ẩn”: Quality Score tính lại không gồm nhóm “Mức độ phổ biến” ≥ 75/100 với độ phủ ≥ 70%, chỉ {lib.automation.discovery.gem_star_range[0].toLocaleString('vi-VN')}–{lib.automation.discovery.gem_star_range[1].toLocaleString('vi-VN')} sao, có hoạt động mã trong 30 ngày, có giấy phép dùng được.
          Repo tự phát hiện chỉ có trang chi tiết riêng khi từ {lib.automation.discovery.publish_min_stars.toLocaleString('vi-VN')} sao và có README đủ dài; các trang này không được lập chỉ mục tìm kiếm nếu chưa có nội dung tiếng Việt riêng.
          Lĩnh vực công nghệ được gán bằng quy tắc minh bạch (topic, mô tả, README, ngôn ngữ) kèm độ tin cậy — không dùng AI để gán nhãn.
        </p>
        <p className="mt-3"><Link href="/xu-huong/" className="btn">Xem trang Xu hướng</Link></p>
      </section>

      <section id="ai" className="mt-12 scroll-mt-24" aria-labelledby="h-ai">
        <h2 id="h-ai" className="text-2xl font-bold">Phân tích bằng AI (tùy chọn)</h2>
        <p className="mt-2 text-ink-2">
          Khi được quản trị viên bật, hệ thống dùng Claude để tóm tắt README của repo tự phát hiện (tiếng Việt và tiếng Anh). Mỗi lợi ích/điểm nổi bật phải kèm trích dẫn nguyên văn từ README;
          trích dẫn được đối chiếu tự động, nhận định không khớp bị loại. AI không được đưa ra nhận định về độ an toàn/bảo mật. Mọi nội dung AI đều gắn nhãn kèm model và thời điểm tạo.
          Điểm số và xếp hạng không bao giờ do AI đoán.
        </p>
      </section>

      <section id="gioi-han" className="mt-12 scroll-mt-24" aria-labelledby="h-limit">
        <h2 id="h-limit" className="text-2xl font-bold">Giới hạn và miễn trừ trách nhiệm</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2">
          <li>Điểm số giúp so sánh nhanh, không thay thế việc tự thử nghiệm trước khi dùng cho công việc quan trọng.</li>
          <li>Thông tin giấy phép chỉ để tham khảo, không phải tư vấn pháp lý.</li>
          <li>Mục cài đặt/sử dụng được trích tự động từ README (tiếng Anh) và có thể chưa đầy đủ; luôn có link tới README gốc.</li>
          <li>Thư viện không lưu trữ hay phân phối lại mã nguồn; mọi link tải trỏ về GitHub hoặc trang chính thức của dự án.</li>
        </ul>
      </section>

      <section id="de-xuat" className="mt-12 scroll-mt-24" aria-labelledby="h-propose">
        <h2 id="h-propose" className="text-2xl font-bold">Đề xuất thêm dự án</h2>
        <p className="mt-2 text-ink-2">
          {proposeUrl
            ? <>Gửi đề xuất qua <a className="link" href={proposeUrl} target="_blank" rel="noopener noreferrer">biểu mẫu trên GitHub</a>. Sau khi được duyệt, dự án tự động được thêm và đồng bộ số liệu.</>
            : <>Quản trị viên thêm dự án bằng trang Quản trị (chạy <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm">npm run admin</code>) hoặc bằng biểu mẫu đề xuất trên GitHub sau khi cấu hình. Xem hướng dẫn trong thư mục docs.</>}
        </p>
        <p className="mt-4"><Link href="/tim-kiem/" className="btn">Tìm trong thư viện</Link></p>
      </section>
    </div>
  );
}
