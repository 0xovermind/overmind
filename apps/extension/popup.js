// The toolbar window: five screens over the same live data.
//   Home: hive mood, top buy and dump, the latest signal, search (token or wallet).
//   Radar: every token the hive has a reading on; the closer to the centre, the harder smart money is buying.
//   Discover: one token at a time, strongest readings first.
//   Feed: what smart money did, as a timeline.
//   Token: the token in this tab (or the one you picked): score gauge, safety, Overmind AI.
const API = 'https://api.overmind.ink';
const MIN_VOTERS = 3;
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const tone = (s) => (s >= 20 ? 'up' : s > -20 ? 'flat' : 'down');
const hex = (s) => (s >= 20 ? '#34d399' : s > -20 ? '#8b8b96' : '#f87171');
const verdict = (s) => (s >= 60 ? 'Smart money is buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Smart money is selling');
const money = (n) => (n == null ? '–' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
const signed = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}`;
const ago = (iso) => { const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const img = (u) => (u ? `https://overmind.ink/api/img?u=${encodeURIComponent(u)}` : null);
const icon = (t, cls = '') => {
  const l = esc((t?.symbol || '?')[0].toUpperCase());
  return img(t?.image_url) ? `<img class="tok ${cls}" src="${esc(img(t.image_url))}" alt="" data-l="${l}">` : `<span class="tok ${cls}">${l}</span>`;
};
const RISK = { low: ['Low risk', '#34d399', 1], medium: ['Medium risk', '#fbbf24', 0.6], high: ['High risk', '#f87171', 0.25] };
const ask = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError || !r ? { ok: false } : r)));
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
const once = (f) => { let p; return () => (p ??= f()); };

// a broken token image falls back to its letter; links open in a new tab (the window closes on navigation)
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.classList.contains('tok')) t.replaceWith(Object.assign(document.createElement('span'), { className: t.className, textContent: t.dataset.l || '?' }));
}, true);
document.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (a) { e.preventDefault(); chrome.tabs.create({ url: a.href }); } });
const pons = (a) => `https://ponsfamily.com/launchpad/${a}`;

// ---------- data ----------
const board = once(() => json(`${API}/hive?limit=60&scope=pons`));
const signals = once(() => json(`${API}/hive/signals?scope=pons`));
const stats = once(() => json(`${API}/stats`).catch(() => ({})));
const liveTokens = async () => (await board()).tokens.filter((t) => t.voters >= MIN_VOTERS);
const tabToken = once(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const url = tab?.url ?? '';
  const p = url.match(/ponsfamily\.com\/launchpad\/(0x[0-9a-fA-F]{40})/), d = url.match(/dexscreener\.com\/robinhood\/(0x[0-9a-fA-F]{40,64})/);
  return p ? { token: p[1].toLowerCase() } : d ? { pair: d[1].toLowerCase() } : null;
});
let picked = null; // a token chosen on another screen, shown on the Token screen

// ---------- navigation ----------
const screens = { home, radar, discover, feed, token };
let current = 'home';
function go(name) {
  current = name;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.s === name);
  $('#screen').scrollTop = 0;
  $('#screen').innerHTML = `<div class="empty">Loading…</div>`;
  screens[name]().catch(() => { if (current === name) $('#screen').innerHTML = `<div class="empty">Overmind is not reachable right now.</div>`; });
}
for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => { if (b.dataset.s === 'token') picked = null; go(b.dataset.s); };
const openToken = (address) => { picked = { token: address }; go('token'); };
document.addEventListener('click', (e) => { const el = e.target.closest('[data-token]'); if (el && !e.target.closest('a,button')) openToken(el.dataset.token); });

