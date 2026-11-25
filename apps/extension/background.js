// Fetches for the content script: the hive reading of a token from Overmind, and the token behind a DexScreener pair.
// Only two hosts are ever called (see host_permissions); nothing about the user is sent or stored.
const API = 'https://api.overmind.ink';
const pairCache = new Map();

async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function tokenOfPair(pair) {
  if (pairCache.has(pair)) return pairCache.get(pair);
  const b = await json(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${pair}`);
  const p = (b.pairs ?? [b.pair]).find(Boolean);
  const token = p?.baseToken?.address?.toLowerCase() ?? null;
  pairCache.set(pair, token);
  return token;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg?.type === 'hive') {
      let token = msg.token;
      if (!token && msg.pair) token = await tokenOfPair(msg.pair);
      if (!token) return reply({ ok: true, token: null, consensus: null });
      // the hive reading and the safety check side by side; a token the index lacks has no safety data yet
      const [hive, safety] = await Promise.all([json(`${API}/hive/${token}`), json(`${API}/tokens/${token}/signals`).catch(() => null)]);
      reply({ ok: true, token, consensus: hive.consensus ?? null, safety: safety?.data ? { ...safety.data, risk: safety.risk_level ?? safety.data.risk } : null });
    }
  })().catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true; // async reply
});
