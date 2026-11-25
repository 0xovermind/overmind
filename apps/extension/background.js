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
      const b = await json(`${API}/hive/${token}`);
      reply({ ok: true, token, consensus: b.consensus ?? null });
    }
  })().catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true; // async reply
});
