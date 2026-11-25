// The toolbar window: the token in the current tab (if it is a Pons or DexScreener token page), the hive board
// (what smart money is buying and selling), recent hive signals, and a Wallet DNA lookup.
const API = 'https://api.overmind.ink';
const MIN_VOTERS = 3;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const color = (s) => (s >= 20 ? 'var(--buy)' : s > -20 ? '#c9c9d2' : 'var(--sell)');
const verdict = (s) => (s >= 60 ? 'Smart money is buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Smart money is selling');
const money = (n) => (n == null ? '–' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
const signed = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}`;
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };
// token icons go through overmind.ink's image proxy (it resolves ipfs:// and caches), like on the site
const img = (u) => (u ? `https://overmind.ink/api/img?u=${encodeURIComponent(u)}` : null);
const letter = (t) => esc((t.symbol || '?')[0].toUpperCase());
const icon = (t) => (img(t.image_url) ? `<img src="${esc(img(t.image_url))}" alt="" loading="lazy" data-l="${letter(t)}">` : `<span class="ph">${letter(t)}</span>`);
const RISK = { low: ['LOW RISK', '#3ddc97'], medium: ['MEDIUM RISK', '#ffb547'], high: ['HIGH RISK', '#ff5d6c'] };
const ponsUrl = (a) => `https://ponsfamily.com/launchpad/${a}`;
const ask = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError || !r ? { ok: false } : r)));
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }

// a broken token image falls back to its letter
document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && !t.dataset.f) { t.dataset.f = 1; t.replaceWith(Object.assign(document.createElement('span'), { className: 'ph', textContent: t.dataset.l || '•' })); } }, true);
// links open in a new tab (popups close on navigation)
document.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (a) { e.preventDefault(); chrome.tabs.create({ url: a.href }); } });

let board = null;

// ---------- hero: the token in this tab, or the hive's mood ----------
async function hero() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const url = tab?.url ?? '';
  const pons = url.match(/ponsfamily\.com\/launchpad\/(0x[0-9a-fA-F]{40})/);
  const dex = url.match(/dexscreener\.com\/robinhood\/(0x[0-9a-fA-F]{40,64})/);
  if (pons || dex) {
    const r = await ask({ type: 'hive', token: pons?.[1]?.toLowerCase(), pair: dex?.[1]?.toLowerCase() });
    if (r.ok && r.token) return tokenHero(r);
  }
  moodHero();
}
function tokenHero(r) {
  const c = r.consensus, f = r.safety;
  const name = c?.symbol ? `$${esc(c.symbol)}` : `${r.token.slice(0, 6)}…${r.token.slice(-4)}`;
  const has = c && c.voters >= MIN_VOTERS, s = has ? Math.round(c.score) : 0;
  const [rl, rc] = RISK[f?.risk] ?? ['NOT CHECKED', '#c9c9d2'];
  $('hero').innerHTML = `
    <div class="kicker">THIS TAB</div>
    <div class="tok" style="margin-top:10px">${c ? icon(c) : '<span class="ph"></span>'}<div><b>${name}</b><span>${c?.market_cap_usd ? `mcap ${money(c.market_cap_usd)}` : 'Robinhood Chain'}</span></div></div>
    ${has ? `<div class="big" style="color:${color(s)}">${signed(s)}<small>${verdict(s)}</small></div>
      <div class="meter"><i style="left:${(s + 100) / 2}%"></i></div>
      <div class="subline"><b>${c.smart_buyers}</b> smart wallets buying · <b>${c.smart_sellers}</b> selling (24h)</div>`
    : `<div class="big" style="font-size:22px">No hive score yet</div><div class="subline">${c ? c.smart_buyers + c.smart_sellers : 0} smart wallets traded it in 24h. A score needs ${MIN_VOTERS}.</div>`}
    <div class="chips"><span class="chip" style="color:${rc};background:${rc}1f">${rl}</span>
      ${f ? `<span class="chip" style="color:#c9c9d2;background:rgba(255,255,255,.06)">TOP10 ${Math.round(f.top10Pct ?? 0)}%</span><span class="chip" style="color:#c9c9d2;background:rgba(255,255,255,.06)">SNIPERS ${Math.round(f.snipersPct ?? 0)}%</span>` : ''}</div>
    <a class="open-tok" href="https://overmind.ink/token/${r.token}?ref=extension">Full read on overmind.ink</a>`;
}
async function moodHero() {
  try {
    const [b, st] = await Promise.all([loadBoard(), json(`${API}/stats`)]);
    const live = b.tokens.filter((t) => t.voters >= MIN_VOTERS);
    const buying = live.filter((t) => t.score >= 20).length, selling = live.filter((t) => t.score <= -20).length;
    $('hero').innerHTML = `
      <div class="kicker">THE HIVE · LAST 24H</div>
      <div class="big">${b.smart_wallets ?? 300}<small>smart wallets live</small></div>
      <div class="subline"><b style="color:var(--buy)">${buying}</b> tokens they're buying · <b style="color:var(--sell)">${selling}</b> they're leaving · ${(st.trades_24h ?? 0).toLocaleString('en-US')} trades read today</div>`;
  } catch { $('heroSub').textContent = 'Overmind is not reachable right now.'; }
}

