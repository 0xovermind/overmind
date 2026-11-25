// Overmind on Pons and DexScreener token pages:
//  - a card with four tabs: the hive score, the safety check, smart wallets holding the token, and Overmind AI's read;
//  - labels on every wallet in the page's trade and holder lists: smart money (with its rank), the dev, launch snipers;
//  - Wallet DNA when you hover a wallet.
// The card and the hover card live in a closed shadow root, so the page's styles never touch them; the small wallet
// labels are inserted next to the page's own wallet links.
(() => {
  const MIN_VOTERS = 3; // same rule as overmind.ink: fewer smart wallets or calls than this is no reading
  const REFRESH_MS = 30_000;
  const ADDR = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;
  const PAIR = /0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}/;
  const PONS = location.hostname.endsWith('ponsfamily.com');

  /** Which token this page is about: Pons puts the token in the URL, DexScreener the pair. */
  function target() {
    const { hostname, pathname } = location;
    if (PONS) {
      if (!pathname.includes('/launchpad/')) return null;
      const m = pathname.match(ADDR);
      return m ? { token: m[0].toLowerCase(), key: m[0].toLowerCase() } : null;
    }
    if (hostname === 'dexscreener.com' && pathname.startsWith('/robinhood/')) {
      const m = pathname.slice('/robinhood/'.length).match(PAIR);
      return m ? { pair: m[0].toLowerCase(), key: m[0].toLowerCase() } : null;
    }
    return null;
  }

  const ask = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError || !r ? { ok: false } : r)); } catch { resolve({ ok: false }); }
  });
  const verdict = (s) => (s >= 60 ? 'Smart money is buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Smart money is selling');
  const color = (s) => (s >= 20 ? '#3ddc97' : s > -20 ? '#c9c9d2' : '#ff5d6c');
  const plural = (n, w) => `${n} smart ${w}${n === 1 ? '' : 's'}`;
  const pct = (n) => (n == null ? '–' : `${Math.round(n * 10) / 10}%`);
  const usd = (n) => (n == null ? '–' : `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`);
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const RISK = { low: ['LOW RISK', '#3ddc97'], medium: ['MEDIUM RISK', '#ffb547'], high: ['HIGH RISK', '#ff5d6c'] };

  const CSS = `
    :host { all: initial; }
    .card { position: fixed; z-index: 2147483000; width: 272px; box-sizing: border-box;
      font: 13px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #ececf1;
      background: rgba(12,12,16,.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.1);
      border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.5); padding: 10px 12px 11px; }
    .card.in { animation: in .35s cubic-bezier(.16,1,.3,1) both; }
    @keyframes in { from { opacity: 0; transform: translateY(-8px); } }
    .top { display: flex; align-items: center; gap: 8px; cursor: grab; user-select: none; } .top:active { cursor: grabbing; }
    .logo { width: 22px; height: 22px; border-radius: 50%; background: #e6e5e0; display: grid; place-items: center; flex: none; }
    .brand { font-weight: 700; letter-spacing: -.01em; }
    .tag { font: 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .12em; color: rgba(236,236,241,.5); }
    .x { background: none; border: 0; color: rgba(236,236,241,.5); font-size: 16px; cursor: pointer; padding: 0 2px; margin-left: 4px; }
    .x:hover { color: #fff; }
    a.open { margin-left: auto; text-decoration: none; font-weight: 600; font-size: 11px; color: #ececf1; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 3px 9px; }
    a.open:hover { background: rgba(255,255,255,.1); }
    .tabs { display: flex; gap: 2px; margin-top: 9px; padding: 2px; border-radius: 9px; background: rgba(255,255,255,.05); }
    .tabs button { flex: 1; border: 0; background: none; color: rgba(236,236,241,.6); font: 600 11px/1 Inter, system-ui, sans-serif; padding: 6px 0; border-radius: 7px; cursor: pointer; }
    .tabs button.on { background: rgba(255,255,255,.12); color: #fff; }
    .tabs button:hover:not(.on) { color: #fff; }
    .tabs .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-left: 4px; vertical-align: 1px; }
    .pane { margin-top: 9px; min-height: 64px; }
    .row { display: flex; align-items: baseline; gap: 10px; }
    .score { font: 700 28px/1 ui-monospace, Menlo, monospace; letter-spacing: -.04em; }
    .verdict { font-weight: 600; font-size: 14px; }
    .sub { margin-top: 6px; color: rgba(236,236,241,.65); font-size: 12px; }
    .bar { position: relative; height: 4px; margin-top: 10px; border-radius: 2px; background: linear-gradient(90deg,#ff5d6c,#3a3a44 50%,#3ddc97); }
    .bar i { position: absolute; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.6); transform: translateX(-50%); }
    .muted { color: rgba(236,236,241,.6); }
    .risk { display: flex; align-items: center; gap: 8px; }
    .chip { font: 700 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .08em; padding: 4px 7px; border-radius: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-top: 8px; font-size: 11.5px; }
    .grid span { color: rgba(236,236,241,.55); display: flex; justify-content: space-between; }
    .grid b { font: 600 11.5px ui-monospace, Menlo, monospace; color: #ececf1; }
    .why { margin-top: 6px; font-size: 11.5px; line-height: 1.35; color: rgba(236,236,241,.82); }
    .why i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
    .list { margin-top: 6px; }
    .list a { display: flex; justify-content: space-between; gap: 8px; padding: 5px 6px; margin: 0 -6px; border-radius: 7px; color: #ececf1; text-decoration: none; font: 11.5px ui-monospace, Menlo, monospace; }
    .list a:hover { background: rgba(255,255,255,.07); }
    .list .r { color: #3ddc97; }
    .ai { font-size: 12px; line-height: 1.45; color: rgba(236,236,241,.86); max-height: 230px; overflow-y: auto; padding-right: 4px; }
    .ai p { margin: 0 0 6px; }
    .btn { display: block; width: 100%; margin-top: 4px; border: 0; border-radius: 9px; padding: 8px; font: 600 12px Inter, system-ui, sans-serif; background: #ececf1; color: #0b0b0f; cursor: pointer; }
    .btn:hover { background: #fff; }
    .legend { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); display: flex; gap: 6px; flex-wrap: wrap; font-size: 10.5px; color: rgba(236,236,241,.55); }
    .mini { position: fixed; z-index: 2147483000; width: 38px; height: 38px; border-radius: 50%;
      background: #e6e5e0; border: 0; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.45); display: grid; place-items: center; }
    .tip { position: fixed; z-index: 2147483001; width: 250px; box-sizing: border-box; pointer-events: none;
      font: 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; color: #ececf1; background: rgba(12,12,16,.97);
      border: 1px solid rgba(255,255,255,.12); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.55); padding: 10px 12px; }
    .tip .name { font-weight: 700; font-size: 14px; } .tip .line { color: rgba(236,236,241,.7); margin-top: 2px; }
    .traits { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
    .traits span { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.08); }
  `;
  const LOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c1c1e" stroke-width="9"/><circle cx="50" cy="50" r="21" fill="none" stroke="#1c1c1e" stroke-width="9"/><circle cx="50" cy="50" r="7" fill="#1c1c1e"/></svg>`;
  // the labels put next to the page's wallet links (plain inline styles: they live in the page's DOM)
  const BADGE = {
    smart: (r) => [`🧠 #${r.rank}`, '#3ddc97', `Overmind smart money: #${r.rank} of the most profitable wallets on Robinhood Chain (${usd(r.realizedUsd)} realized)`],
    dev: () => ['DEV', '#ff5d6c', 'The wallet that deployed this token'],
    sniper: () => ['SNIPER', '#ffb547', 'Bought this token in its launch seconds'],
  };

  // ---------- state ----------
  let host, root, current = null, token = null, timer = null, collapsed = false, pos = null, dragging = false, pending = null;
  let tab = null, state = {}, wallets = null, ai = null, labels = { smart: {}, snipers: new Set() }, labelsFor = null;
  const DEFAULT = PONS ? { top: 14, right: 24 } : { top: 108, right: 352 };
  try { pos = JSON.parse(localStorage.getItem('overmind-pos') || 'null'); } catch {}
  try { collapsed = sessionStorage.getItem('overmind-collapsed') === '1'; } catch {}
  const place = (el) => { const p = pos ?? DEFAULT; el.style.top = Math.max(0, Math.min(innerHeight - 60, p.top)) + 'px'; el.style.right = Math.max(0, Math.min(innerWidth - 60, p.right)) + 'px'; };

  function draggable(el, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId); dragging = true;
      const move = (ev) => { pos = { top: ev.clientY - dy, right: innerWidth - (ev.clientX - dx) - r.width }; place(el); };
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); dragging = false;
        try { localStorage.setItem('overmind-pos', JSON.stringify(pos)); } catch {}
        if (pending) { pending = null; render(); }
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }
  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('overmind-badge');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(host);
  }
  function unmount() { host?.remove(); host = null; current = null; token = null; clearInterval(timer); timer = null; }

  // ---------- card panes ----------
  function hivePane() {
    const c = state.consensus, traded = c ? c.smart_buyers + c.smart_sellers : 0;
    if (!c || c.voters < MIN_VOTERS)
      return `<div class="row"><span class="verdict">Not enough smart money yet</span></div>
        <div class="sub">${traded ? `Only ${plural(traded, 'wallet')} traded it` : 'No smart wallet traded it'} in 24h. A score needs ${MIN_VOTERS}. Check the Safety tab.</div>`;
    const s = Math.round(c.score), col = color(s), calls = c.bullish_calls + c.bearish_calls;
    return `<div class="row"><span class="score" style="color:${col}">${s > 0 ? '+' : ''}${s}</span><span class="verdict" style="color:${col}">${verdict(s)}</span></div>
      <div class="bar"><i style="left:${(s + 100) / 2}%"></i></div>
      <div class="sub">${plural(c.smart_buyers, 'wallet')} buying · ${c.smart_sellers} selling${calls ? ` · ${calls} call${calls === 1 ? '' : 's'}` : ''} (24h)</div>`;
  }
  function safetyPane() {
    const f = state.safety;
    if (!f) return `<div class="sub muted">No safety check for this token yet.</div>`;
    const [label, col] = RISK[f.risk] ?? ['NOT CHECKED', '#c9c9d2'];
    const reasons = (f.reasons ?? []).slice(0, 3)
      .map((r) => `<div class="why"><i style="background:${r.level === 'high' ? '#ff5d6c' : '#ffb547'}"></i>${esc(r.text)}</div>`).join('');
    return `<div class="risk"><span class="chip" style="color:${col};background:${col}1f">${label}</span><span class="tag">SAFETY CHECK</span></div>
      <div class="grid"><span>Top 10 hold <b>${pct(f.top10Pct)}</b></span><span>Snipers <b>${pct(f.snipersPct)}</b></span>
        <span>Launch bundle <b>${pct(f.bundledPct)}</b></span><span>Dev holds <b>${pct(f.devPct)}</b></span>
        <span>Dev rugs <b>${f.dev?.rugs ?? '–'}</b></span><span>Holders <b>${f.holders ?? '–'}</b></span></div>${reasons || `<div class="why muted">No red flags in holders, bundles or dev history.</div>`}`;
  }
  function walletsPane() {
    if (!wallets) return `<div class="sub muted">Reading the holders…</div>`;
    if (wallets.error) return `<div class="sub muted">Holders are not available right now.</div>`;
    const list = wallets.smartHolders.slice(0, 6).map((w) =>
      `<a href="https://overmind.ink/dna/${w.wallet}?ref=extension" target="_blank" rel="noopener"><span>🧠 #${w.rank} ${short(w.wallet)}</span><span class="r">${pct(w.pct)}</span></a>`).join('');
    return `<div class="row"><span class="verdict">${wallets.smartHolders.length ? `${wallets.smartHolders.length} smart wallet${wallets.smartHolders.length === 1 ? '' : 's'} hold it` : 'No smart wallet holds it'}</span></div>
      <div class="sub">Among the top ${wallets.holders} holders. Smart, dev and sniper wallets are also labelled in the page's lists.</div>
      ${list ? `<div class="list">${list}</div>` : ''}`;
  }
  function aiPane() {
    if (!ai) return `<div class="sub">A plain-English read of this token from on-chain data: hive, risk, holders, recent signals.</div><button class="btn" data-ai>Explain this token</button>`;
    if (ai.loading) return `<div class="sub muted">Overmind AI is reading the chain…</div>`;
    if (ai.error) return `<div class="sub muted">Overmind AI is busy. Try again in a minute.</div><button class="btn" data-ai>Try again</button>`;
    const paras = ai.text.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('');
    return `<div class="ai">${paras}</div><div class="sub" style="font-size:10.5px">Overmind AI · data, not advice</div>`;
  }

  function render() {
    if (dragging) { pending = true; return; }
    mount();
    if (collapsed) {
      root.innerHTML = `<style>${CSS}</style><button class="mini" title="Show Overmind">${LOGO(22)}</button>`;
      place(root.querySelector('.mini'));
      root.querySelector('.mini').onclick = () => { collapsed = false; try { sessionStorage.removeItem('overmind-collapsed'); } catch {} render(); };
      return;
    }
    const link = token ? `https://overmind.ink/token/${token}?ref=extension` : 'https://overmind.ink/?ref=extension';
    let body;
    if (state.loading) body = `<div class="pane"><div class="sub muted">Reading the hive…</div></div>`;
    else if (state.error) body = `<div class="pane"><div class="sub muted">Overmind is not reachable right now.</div></div>`;
    else if (!token) body = `<div class="pane"><div class="sub muted">This token is not on Robinhood Chain's index yet.</div></div>`;
    else {
      const hasScore = state.consensus && state.consensus.voters >= MIN_VOTERS;
      tab = tab ?? (hasScore ? 'hive' : 'safety');
      const riskCol = (RISK[state.safety?.risk] ?? [])[1];
      const s = hasScore ? Math.round(state.consensus.score) : null;
      const tabs = [['hive', 'Hive', hasScore ? color(s) : null], ['safety', 'Safety', riskCol], ['wallets', 'Wallets', null], ['ai', 'AI', null]]
        .map(([id, name, dot]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${name}${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}</button>`).join('');
      const pane = { hive: hivePane, safety: safetyPane, wallets: walletsPane, ai: aiPane }[tab]();
      body = `<div class="tabs">${tabs}</div><div class="pane">${pane}</div>
        <div class="legend"><span style="color:#3ddc97">🧠 smart money</span>·<span style="color:#ff5d6c">DEV</span>·<span style="color:#ffb547">SNIPER</span><span>labelled on the page</span></div>`;
    }
    root.innerHTML = `<style>${CSS}</style>
      <div class="card ${state.fresh ? 'in' : ''}">
        <div class="top"><span class="logo">${LOGO(16)}</span><span class="brand">Overmind</span>
          <a class="open" href="${link}" target="_blank" rel="noopener">Open ↗</a><button class="x" title="Minimise">–</button></div>
        ${body}
      </div>
      <div class="tip" hidden></div>`;
    state.fresh = false;
    const card = root.querySelector('.card'); place(card); draggable(card, root.querySelector('.top'));
    root.querySelector('.x').onclick = () => { collapsed = true; try { sessionStorage.setItem('overmind-collapsed', '1'); } catch {} render(); };
    for (const b of root.querySelectorAll('[data-tab]')) b.onclick = () => { tab = b.dataset.tab; if (tab === 'wallets' && !wallets) loadWallets(); render(); };
    const aiBtn = root.querySelector('[data-ai]'); if (aiBtn) aiBtn.onclick = loadAi;
  }

  // ---------- data ----------
  async function load(t, fresh) {
    const res = await ask({ type: 'hive', token: t.token, pair: t.pair });
    if (current !== t.key) return; // the user moved on to another token meanwhile
    if (!res.ok) { state = { error: true, fresh }; return render(); }
    token = res.token;
    state = { consensus: res.consensus, safety: res.safety, deployer: res.deployer, fresh };
    render();
    if (token && labelsFor !== token) { labelsFor = token; loadLabels(); }
  }
  async function loadWallets() {
    const k = token; wallets = null;
    const r = await ask({ type: 'wallets', token: k });
    if (k !== token) return;
    wallets = r.ok ? r : { error: true }; render();
  }
  async function loadAi() {
    const k = token; ai = { loading: true }; render();
    const r = await ask({ type: 'explain', token: k });
    if (k !== token) return;
    ai = r.ok && r.text ? { text: r.text } : { error: true }; render();
  }
  async function loadLabels() {
    const k = token;
    const r = await ask({ type: 'labels', token: k });
    if (k !== token || !r.ok) return;
    labels = { smart: r.smart ?? {}, snipers: new Set(r.snipers ?? []) };
    scan(true);
  }

  // ---------- wallet labels on the page ----------
  /** The page's own links to wallets: Pons profiles, and explorer addresses in DexScreener's trade and holder rows. */
  function walletLinks() {
    const out = [];
    const sel = PONS ? 'a[href*="/profile/0x"]' : 'tr a[href*="/address/0x"]';
    for (const a of document.querySelectorAll(sel)) {
      const m = a.getAttribute('href').match(ADDR);
      if (m) out.push([a, m[0].toLowerCase()]);
    }
    return out;
  }
  function labelFor(w) {
    if (state.deployer && w === state.deployer) return BADGE.dev();
    const s = labels.smart[w]; if (s) return BADGE.smart(s);
    if (labels.snipers.has(w)) return BADGE.sniper();
    return null;
  }
  function scan(redo) {
    if (!token) return;
    for (const [a, w] of walletLinks()) {
      if (!a.dataset.omHover) { a.dataset.omHover = '1'; a.addEventListener('mouseenter', () => hoverWallet(a, w)); a.addEventListener('mouseleave', hideTip); }
      if (a.dataset.omLabel === w && !redo) continue;
      a.nextElementSibling?.classList?.contains('om-label') && a.nextElementSibling.remove();
      a.dataset.omLabel = w;
      const l = labelFor(w);
      if (!l) continue;
      const [text, col, title] = l;
      const span = document.createElement('span');
      span.className = 'om-label'; span.textContent = text; span.title = title;
      span.style.cssText = `display:inline-block;margin-left:5px;padding:1px 5px;border-radius:5px;font:700 10px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.02em;vertical-align:1px;white-space:nowrap;color:${col};background:${col}22;border:1px solid ${col}55`;
      a.insertAdjacentElement('afterend', span);
    }
  }

  // ---------- Wallet DNA on hover ----------
  let tipTimer = null, tipFor = null;
  const dnaCache = new Map();
  function hideTip() { clearTimeout(tipTimer); tipFor = null; const t = root?.querySelector('.tip'); if (t) t.hidden = true; }
  function hoverWallet(a, w) {
    clearTimeout(tipTimer); tipFor = w;
    tipTimer = setTimeout(async () => {
      if (!root || tipFor !== w) return;
      const t = root.querySelector('.tip'); if (!t) return;
      const r = a.getBoundingClientRect();
      t.style.left = Math.min(innerWidth - 262, Math.max(8, r.left)) + 'px';
      t.style.top = (r.bottom + 170 > innerHeight ? r.top - 150 : r.bottom + 6) + 'px';
      t.innerHTML = `<div class="tag">WALLET DNA · OVERMIND</div><div class="line">Reading ${short(w)}…</div>`; t.hidden = false;
      let d = dnaCache.get(w);
      if (!d) { d = await ask({ type: 'dna', wallet: w }); if (d.ok) dnaCache.set(w, d); }
      if (tipFor !== w) return;
      if (!d.ok || !d.archetype) { t.innerHTML = `<div class="tag">WALLET DNA · OVERMIND</div><div class="line">Not enough trades to read this wallet.</div>`; return; }
      const st = d.stats, s = labels.smart[w];
      t.innerHTML = `<div class="tag">WALLET DNA · OVERMIND${s ? ` · 🧠 #${s.rank}` : ''}</div>
        <div class="name">${esc(d.archetype.name)}</div><div class="line">${esc(d.archetype.line ?? '')}</div>
        <div class="grid"><span>Win rate <b>${st.closed ? Math.round(st.winRate * 100) + '%' : '–'}</b></span><span>Realized <b>${usd(st.realizedUsd)}</b></span>
          <span>Tokens <b>${st.tokens ?? '–'}</b></span><span>Trades <b>${st.trades ?? '–'}</b></span></div>
        ${d.traits.length ? `<div class="traits">${d.traits.slice(0, 4).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`;
    }, 350);
  }

  // ---------- page watching ----------
  function check() {
    const t = target();
    if (!t) { if (current) unmount(); return; }
    if (t.key !== current) {
      current = t.key; token = t.token ?? null; tab = null; wallets = null; ai = null; labels = { smart: labels.smart, snipers: new Set() };
      clearInterval(timer);
      state = { loading: true, fresh: true }; render();
      load(t, true);
      timer = setInterval(() => load(t, false), REFRESH_MS);
    }
    scan(false);
  }
  // Both sites are single-page apps with live-updating lists: re-check the URL and new rows often.
  check();
  setInterval(check, 1000);
})();
