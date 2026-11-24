import { ImageResponse } from 'next/og';
import { DNA_COLOR, getDna, holdLabel, isWallet } from '@/lib/arena';

/** /dna/:address/image: a wallet's DNA card as a 1600x900 PNG (the X preview of /dna/:address). */
export const dynamic = 'force-dynamic';

const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${a.toFixed(0)}`;
  return `${n < 0 ? '-' : '+'}${s}`;
};

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const w = (await params).address.toLowerCase();
  const d = isWallet(w) ? await getDna(w) : null;
  const c = d ? (DNA_COLOR[d.archetype.id] ?? '#f06ba8') : '#f06ba8';
  const stats: [string, string][] = d
    ? [
        ['WIN RATE', d.stats.winRate == null ? '—' : `${Math.round(d.stats.winRate * 100)}%`],
        ['REALIZED', money(d.stats.realizedUsd)],
        ['TYPICAL HOLD', holdLabel(d.stats.medianHoldS)],
        ['TOKENS', String(d.stats.tokens)],
      ]
    : [];
  return new ImageResponse(
    (
      <div style={{ width: 1600, height: 900, display: 'flex', flexDirection: 'column', background: '#07070a', color: '#ececf1', padding: '60px 84px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1600, height: 900, display: 'flex', backgroundImage: `radial-gradient(circle at 88% 8%, ${c}40, transparent 42%), radial-gradient(circle at 0% 100%, rgba(120,186,230,0.12), transparent 45%)` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, border: '4px solid #ececf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, border: '3px solid #ececf1' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>OVERMIND</div>
          <div style={{ fontSize: 18, letterSpacing: 3, color: 'rgba(236,236,241,0.5)', marginLeft: 12 }}>WALLET DNA</div>
          <div style={{ fontSize: 18, color: 'rgba(236,236,241,0.45)', marginLeft: 'auto' }}>{`${w.slice(0, 6)}…${w.slice(-4)}`}</div>
        </div>
        {d ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 70 }}>
            <div style={{ fontSize: 136, fontWeight: 800, letterSpacing: -5, color: c, lineHeight: 1 }}>{d.archetype.name}</div>
            <div style={{ fontSize: 34, color: 'rgba(236,236,241,0.78)', marginTop: 22 }}>{d.archetype.line}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              {d.traits.map((t) => (
                <div key={t} style={{ fontSize: 22, padding: '8px 20px', borderRadius: 24, border: `2px solid ${c}66`, color: c }}>{t}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 56 }}>
              {stats.map(([k, v]) => (
                <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', borderRadius: 22, background: 'rgba(255,255,255,0.045)' }}>
                  <div style={{ fontSize: 17, letterSpacing: 2, color: 'rgba(236,236,241,0.5)' }}>{k}</div>
                  <div style={{ fontSize: 52, fontWeight: 800, marginTop: 8, color: k === 'REALIZED' ? (d.stats.realizedUsd >= 0 ? '#3ddc97' : '#ff5d6c') : '#ececf1' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 90, fontWeight: 800, marginTop: 160 }}>Read any wallet&apos;s DNA</div>
        )}
        <div style={{ position: 'absolute', left: 84, right: 84, bottom: 42, display: 'flex', justifyContent: 'space-between', fontSize: 20, color: 'rgba(236,236,241,0.45)' }}>
          <span>overmind.ink/dna · read yours</span>
          <span>Robinhood Chain</span>
        </div>
      </div>
    ),
    { width: 1600, height: 900 },
  );
}