// ---------- Home ----------
const gaugeHalf = (f) => {
  const a = Math.PI * (1 - Math.max(0.02, Math.min(0.98, f))), x = 48 + 38 * Math.cos(a), y = 46 - 38 * Math.sin(a);
  return `<svg viewBox="0 0 96 54" style="width:96px;height:54px;flex:none"><path d="M10 46 A38 38 0 0 1 86 46" stroke="#26262f" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M10 46 A38 38 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" stroke="#34d399" stroke-width="8" fill="none" stroke-linecap="round"/></svg>`;
};
async function home() {
  const [b, live, sg, st] = await Promise.all([board(), liveTokens(), signals(), stats()]);
  const buy = live.filter((t) => t.score >= 20).sort((x, y) => y.score - x.score);
  const sell = live.filter((t) => t.score <= -20).sort((x, y) => x.score - y.score);
  const f = buy.length / Math.max(1, buy.length + sell.length);
  const s0 = (sg.signals ?? [])[0];
  const tile = (t, label) => (t ? `<div class="card tile" data-token="${t.token}"><div class="label">${label}</div>
      <div class="who">${icon(t, 'sm')}<span>$${esc(t.symbol)}</span></div>
      <div class="big num ${tone(t.score)}">${signed(t.score)}</div><div class="sub">${t.smart_buyers} buying · ${t.smart_sellers} selling</div></div>`
    : `<div class="card tile"><div class="label">${label}</div><div class="sub" style="margin-top:12px">Nothing clear yet</div></div>`);
  if (current !== 'home') return;
  $('#screen').innerHTML = `<div class="stack">
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input id="q" placeholder="Paste a token or wallet address" spellcheck="false"></label>
    <div class="card mood"><div class="head"><div><div class="label">Hive mood · 24h</div><div class="word ${f >= 0.5 ? 'up' : 'down'}">${f >= 0.5 ? 'Risk-on' : 'Risk-off'}</div></div>${gaugeHalf(f)}</div>
      <div class="foot"><b>${b.smart_wallets ?? 300}</b> smart wallets · <b class="up">${buy.length}</b> tokens bought · <b class="down">${sell.length}</b> dumped${st.trades_24h ? ` · <b>${st.trades_24h.toLocaleString('en-US')}</b> trades read` : ''}</div></div>
    <div class="grid2">${tile(buy[0], 'Top buy')}${tile(sell[0], 'Top dump')}</div>
    ${s0 ? `<div class="card"><div class="label">Latest signal</div>
      <div class="row" data-token="${s0.token}" style="margin:8px -12px -8px">${icon(s0, 'sm')}<div class="main"><div class="t">$${esc(s0.symbol)} <span class="${tone(s0.score)}" style="font-size:12px">→ ${esc(s0.side)}</span></div><div class="s">${ago(s0.at)} · ${s0.voters} smart wallets</div></div><div class="v ${tone(s0.score)}">${signed(s0.score)}</div></div></div>` : ''}
    <div class="grid2">
      <div class="card quick" id="qDna"><svg viewBox="0 0 24 24"><path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M8 7h8M8 17h8"/></svg>Wallet DNA</div>
      <div class="card quick" id="qFeed"><svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>All signals</div></div></div>`;
  $('#qFeed').onclick = () => go('feed');
  $('#qDna').onclick = () => dnaSheet('');
  $('#q').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const a = e.target.value.trim().match(/0x[0-9a-fA-F]{40}/)?.[0]?.toLowerCase();
    if (!a) return;
    // a token the index knows opens on the Token screen; anything else is read as a wallet
    const known = await json(`${API}/tokens/${a}`).then(() => true).catch(() => false);
    known ? openToken(a) : dnaSheet(a);
  });
}

