// Overmind badge on Pons and DexScreener token pages: the hive score of the token on screen, from api.overmind.ink.
// Rendered in a shadow root so the page's styles never touch it (and it never touches theirs).
(() => {
  const MIN_VOTERS = 3; // same rule as overmind.ink: fewer smart wallets or calls than this is no reading
  const REFRESH_MS = 30_000;
  const ADDR = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;
  const PAIR = /0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}/;

  /** Which token this page is about: Pons puts the token in the URL, DexScreener the pair. */
  function target() {
    const { hostname, pathname } = location;
    if (hostname.endsWith('ponsfamily.com')) {
      const m = pathname.match(ADDR);
      return m ? { token: m[0].toLowerCase(), key: m[0].toLowerCase() } : null;
    }
    if (hostname === 'dexscreener.com' && pathname.startsWith('/robinhood/')) {
      const m = pathname.slice('/robinhood/'.length).match(PAIR);
      return m ? { pair: m[0].toLowerCase(), key: m[0].toLowerCase() } : null;
    }
    return null;
  }

  const verdict = (s) => (s >= 60 ? 'Smart money is buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Smart money is selling');
  const color = (s) => (s >= 20 ? '#3ddc97' : s > -20 ? '#c9c9d2' : '#ff5d6c');
  const plural = (n, w) => `${n} smart ${w}${n === 1 ? '' : 's'}`;

  const CSS = `
    :host { all: initial; }
    .card { position: fixed; z-index: 2147483000; width: 252px; box-sizing: border-box;
      font: 13px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #ececf1;
      background: rgba(12,12,16,.94); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.1);
      border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.5); padding: 10px 12px 11px; }
    .card.in { animation: in .35s cubic-bezier(.16,1,.3,1) both; }
    @keyframes in { from { opacity: 0; transform: translateY(-8px); } }
    .top { display: flex; align-items: center; gap: 8px; cursor: grab; user-select: none; } .top:active { cursor: grabbing; }
    .logo { width: 22px; height: 22px; border-radius: 50%; background: #e6e5e0; display: grid; place-items: center; flex: none; }
    .brand { font-weight: 700; letter-spacing: -.01em; }
    .tag { font: 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .12em; color: rgba(236,236,241,.5); }
    .x { margin-left: auto; background: none; border: 0; color: rgba(236,236,241,.5); font-size: 16px; cursor: pointer; padding: 0 2px; }
    .x:hover { color: #fff; }
    .row { display: flex; align-items: baseline; gap: 10px; margin-top: 7px; }
    .score { font: 700 28px/1 ui-monospace, Menlo, monospace; letter-spacing: -.04em; }
    .verdict { font-weight: 600; font-size: 14px; }
    .sub { margin-top: 6px; color: rgba(236,236,241,.65); font-size: 12px; }
    .bar { position: relative; height: 4px; margin-top: 10px; border-radius: 2px; background: linear-gradient(90deg,#ff5d6c,#3a3a44 50%,#3ddc97); }
    .bar i { position: absolute; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.6); transform: translateX(-50%); }
    a.open { text-decoration: none; font-weight: 600; font-size: 11px; color: #ececf1; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 3px 9px; }
    a.open:hover { background: rgba(255,255,255,.1); }
    .muted { color: rgba(236,236,241,.6); }
    .mini { position: fixed; z-index: 2147483000; width: 38px; height: 38px; border-radius: 50%;
      background: #e6e5e0; border: 0; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.45); display: grid; place-items: center; }
  `;
  const LOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c1c1e" stroke-width="9"/><circle cx="50" cy="50" r="21" fill="none" stroke="#1c1c1e" stroke-width="9"/><circle cx="50" cy="50" r="7" fill="#1c1c1e"/></svg>`;

  let host, root, current = null, timer = null, collapsed = false, pos = null, dragging = false, pending = null;
  const DEFAULT = location.hostname === 'dexscreener.com' ? { top: 108, right: 352 } : { top: 14, right: 24 };
  try { pos = JSON.parse(localStorage.getItem('overmind-pos') || 'null'); } catch {}
  const place = (el) => { const p = pos ?? DEFAULT; el.style.top = Math.max(0, Math.min(innerHeight - 60, p.top)) + 'px'; el.style.right = Math.max(0, Math.min(innerWidth - 60, p.right)) + 'px'; };
  function draggable(el, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId); dragging = true;
      const move = (ev) => { pos = { top: ev.clientY - dy, right: innerWidth - (ev.clientX - dx) - r.width }; place(el); };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); dragging = false; try { localStorage.setItem('overmind-pos', JSON.stringify(pos)); } catch {} if (pending) { const st = pending; pending = null; render(st); } };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }
  try { collapsed = sessionStorage.getItem('overmind-collapsed') === '1'; } catch {}

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('overmind-badge');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(host);
  }
  function unmount() { host?.remove(); host = null; current = null; clearInterval(timer); timer = null; }

  function render(state) {
    // a refresh that lands mid-drag waits until the card is dropped, so it never jumps back
    if (dragging) { pending = state; return; }
    mount();
    if (collapsed) {
      root.innerHTML = `<style>${CSS}</style><button class="mini" title="Show Overmind">${LOGO(22)}</button>`;
      place(root.querySelector('.mini')); root.querySelector('.mini').onclick = () => { collapsed = false; try { sessionStorage.removeItem('overmind-collapsed'); } catch {} render(state); };
      return;
    }
    const link = state.token ? `https://overmind.ink/token/${state.token}?ref=extension` : 'https://overmind.ink/?ref=extension';
    let body;
    if (state.loading) body = `<div class="sub muted">Reading the hive…</div>`;
    else if (state.error) body = `<div class="sub muted">Overmind is not reachable right now.</div>`;
    else if (!state.token) body = `<div class="sub muted">This token is not on Robinhood Chain's index yet.</div>`;
    else {
      const c = state.consensus;
      const traded = c ? c.smart_buyers + c.smart_sellers : 0;
      if (!c || c.voters < MIN_VOTERS) {
        body = `<div class="row"><span class="verdict">Not enough smart money yet</span></div>
          <div class="sub">${traded ? `Only ${plural(traded, 'wallet')} traded it` : 'No smart wallet traded it'} in the last 24 hours.</div>`;
      } else {
        const s = Math.round(c.score), col = color(s);
        const calls = c.bullish_calls + c.bearish_calls;
        body = `<div class="row"><span class="score" style="color:${col}">${s > 0 ? '+' : ''}${s}</span><span class="verdict" style="color:${col}">${verdict(s)}</span></div>
          <div class="bar"><i style="left:${(s + 100) / 2}%"></i></div>
          <div class="sub">${plural(c.smart_buyers, 'wallet')} buying · ${c.smart_sellers} selling${calls ? ` · ${calls} call${calls === 1 ? '' : 's'}` : ''} (24h)</div>`;
      }
    }
    root.innerHTML = `<style>${CSS}</style>
      <div class="card ${state.fresh ? 'in' : ''}">
        <div class="top"><span class="logo">${LOGO(16)}</span><span class="brand">Overmind</span><span class="tag">HIVE</span>
          <a class="open" href="${link}" target="_blank" rel="noopener" style="margin-left:auto">Open ↗</a><button class="x" title="Minimise" style="margin-left:4px">–</button></div>
        ${body}
      </div>`;
    const card = root.querySelector('.card'); place(card); draggable(card, root.querySelector('.top'));
    root.querySelector('.x').onclick = () => { collapsed = true; try { sessionStorage.setItem('overmind-collapsed', '1'); } catch {} render(state); };
  }

  function load(t, fresh) {
    chrome.runtime.sendMessage({ type: 'hive', token: t.token, pair: t.pair }, (res) => {
      if (chrome.runtime.lastError || !res) return render({ error: true, fresh });
      if (current !== t.key) return; // the user moved on to another token meanwhile
      if (!res.ok) return render({ error: true, token: t.token, fresh });
      render({ token: res.token, consensus: res.consensus, fresh });
    });
  }

  function check() {
    const t = target();
    if (!t) { if (current) unmount(); return; }
    if (t.key === current) return;
    current = t.key;
    clearInterval(timer);
    render({ loading: true, token: t.token, fresh: true });
    load(t, true);
    timer = setInterval(() => load(t, false), REFRESH_MS);
  }

  // Both sites are single-page apps: watch the URL instead of waiting for page loads.
  check();
  setInterval(check, 800);
})();
