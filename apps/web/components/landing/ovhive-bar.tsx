import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { CopyAddress } from './copy-address';
import { OVHIVE_CA, OVHIVE_SHORT, OVHIVE_TRADE_URL } from '@/lib/ovhive';

/** The $OVHIVE strip on the landing: contract address with copy, and where to trade it. */
export function OvhiveBar() {
  return (
    <div className="rise flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface/70 px-4 py-3 backdrop-blur-sm">
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="size-2 rounded-full bg-[#18a058] shadow-[0_0_0_4px_rgba(24,160,88,.16)]" />
        $OVHIVE is live
      </span>
      <span className="font-mono text-[13px] text-muted" title={OVHIVE_CA}>
        CA <span className="text-ink">{OVHIVE_SHORT}</span>
      </span>
      <CopyAddress value={OVHIVE_CA} />
      <a
        href={OVHIVE_TRADE_URL}
        target="_blank"
        rel="noreferrer"
        className="pill-btn solid inline-flex items-center gap-1.5"
      >
        Trade on Pons <ArrowUpRight size={14} weight="bold" />
      </a>
    </div>
  );
}
