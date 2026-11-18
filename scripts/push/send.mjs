// overmind-push: sends new hive alerts as browser push notifications. Run every minute (systemd timer).
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

try {
  await sql`update hive_alerts set pushed_at = now() where pushed_at is null and created_at < now() - ${`${FRESH_MIN} minutes`}::interval`;
  const alerts = await sql`
    select a.id, a.member_id, a.token, a.side, a.score, a.prev_score, t.symbol
    from hive_alerts a left join tokens t on t.address = a.token
    where a.pushed_at is null
    order by a.created_at limit 500`;
  let sent = 0, gone = 0;
  for (const a of alerts) {
    const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where member_id = ${a.member_id}`;
    const sym = a.symbol ? `$${a.symbol}` : 'A token';
    const payload = JSON.stringify({
      title: `${sym}: the hive flipped to ${a.side}`,
      body: `${signed(a.prev_score)} → ${signed(a.score)} · the best wallets are ${a.side === 'buying' ? 'buying in' : 'getting out'}`,
      url: `${SITE}/token/${a.token}`,
      tag: `hive-${a.token}`,
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
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
    await sql`update hive_alerts set pushed_at = now() where id = ${a.id}`;
  }
  if (alerts.length) console.log(`alerts ${alerts.length}, pushes sent ${sent}, expired subscriptions removed ${gone}`);
} finally {
  await sql.end({ timeout: 5 });
}
