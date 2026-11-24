// overmind-push: sends new alerts as browser push notifications. Run every minute (systemd timer).
// Hive flips (hive_alerts) and wallet alerts (wallet_alerts: followed wallets, Exit Alarm, co-buyers leaving).
// Reads VAPID keys from the environment and the database URL from DATABASE_URL. Alerts older than
// FRESH_MIN are marked done without sending, so a restart after downtime never floods anyone.
import webpush from 'web-push';
import postgres from 'postgres';

const FRESH_MIN = 30;
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = 'https://overmind.ink', DATABASE_URL, SITE = 'https://overmind.ink' } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !DATABASE_URL) throw new Error('VAPID keys and DATABASE_URL are required');
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const sql = postgres(DATABASE_URL, { max: 2, fetch_types: false, prepare: false });
const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}`);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n) => (n == null ? '' : n >= 1000 ? ` ($${(n / 1000).toFixed(1)}K)` : ` ($${Math.round(n)})`);
let sent = 0, gone = 0;

async function push(memberId, payload) {
  const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where member_id = ${memberId}`;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
        gone++;
      } else {
        console.error('push failed', err?.statusCode ?? '', String(err?.body ?? err).slice(0, 160));
      }
    }
  }
}

function walletPayload(a) {
  const sym = a.symbol ? `$${a.symbol}` : 'a token';
  const url = `${SITE}/token/${a.token}`;
  if (a.kind === 'exit') {
    const [role, pct] = String(a.counterparty ?? '').split('|');
    const who = role === 'dev' ? 'The dev' : role === 'dev-funded wallet' ? 'A dev-funded wallet' : 'A top holder';
    return { title: `⚠️ ${who} is selling ${sym}`, body: `${short(a.wallet)} sold ${pct ? `${pct}% of supply` : 'tokens'}${usd(a.usd)}. You hold ${sym}.`, url, tag: `exit-${a.token}` };
  }
  if (a.kind === 'coexit') {
    return { title: `${sym}: your co-buyers are leaving`, body: `${a.amount} of the ${a.counterparty ?? ''} wallets that bought with you sold or trimmed in the last hour${usd(a.usd)}.`, url, tag: `coexit-${a.token}` };
  }
  const verb = { buy: 'bought', sell: 'sold', in: 'received', out: 'sent' }[a.kind] ?? a.kind;
  return { title: `${a.label ?? short(a.wallet)} ${verb} ${sym}`, body: `A wallet you follow ${verb} ${sym}${usd(a.usd)}.`, url, tag: `wallet-${a.wallet}-${a.token}` };
}

try {
  await sql`update hive_alerts set pushed_at = now() where pushed_at is null and created_at < now() - ${`${FRESH_MIN} minutes`}::interval`;
  await sql`update wallet_alerts set pushed_at = now() where pushed_at is null and created_at < now() - ${`${FRESH_MIN} minutes`}::interval`;
  const hive = await sql`
    select a.id, a.member_id, a.token, a.side, a.score, a.prev_score, t.symbol
    from hive_alerts a left join tokens t on t.address = a.token
    where a.pushed_at is null order by a.created_at limit 500`;
  for (const a of hive) {
    const sym = a.symbol ? `$${a.symbol}` : 'A token';
    await push(a.member_id, {
      title: `${sym}: the hive flipped to ${a.side}`,
      body: `${signed(a.prev_score)} → ${signed(a.score)} · the best wallets are ${a.side === 'buying' ? 'buying in' : 'getting out'}`,
      url: `${SITE}/token/${a.token}`,
      tag: `hive-${a.token}`,
    });
    await sql`update hive_alerts set pushed_at = now() where id = ${a.id}`;
  }
  const wallet = await sql`
    select a.id, a.member_id, a.wallet, a.kind, a.token, a.amount::text as amount, a.usd::float8 as usd, a.counterparty, t.symbol, w.label
    from wallet_alerts a left join tokens t on t.address = a.token
    left join wallet_watch w on w.member_id = a.member_id and w.wallet = a.wallet
    where a.pushed_at is null order by a.created_at limit 500`;
  for (const a of wallet) {
    await push(a.member_id, walletPayload(a));
    await sql`update wallet_alerts set pushed_at = now() where id = ${a.id}`;
  }
  if (hive.length || wallet.length) console.log(`alerts ${hive.length + wallet.length}, pushes sent ${sent}, expired subscriptions removed ${gone}`);
} finally {
  await sql.end({ timeout: 5 });
}