// ---------- Radar ----------
async function radar() {
  const live = (await liveTokens()).slice(0, 24);
  const S = 328, C = S / 2, R = 146;
  // place blips on a golden-angle spiral; distance from the centre follows the score
  const blips = live.map((t, i) => { const r = 18 + (1 - (t.score + 100) / 200) * (R - 26), a = i * 2.39996 - Math.PI / 2; return { t, x: C + r * Math.cos(a), y: C + r * Math.sin(a), d: 4 + Math.min(5, t.voters / 4) }; });
  // labels: try right, left, above, below; skip one that would overlap a dot or another label
  const boxes = blips.map((b) => ({ x: b.x - b.d - 2, y: b.y - b.d - 2, w: 2 * b.d + 4, h: 2 * b.d + 4 }));
  const hit = (q) => boxes.some((o) => q.x < o.x + o.w && q.x + q.w > o.x && q.y < o.y + o.h && q.y + q.h > o.y);
  const labels = [];
  for (const b of blips) {
    const w = 6.4 * b.t.symbol.length + 4, h = 12;
    const spots = [[b.x + b.d + 4, b.y - 6], [b.x - b.d - 4 - w, b.y - 6], [b.x - w / 2, b.y - b.d - 15], [b.x - w / 2, b.y + b.d + 3]];
    const spot = spots.find(([x, y]) => x >= 2 && x + w <= S - 2 && y >= 2 && y + h <= S - 2 && !hit({ x, y, w, h }));
    if (spot) { boxes.push({ x: spot[0], y: spot[1], w, h }); labels.push(`<text x="${(spot[0] + 2).toFixed(1)}" y="${(spot[1] + 9.5).toFixed(1)}">${esc(b.t.symbol)}</text>`); }
  }
  const top = [...live].sort((a, b) => b.score - a.score).slice(0, 3);
  if (current !== 'radar') return;
  $('#screen').innerHTML = `
    <div class="legend"><span><i style="background:#34d399"></i>Centre: hive buying</span><span><i style="background:#f87171"></i>Edge: dumping</span></div>
    <div class="radar-wrap"><svg class="radar" viewBox="0 0 ${S} ${S}" style="width:${S}px;height:${S}px">
      <defs><radialGradient id="rg"><stop offset="0" stop-color="#34d399" stop-opacity=".16"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></radialGradient></defs>
      <circle cx="${C}" cy="${C}" r="${R}" fill="url(#rg)" stroke="#26262f"/>
      ${[0.68, 0.36].map((k) => `<circle cx="${C}" cy="${C}" r="${R * k}" fill="none" stroke="#26262f" stroke-dasharray="2 4"/>`).join('')}
      <path d="M${C - R} ${C}H${C + R}M${C} ${C - R}V${C + R}" stroke="#1c1c23"/>
      ${blips.map((b) => `<circle class="blip" data-token="${b.t.token}" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.d}" fill="${hex(b.t.score)}" fill-opacity=".9" stroke="#0b0b0f" stroke-width="2"><title>$${esc(b.t.symbol)} ${signed(b.t.score)}</title></circle>`).join('')}
      ${labels.join('')}
      <circle cx="${C}" cy="${C}" r="3" fill="#f2f2f5"/></svg></div>
    <div class="label" style="margin:8px 0 4px">Closest to the centre</div>
    ${top.map((t) => `<div class="row" data-token="${t.token}">${icon(t, 'sm')}<div class="main"><div class="t">$${esc(t.symbol)}</div><div class="s">${money(t.market_cap_usd)} · ${t.smart_buyers} buying</div></div><div class="v ${tone(t.score)}">${signed(t.score)}</div></div>`).join('')}`;
}

// ---------- Discover ----------
let deck = [], at = 0;
async function discover() {
  deck = (await liveTokens()).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  at = 0;
  if (current === 'discover') drawCard();
}
function drawCard() {
  if (!deck.length) { $('#screen').innerHTML = `<div class="empty">No readings right now.</div>`; return; }
  const t = deck[at % deck.length], s = Math.round(t.score);
  const glow = s >= 20 ? 'rgba(52,211,153,.2)' : s <= -20 ? 'rgba(248,113,113,.2)' : 'rgba(255,255,255,.06)';
  $('#screen').innerHTML = `<div class="deck"><div class="behind"></div>
    <div class="front" id="card" style="--glow:${glow}" data-token="${t.token}">
      <span class="count">${(at % deck.length) + 1} / ${deck.length}</span>
      ${icon(t, 'lg')}
      <div class="name">$${esc(t.symbol)}</div><div class="meta">${esc(t.name || '')} · ${money(t.market_cap_usd)}</div>
      <div class="score ${tone(s)}">${signed(s)}</div><div class="verdict ${tone(s)}">${verdict(s)}</div>
      <div class="pills"><span class="pill"><span class="up">●</span>${t.smart_buyers} buying</span><span class="pill"><span class="down">●</span>${t.smart_sellers} selling</span></div>
      <div class="actions"><button class="btn ghost" id="skip">Skip</button><a class="btn ${s >= 20 ? 'go' : 'primary'}" href="${pons(t.token)}">Open on Pons</a></div>
    </div></div>
    <div class="muted" style="text-align:center;font-size:11.5px">Strongest readings first · ← → to flip · tap the card for details</div>`;
  $('#skip').onclick = () => next(1);
}
function next(dir = 1) { const c = $('#card'); if (!c) return; c.classList.add('out'); setTimeout(() => { at = (at + dir + deck.length) % deck.length; drawCard(); }, 180); }
document.addEventListener('keydown', (e) => { if (current === 'discover' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) next(e.key === 'ArrowRight' ? 1 : -1); });

// ---------- Feed ----------
let feedFilter = 'all';
async function feed() {
  const b = await signals();
  if (current !== 'feed') return;
  const all = b.signals ?? [];
  const shown = all.filter((s) => feedFilter === 'all' || (feedFilter === 'buys' ? s.side === 'buying' : s.side === 'selling'));
  const verb = (s) => (s.side === 'buying' ? (s.kind === 'new' ? 'started buying' : 'piled into') : s.side === 'selling' ? 'dumped' : 'split on');
  $('#screen').innerHTML = `<div class="chips">${[['all', 'All'], ['buys', 'Buys'], ['dumps', 'Dumps']].map(([k, n]) => `<button data-f="${k}" class="${feedFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${shown.length ? shown.map((s) => {
      const mv = s.market_cap_usd && s.market_cap_now ? (s.market_cap_now / s.market_cap_usd - 1) * 100 : null;
      return `<div class="ev" data-token="${s.token}">${icon(s, 'sm')}<div><div class="what"><b>${s.voters} smart wallets</b> <span class="${tone(s.score)}">${verb(s)}</span> <b>$${esc(s.symbol)}</b></div>
        <div class="when">${ago(s.at)} · hive ${signed(s.score)}</div></div><div class="move ${mv == null ? 'flat' : mv >= 0 ? 'up' : 'down'}">${mv == null ? '–' : `${mv >= 0 ? '+' : ''}${Math.round(mv)}%`}</div></div>`;
    }).join('') : `<div class="empty">Nothing in this filter today.</div>`}
    <div class="muted" style="font-size:11px;margin-top:12px">Public feed, ${esc(b.delay ?? '30 minutes')} delayed. % is the market cap move since the signal.</div>`;
  for (const c of document.querySelectorAll('.chips button')) c.onclick = () => { feedFilter = c.dataset.f; feed(); };
}

// ---------- Token ----------
const arc = (cx, cy, r, from, sweep) => {
  const p = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = p(from), [x1, y1] = p(from + Math.max(0.5, sweep));
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
async function token() {
  const want = picked ?? (await tabToken());
  if (!want) {
    const best = (await liveTokens()).sort((a, b) => b.score - a.score)[0];
    if (!best) { $('#screen').innerHTML = `<div class="empty">Open a token on Pons or DexScreener, or pick one on Radar.</div>`; return; }
    picked = { token: best.token };
    return token();
  }
  const r = await ask({ type: 'hive', token: want.token, pair: want.pair });
  if (current !== 'token') return;
  if (!r.ok || !r.token) { $('#screen').innerHTML = `<div class="empty">This token is not on Overmind's index yet.</div>`; return; }
  const c = r.consensus, f = r.safety, has = c && c.voters >= MIN_VOTERS, s = has ? Math.round(c.score) : 0;
  const [rl, rc, rf] = RISK[f?.risk] ?? ['Not checked', '#8b8b96', 0];
  const fromTab = !picked;
  const reasons = (f?.reasons ?? []).slice(0, 2).map((x) => esc(x.text)).join(' · ');
  $('#screen').innerHTML = `<div class="stack">
    <div class="tokhead">${icon(c ?? { symbol: '?' }, 'sm')}<span class="t">${c?.symbol ? `$${esc(c.symbol)}` : `${r.token.slice(0, 6)}…${r.token.slice(-4)}`}</span><span class="pill">${fromTab ? 'This tab' : money(c?.market_cap_usd)}</span></div>
    <div class="gauge"><svg viewBox="0 0 248 200">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#f87171"/><stop offset=".5" stop-color="#8b8b96"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs>
      <path d="${arc(124, 118, 100, 135, 270)}" stroke="#1c1c23" stroke-width="16" fill="none" stroke-linecap="round"/>
      ${has ? `<path d="${arc(124, 118, 100, 135, ((s + 100) / 200) * 270)}" stroke="url(#gg)" stroke-width="16" fill="none" stroke-linecap="round"/>` : ''}
      <path d="${arc(124, 118, 80, 135, 270)}" stroke="#1c1c23" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${rf ? `<path d="${arc(124, 118, 80, 135, 270 * rf)}" stroke="${rc}" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}</svg>
      <div class="center">${has ? `<div class="score ${tone(s)}">${signed(s)}</div><div class="verdict ${tone(s)}">${verdict(s)}</div>` : `<div class="score flat" style="font-size:30px">No score</div><div class="verdict flat">${c ? c.smart_buyers + c.smart_sellers : 0} smart wallets in 24h</div>`}</div></div>
    <div class="stats3"><div class="stat"><div class="label">Buying</div><div class="v up">${c?.smart_buyers ?? 0}</div></div><div class="stat"><div class="label">Selling</div><div class="v down">${c?.smart_sellers ?? 0}</div></div><div class="stat"><div class="label">Mcap</div><div class="v">${money(c?.market_cap_usd)}</div></div></div>
    <div class="card"><div class="risk"><span class="dot" style="background:${rc}"></span><b>${rl}</b><span class="muted" style="margin-left:auto;font-size:12px">inner ring</span></div>
      ${f ? `<div class="why">Top 10 hold ${Math.round(f.top10Pct ?? 0)}% · snipers ${Math.round(f.snipersPct ?? 0)}% · bundle ${Math.round(f.bundledPct ?? 0)}% · dev rugs ${f.dev?.rugs ?? 0}${reasons ? `<br>${reasons}` : ''}</div>` : ''}</div>
    <div class="card ai" id="ai"><div class="risk"><b>Overmind AI</b></div><button class="btn ghost" id="explain" style="width:100%;margin-top:12px">Explain this token</button></div>
    <div class="grid2"><a class="btn primary" href="${pons(r.token)}">Open on Pons</a><a class="btn ghost" href="https://overmind.ink/token/${r.token}?ref=extension">Full read</a></div></div>`;
  $('#explain').onclick = async () => {
    $('#ai').innerHTML = `<div class="risk"><b>Overmind AI</b></div><div class="muted" style="margin-top:10px">Reading the chain…</div>`;
    const a = await ask({ type: 'explain', token: r.token });
    $('#ai').innerHTML = `<div class="risk"><b>Overmind AI</b><span class="muted" style="margin-left:auto;font-size:11px">data, not advice</span></div><div style="margin-top:10px">${
      a.ok && a.text ? a.text.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('') : '<p class="muted">Busy right now. Try again in a minute.</p>'}</div>`;
  };
}

// ---------- Wallet DNA sheet ----------
function dnaSheet(prefill) {
  $('#sheet').hidden = false;
  $('#sheetBody').innerHTML = `<div class="handle"></div><div class="label">Wallet DNA</div>
    <label class="search" style="margin-top:12px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input id="w" placeholder="Paste a wallet address" spellcheck="false" value="${esc(prefill)}"></label>
    <div id="dnaRes" style="margin-top:12px"></div>`;
  const run = async () => {
    const w = $('#w').value.trim().match(/0x[0-9a-fA-F]{40}/)?.[0]?.toLowerCase();
    if (!w) return;
    $('#dnaRes').innerHTML = `<div class="muted">Reading ${w.slice(0, 6)}…${w.slice(-4)}…</div>`;
    const d = await ask({ type: 'dna', wallet: w });
    if (!d.ok || !d.archetype) { $('#dnaRes').innerHTML = `<div class="muted">Not enough trades to read this wallet.</div>`; return; }
    const s = d.stats;
    $('#dnaRes').innerHTML = `<div class="dnaname">${esc(d.archetype.name)}</div><div class="muted">${esc(d.archetype.line)}</div>
      <div class="stats3" style="margin-top:14px"><div class="stat"><div class="label">Win rate</div><div class="v">${s.closed ? Math.round(s.winRate * 100) + '%' : '–'}</div></div><div class="stat"><div class="label">Realized</div><div class="v ${s.realizedUsd >= 0 ? 'up' : 'down'}">${money(s.realizedUsd)}</div></div><div class="stat"><div class="label">Trades</div><div class="v">${s.trades ?? '–'}</div></div></div>
      ${d.traits.length ? `<div class="traits">${d.traits.slice(0, 5).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
      <a class="btn primary" style="width:100%;margin-top:14px" href="https://overmind.ink/dna/${w}?ref=extension">Full DNA on overmind.ink</a>`;
  };
  $('#w').addEventListener('keydown', (e) => e.key === 'Enter' && run());
  $('#w').focus();
  if (prefill) run();
}
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').hidden = true; });

// open on the Token screen when this tab is a token page, otherwise on Home
tabToken().then((t) => go(t ? 'token' : 'home'));
