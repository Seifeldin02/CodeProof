"use client";

import { ShieldCheckIcon } from '../ui/icons';
import { useI18n } from '../i18n/LocaleProvider';

/** CodeProof wordmark + glyph. `compact` hides the text (for tight bars). */
export default function BrandMark({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime-300 text-slate-950 shadow-sm">
        <ShieldCheckIcon className="h-5 w-5" />
      </span>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">CodeProof</div>
          <div className="text-[11px] font-medium text-slate-500">{t("Evidence hiring")}</div>
        </div>
      )}
    </div>
  );
}
