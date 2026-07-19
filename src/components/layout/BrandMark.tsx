import { ShieldCheckIcon } from '../ui/icons';

/** CodeProof wordmark + glyph. `compact` hides the text (for tight bars). */
export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <ShieldCheckIcon className="h-5 w-5" />
      </span>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-slate-900">CodeProof</div>
          <div className="text-[11px] font-medium text-slate-400">Hiring Intelligence</div>
        </div>
      )}
    </div>
  );
}
