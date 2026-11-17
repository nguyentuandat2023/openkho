import { Scale } from 'lucide-react';
import type { LicenseClass } from '@/lib/types';

// Quyền dùng thương mại suy ra từ nhóm giấy phép (khớp scripts/lib/license.mjs)
const BY_CLASS: Record<LicenseClass, { label: string; tone: string }> = {
  permissive: { label: 'Dùng thương mại', tone: 'tone-ok' },
  'weak-copyleft': { label: 'Dùng thương mại', tone: 'tone-ok' },
  content: { label: 'Dùng được, ghi nguồn', tone: 'tone-ok' },
  copyleft: { label: 'Thương mại có điều kiện', tone: 'tone-gold' },
  'source-available': { label: 'Giấy phép hạn chế', tone: 'tone-warn' },
  custom: { label: 'Cần đọc giấy phép', tone: 'tone-warn' },
  noncommercial: { label: 'Phi thương mại', tone: 'tone-danger' },
  none: { label: 'Chưa có giấy phép', tone: 'tone-danger' },
};

export default function LicenseStamp({ cls, name, compact = false }: { cls: LicenseClass; name?: string | null; compact?: boolean }) {
  const s = BY_CLASS[cls];
  return (
    <span className={`stamp ${s.tone}`} title={name ? `Giấy phép: ${name}` : undefined}>
      <Scale size={12} strokeWidth={2} aria-hidden="true" />
      <span>{s.label}</span>
      {!compact && name && cls !== 'none' && (
        <span className="ml-0.5 border-l border-current/40 pl-1.5 font-medium opacity-80">{name}</span>
      )}
    </span>
  );
}
