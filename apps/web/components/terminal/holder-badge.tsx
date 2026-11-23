// $OVHIVE holder badge next to a member's name (calls feed, profiles). Tiers by whole tokens held,
// summed over the member's wallets (indexer agents/pro.ts: ovhiveTier).
export type OvhiveTier = 'holder' | 'bee' | 'pro' | 'queen';

const TIERS: Record<OvhiveTier, { icon: string; label: string; title: string }> = {
  holder: { icon: '🐝', label: 'Holder', title: 'Holds $OVHIVE' },
  bee: { icon: '🐝', label: 'Bee', title: 'Holds 100K+ $OVHIVE' },
  pro: { icon: '🐝🐝', label: 'Hive Pro', title: 'Holds 1M+ $OVHIVE (Hive Pro)' },
  queen: { icon: '👑', label: 'Queen', title: 'Holds 10M+ $OVHIVE' },
};

export function HolderBadge({ tier, size = 'sm' }: { tier: OvhiveTier | null | undefined; size?: 'sm' | 'md' }) {
  if (!tier) return null;
  const t = TIERS[tier];
  const big = tier === 'pro' || tier === 'queen';
  return (
    <span
      title={t.title}
      className={`inline-flex items-center gap-1 rounded-md border font-semibold ${size === 'md' ? 'px-1.5 py-0.5 text-[11px]' : 'px-1 py-px text-[10px]'} ${
        big ? 'pro-banner border-transparent' : 'border-ink/[0.1]'
      }`}
    >
      <span aria-hidden>{t.icon}</span>
      <span className={big ? 'ovhive-grad' : 'text-muted'}>{t.label}</span>
    </span>
  );
}