// ---------- views ----------
async function loadBoard() { if (!board) board = json(`${API}/hive?limit=60&scope=pons`); return board; }
async function boardView(side) {
  $('view').innerHTML = `<div class="empty">Reading the hive…</div>`;
  try {
    const b = await loadBoard();
    const rows = b.tokens.filter((t) => t.voters >= MIN_VOTERS && (side === 'buying' ? t.score >= 20 : t.score <= -20))
      .sort((x, y) => (side === 'buying' ? y.score - x.score : x.score - y.score)).slice(0, 25);
    $('view').innerHTML = rows.length
      ? `<div class="note">${side === 'buying' ? 'Where the most profitable wallets are putting money in' : 'What they are dumping'} · Pons · 24h</div>` + rows.map((t) => `
        <a class="row" href="${ponsUrl(t.token)}">${icon(t)}
          <div class="mid"><b>$${esc(t.symbol)}</b><span>${money(t.market_cap_usd)} · ${t.smart_buyers} buying · ${t.smart_sellers} selling</span></div>
          <div class="end"><b style="color:${color(t.score)}">${signed(t.score)}</b><span>hive</span></div></a>`).join('')
      : `<div class="empty">Nothing clear right now. The hive is split.</div>`;
  } catch { $('view').innerHTML = `<div class="empty">Overmind is not reachable right now.</div>`; }
}
async function signalsView() {
  $('view').innerHTML = `<div class="empty">Reading signals…</div>`;
  try {
    const b = await json(`${API}/hive/signals?scope=pons`);
    const rows = (b.signals ?? []).slice(0, 25);
    $('view').innerHTML = `<div class="note">When the smart crowd flips on a token · public feed, ${esc(b.delay ?? '30 minutes')} delayed</div>` + (rows.length ? rows.map((s) => {
      const move = s.market_cap_usd && s.market_cap_now ? ((s.market_cap_now / s.market_cap_usd - 1) * 100) : null;
      return `<a class="row" href="${ponsUrl(s.token)}">${icon(s)}
        <div class="mid"><b>$${esc(s.symbol)} <span style="color:${s.side === 'buying' ? 'var(--buy)' : s.side === 'selling' ? 'var(--sell)' : 'var(--muted)'};font-size:11px;font-weight:700">${esc(String(s.kind === 'new' ? 'NEW · ' : 'FLIP → ') + String(s.side).toUpperCase())}</span></b>
          <span>${ago(s.at)} · score ${signed(s.score)} · ${s.voters} voters</span></div>
        <div class="end"><b style="color:${move == null ? 'var(--muted)' : move >= 0 ? 'var(--buy)' : 'var(--sell)'}">${move == null ? '–' : `${move >= 0 ? '+' : ''}${Math.round(move)}%`}</b><span>since</span></div></a>`;
    }).join('') : `<div class="empty">No signals yet today.</div>`);
  } catch { $('view').innerHTML = `<div class="empty">Overmind is not reachable right now.</div>`; }
}
function dnaView() {
  $('view').innerHTML = `<div class="dna"><input id="w" placeholder="Paste any wallet 0x…" spellcheck="false"><button id="go">Read DNA</button><div id="res"></div></div>`;
  const go = async () => {
    const w = $('w').value.trim().match(/0x[0-9a-fA-F]{40}/)?.[0]?.toLowerCase();
    if (!w) { $('res').innerHTML = `<div class="note">That doesn't look like a wallet address.</div>`; return; }
    $('res').innerHTML = `<div class="note">Reading ${w.slice(0, 6)}…${w.slice(-4)}…</div>`;
    const d = await ask({ type: 'dna', wallet: w });
    if (!d.ok || !d.archetype) { $('res').innerHTML = `<div class="note">Not enough trades to read this wallet.</div>`; return; }
    const s = d.stats;
    $('res').innerHTML = `<div class="res"><div class="kicker">WALLET DNA</div><div class="name">${esc(d.archetype.name)}</div><div class="line">${esc(d.archetype.line)}</div>
      <div class="stats"><div><span>Win rate</span><b>${s.closed ? Math.round(s.winRate * 100) + '%' : '–'}</b></div><div><span>Realized</span><b>${money(s.realizedUsd)}</b></div>
        <div><span>Tokens</span><b>${s.tokens ?? '–'}</b></div><div><span>Trades</span><b>${s.trades ?? '–'}</b></div></div>
      ${d.traits.length ? `<div class="traits">${d.traits.slice(0, 5).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <a class="open-tok" href="https://overmind.ink/dna/${w}?ref=extension">Full DNA + roast on overmind.ink</a></div>`;
  };
  $('go').onclick = go; $('w').addEventListener('keydown', (e) => e.key === 'Enter' && go()); $('w').focus();
}

const views = { buying: () => boardView('buying'), selling: () => boardView('selling'), signals: signalsView, dna: dnaView };
for (const b of document.querySelectorAll('.actions button')) b.onclick = () => {
  for (const x of document.querySelectorAll('.actions button')) x.classList.toggle('on', x === b);
  views[b.dataset.view]();
};
hero();
views.buying();
