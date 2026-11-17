import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Automation } from '@/lib/types';
import { dateTime } from '@/lib/format';
import RelativeTime from './RelativeTime';

/**
 * Thời điểm dữ liệu (không phải thời gian thực): lần đồng bộ thành công gần nhất + lúc tính xếp hạng.
 * Dữ liệu cũ hơn ngưỡng (2 chu kỳ cập nhật) → cảnh báo rõ ràng, vẫn hiển thị dữ liệu đã lưu.
 */
export default function FreshnessNote({ a, compact = false }: { a: Automation; compact?: boolean }) {
  const every = a.jobs.discover?.interval_hours;
  if (a.stale) {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-warn bg-warn-soft p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 flex-none text-warn" aria-hidden="true" />
        <p>
          <span className="font-semibold">Dữ liệu có thể đã cũ.</span> Lần đồng bộ thành công gần nhất: {a.last_data_sync_at ? <><span className="tnum">{dateTime(a.last_data_sync_at)}</span> (<RelativeTime iso={a.last_data_sync_at} />)</> : 'chưa có'}.
          {' '}Website đang hiển thị số liệu đã lưu tại thời điểm đó — không phải số liệu trực tiếp từ GitHub.
        </p>
      </div>
    );
  }
  return (
    <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${compact ? 'text-xs' : 'text-sm'} text-ink-2`}>
      <span className="inline-flex items-center gap-1.5"><RefreshCw size={compact ? 13 : 15} aria-hidden="true" className="flex-none text-ink-3" />
      <span>Đồng bộ từ GitHub lúc <span className="tnum font-semibold text-ink">{dateTime(a.last_data_sync_at)}</span>{a.last_data_sync_at && <> (<RelativeTime iso={a.last_data_sync_at} />)</>}</span></span>
      <span>Xếp hạng tính lúc <span className="tnum">{dateTime(a.ranking_computed_at)}</span></span>
      {a.scheduler_enabled && every ? <span>Tự động khám phá mỗi {every} giờ</span> : null}
    </p>
  );
}
