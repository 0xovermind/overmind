import { ImageResponse } from 'next/og';
import { asScope, dailyDate, getDaily, mcap, signedUsd, type DailyRow } from '@/lib/daily';

/** /daily/image(?scope=all): today's Hive Daily as a 1600x900 PNG, ready to post on X. Pons by default. */
export const dynamic = 'force-dynamic';

const GREEN = '#3ddc97';
const RED = '#ff5d6c';

function Row({ r, buy }: { r: DailyRow; buy: boolean }) {
  const p = Math.round((100 * r.buyers) / Math.max(1, r.buyers + r.sellers));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
        {Array.from(r.symbol || '?')[0]!.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 27, fontWeight: 700 }}>${r.symbol.slice(0, 14)}</span>
          <span style={{ fontSize: 16, color: 'rgba(236,236,241,0.5)' }}>mcap {mcap(r.market_cap_usd)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
          <div style={{ display: 'flex', flex: 1, height: 9, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${p}%`, background: GREEN }} />
            <div style={{ width: `${100 - p}%`, background: RED }} />
          </div>
          <span style={{ fontSize: 15, color: 'rgba(236,236,241,0.55)' }}>{r.buyers} in · {r.sellers} out</span>
        </div>
      </div>
      <div style={{ width: 150, display: 'flex', justifyContent: 'flex-end', fontSize: 28, color: buy ? GREEN : RED }}>{signedUsd(r.net_usd)}</div>
    </div>
  );
}

function Col({ title, rows, buy }: { title: string; rows: DailyRow[]; buy: boolean }) {
  const color = buy ? GREEN : RED;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, letterSpacing: 2, color, marginBottom: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
        {title}
      </div>
      {rows.length ? rows.map((r) => <Row key={r.token} r={r} buy={buy} />) : (
        <div style={{ display: 'flex', padding: '30px 0', fontSize: 22, color: 'rgba(236,236,241,0.5)' }}>Nothing clear today.</div>
      )}
    </div>
  );
}

export async function GET(req: Request) {
  const scope = asScope(new URL(req.url).searchParams.get('scope'));
  const d = await getDaily(5, scope);
  const date = d ? dailyDate(d.at) : '';
  return new ImageResponse(
    (
      <div style={{ width: 1600, height: 900, display: 'flex', flexDirection: 'column', background: '#07070a', color: '#ececf1', padding: '50px 90px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1600, height: 900, display: 'flex', backgroundImage: 'radial-gradient(circle at 95% 0%, rgba(240,107,168,0.22), transparent 45%), radial-gradient(circle at 0% 100%, rgba(120,186,230,0.14), transparent 45%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, border: '4px solid #ececf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, border: '3px solid #ececf1' }} />
          </div>
          <span style={{ fontWeight: 700, letterSpacing: 2, fontSize: 19 }}>OVERMIND</span>
          <span style={{ marginLeft: 12, fontSize: 17, letterSpacing: 2, color: 'rgba(236,236,241,0.55)' }}>HIVE DAILY · {scope === 'pons' ? 'PONS' : 'ROBINHOOD CHAIN'} · LAST 24H · {date}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 22, fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>
          <span>What the&nbsp;</span>
          <span style={{ backgroundImage: 'linear-gradient(100deg, rgb(250,203,14), rgb(240,107,168) 45%, rgb(120,186,230))', backgroundClip: 'text', color: 'transparent' }}>profitable wallets</span>
          <span>&nbsp;did today.</span>
        </div>
        <div style={{ display: 'flex', gap: 80, marginTop: 34 }}>
          <Col title="BUYING" rows={d?.buying ?? []} buy />
          <Col title="SELLING" rows={d?.selling ?? []} buy={false} />
        </div>
        <div style={{ position: 'absolute', left: 90, right: 90, bottom: 40, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'rgba(236,236,241,0.45)' }}>
          <span>net USD of the most profitable {scope === 'pons' ? 'Pons traders' : 'wallets'} · bots, snipers, dev dumps and copycats left out</span>
          <span>overmind.ink/daily · not financial advice</span>
        </div>
      </div>
    ),
    { width: 1600, height: 900 },
  );
}
