import { ImageResponse } from 'next/og';
import { asHorizon, getArena, HORIZON_LABEL, SOURCE } from '@/lib/arena';

/** /arena/image(?h=24): the Arena scoreboard as a 1600x900 PNG, ready to post on X. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const h = asHorizon(new URL(req.url).searchParams.get('h') ?? undefined);
  const a = await getArena(h);
  const sources = a?.sources ?? [];
  return new ImageResponse(
    (
      <div style={{ width: 1600, height: 900, display: 'flex', flexDirection: 'column', background: '#07070a', color: '#ececf1', padding: '56px 80px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1600, height: 900, display: 'flex', backgroundImage: 'radial-gradient(circle at 92% 0%, rgba(240,107,168,0.22), transparent 45%), radial-gradient(circle at 0% 100%, rgba(120,186,230,0.16), transparent 45%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, border: '4px solid #ececf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, border: '3px solid #ececf1' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>OVERMIND</div>
          <div style={{ fontSize: 18, letterSpacing: 3, color: 'rgba(236,236,241,0.5)', marginLeft: 12 }}>ARENA</div>
        </div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, letterSpacing: -3, marginTop: 34 }}>
          Hive <span style={{ color: 'rgba(236,236,241,0.4)', margin: '0 22px' }}>vs</span> Crowd <span style={{ color: 'rgba(236,236,241,0.4)', margin: '0 22px' }}>vs</span> AI
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(236,236,241,0.6)', marginTop: 14 }}>
          Every call scored against the price {HORIZON_LABEL[h]} later · last 30 days
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 56 }}>
          {sources.map((s) => {
            const m = SOURCE[s.source];
            const lead = a?.leader === s.source;
            const decided = s.wins + s.losses;
            return (
              <div key={s.source} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '34px 36px', borderRadius: 26, background: 'rgba(255,255,255,0.04)', border: `2px solid ${lead ? m.color : 'rgba(255,255,255,0.08)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 34, fontWeight: 700 }}>{m.name}</div>
                  {lead ? <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2, color: '#07070a', background: m.color, padding: '6px 14px', borderRadius: 20 }}>LEADING</div> : <div />}
                </div>
                <div style={{ fontSize: 20, color: 'rgba(236,236,241,0.5)', marginTop: 6 }}>{m.who}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 30 }}>
                  <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: -4, color: decided ? m.color : 'rgba(236,236,241,0.35)', lineHeight: 1 }}>
                    {decided ? `${Math.round((s.winRate ?? 0) * 100)}%` : '—'}
                  </div>
                  <div style={{ fontSize: 24, color: 'rgba(236,236,241,0.5)', marginLeft: 14, marginBottom: 14 }}>right</div>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.07)', marginTop: 22 }}>
                  <div style={{ width: `${(s.winRate ?? 0) * 100}%`, background: m.color, borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 22, color: 'rgba(236,236,241,0.6)', marginTop: 20 }}>
                  {decided ? `${s.wins} right · ${s.losses} wrong · ${s.pushes} flat` : `${s.calls} calls, none scored yet`}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 80, right: 80, bottom: 40, display: 'flex', justifyContent: 'space-between', fontSize: 19, color: 'rgba(236,236,241,0.45)' }}>
          <span>overmind.ink/arena</span>
          <span>Robinhood Chain · not financial advice</span>
        </div>
      </div>
    ),
    { width: 1600, height: 900 },
  );
}
