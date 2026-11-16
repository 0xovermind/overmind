/*!
 * TokenMap — animated token-flow map (canvas + d3-force), Overmind edition.
 * Needs d3 v7 on the page (or pass it in options).
 *
 *   const map = TokenMap.mount(document.getElementById('map'), flow, { title: '$TOKEN' });
 *   map.play(); map.fit(); map.exportPng(); map.destroy();
 *
 * `flow` is { nodes, edges, events, totalEvents } — see README.md for the exact shape.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TokenMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_COLORS = {
    mint: '#f0f0f0', burn: '#6e727a', pool: '#ffffff', contract: '#a1a4a5',
    deployer: '#ff6465', wallet: '#a1a4a5', others: '#464a4d', cluster: '#ffca16', sniper: '#70b8ff',
    buy: '#3ad389', sell: '#ff6465', move: '#6e727a',
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pctf = v => v === 0 ? '0%' : v < 0.01 ? '<0.01%' : v < 10 ? v.toFixed(2) + '%' : v.toFixed(1) + '%';

  function mount(container, flow, options = {}) {
    const d3 = options.d3 || (typeof window !== 'undefined' && window.d3);
    if (!d3) throw new Error('TokenMap needs d3 v7: load it before token-map.js or pass { d3 }');
    const opts = {
      title: '', subtitle: '',
      explorerUrl: null,            // address => url, or null to hide the link
      replaySeconds: 45,            // full replay length at 1x
      showLegend: true, showReplay: true, showChips: true, showFind: true,
      exportName: 'token-map',
      ...options,
    };
    const COLORS = { ...DEFAULT_COLORS, ...(opts.colors || {}) };
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- DOM ---------- */
    container.classList.add('tm');
    container.innerHTML = `
      <div class="tm-grid"></div>
      <canvas class="tm-canvas"></canvas>
      <div class="tm-hud tm-hud-tl">
        <span class="tm-label">Overmind · Token Map</span>
        <h1 class="tm-title"></h1>
        <div class="tm-sub"></div>
        ${opts.showFind ? '<form class="tm-find"><input placeholder="Find address or label…" spellcheck="false" autocomplete="off"></form>' : ''}
      </div>
      ${opts.showChips ? `<div class="tm-hud tm-hud-tr tm-chips">
        <button class="tm-chip on" data-f="particles"><i style="background:${COLORS.move}"></i>Flow</button>
        <button class="tm-chip on" data-f="labels">Labels</button>
        <button class="tm-chip" data-f="clusters"><i style="background:${COLORS.cluster}"></i>Linked</button>
        <button class="tm-chip" data-f="snipers"><i style="background:${COLORS.sniper}"></i>Snipers</button>
        <button class="tm-chip" data-f="others">Others</button>
        <button class="tm-chip" data-f="fit">Fit ⤢</button>
        <button class="tm-chip" data-f="png">PNG ↓</button>
      </div>` : ''}
      ${opts.showLegend ? `<div class="tm-legend">
        <button class="tm-lg-head" aria-expanded="true"><span class="tm-label">Key</span><span class="tm-lg-hint">hover to highlight</span><span class="tm-lg-chev">⌄</span></button>
        <div class="tm-lg-body">
          ${[['mint', 'Mint', 'tm-sw-tri'], ['pool', 'Pool / DEX', 'tm-sw-dia'], ['contract', 'Contract', 'tm-sw-sq'], ['deployer', 'Dev', 'tm-sw-ring'],
            ['wallet', 'Wallet', ''], ['cluster', 'Linked', 'tm-sw-orbit'], ['sniper', 'Sniper', 'tm-sw-blink']]
            .map(([k, label, cls]) => `<button class="tm-lg-item" data-k="${k}" style="--c:${COLORS[k]}"><i class="tm-sw ${cls}"></i><span>${label}</span><b data-n="${k}">—</b></button>`).join('')}
          <div class="tm-lg-sep"></div>
          <button class="tm-lg-item" data-f="buy" style="--c:${COLORS.buy}"><i class="tm-ln"></i><span>Buys</span><b data-n="buy">—</b></button>
          <button class="tm-lg-item" data-f="sell" style="--c:${COLORS.sell}"><i class="tm-ln tm-ln-rev"></i><span>Sells</span><b data-n="sell">—</b></button>
        </div>
      </div>` : ''}
      ${opts.showReplay ? `<div class="tm-replay">
        <button class="tm-play" aria-label="Play replay"><svg viewBox="0 0 16 16"><path d="M3 1.5v13l11-6.5z" fill="currentColor"/></svg></button>
        <div class="tm-timeline">
          <div class="tm-tl-top"><span>Replay · <b class="tm-tl-block">block 0</b></span><span class="tm-tl-count">0 transfers</span></div>
          <div class="tm-track"><input type="range" class="tm-range" min="0" max="1000" value="1000"><div class="tm-marks"></div></div>
        </div>
        <div class="tm-speed"><button data-s="1">1×</button><button data-s="4" class="on">4×</button><button data-s="16">16×</button></div>
        <div class="tm-mark-tip"></div>
      </div>` : ''}
      <div class="tm-tip"></div>
      <div class="tm-panel"></div>`;
    const q = sel => container.querySelector(sel);
    const canvas = q('.tm-canvas');
    const ctx = canvas.getContext('2d');
    const legend = q('.tm-legend');

    /* ---------- state ---------- */
    let W = 0, H = 0, DPR = 1;
    let G = null, sim = null, fitted = false, settled = false;
    let transform = d3.zoomIdentity;
    let hover = null, selected = null;
    let keyFocus = null, keyPinned = null;
    let raf = 0, last = performance.now(), alive = true;
    const filters = { particles: true, labels: true, clusters: false, snipers: false, others: false };
    const particles = [];
    const flashes = new Map();
    const replay = { playing: false, speed: 4, cursor: 0, block: 0, lastBlock: 0, balances: null, done: true };

    const isMarket = n => n.kind === 'pool' || n.kind === 'contract';
    const flowOf = (a, b) => isMarket(a) && !isMarket(b) ? 'buy' : isMarket(b) && !isMarket(a) ? 'sell' : a.kind === 'mint' ? 'mint' : 'move';
    const kindOf = n => n.kind === 'wallet' && n.cluster ? 'cluster' : n.kind === 'wallet' && n.sniper ? 'sniper' : n.kind;
    const nodeColor = n => COLORS[kindOf(n)] || COLORS.wallet;
    const visible = n => filters.others || n.kind !== 'others';
    const inKey = n => keyFocus && keyFocus.k && (keyFocus.k === 'cluster' ? !!n.cluster : keyFocus.k === 'sniper' ? !!n.sniper : kindOf(n) === keyFocus.k);
    const replayBal = n => replay.balances && !replay.done ? replay.balances[n.i] : n.balance;

    function radius(n, bal) {
      const b = bal ?? n.balance;
      const base = n.kind === 'others' ? 18 : n.kind === 'mint' ? 12 : 5;
      return base + Math.sqrt(Math.max(b, n.kind === 'wallet' ? 0 : n.volume * 0.004)) * 4.2;
    }

    function resize() {
      const r = container.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = W * DPR; canvas.height = H * DPR;
    }
    // a new size re-fits the view (debounced), so a late layout change never leaves the graph in a corner
    let refit = 0;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      resize(); if (sim) sim.alpha(0.15).restart();
      clearTimeout(refit); refit = setTimeout(() => { if (fitted) fit(true); }, 180);
    }) : null;
    ro?.observe(container);
    resize();

    /* ---------- data ---------- */
    function setData(f, meta = {}) {
      const nodes = f.nodes.map((n, i) => ({ ...n, i }));
      const links = f.edges.map(([s, t, v, c]) => ({ source: s, target: t, v, c }));
      G = { nodes, links, events: f.events || [], total: f.totalEvents ?? (f.events || []).length, lastBlock: f.events?.length ? f.events[f.events.length - 1][0] : 0 };
      q('.tm-title').textContent = meta.title ?? opts.title;
      q('.tm-sub').textContent = meta.subtitle ?? opts.subtitle ?? `${nodes.length - 1} addresses · ${G.total.toLocaleString('en-US')} transfers`;
      particles.length = 0;
      selected = null; q('.tm-panel').classList.remove('open');

      // seed positions: mint on the left, pools in the middle, everything else on a ring
      nodes.forEach((n, k) => {
        const a = (k / nodes.length) * Math.PI * 2;
        if (n.kind === 'mint') { n.x = -260; n.y = 0; }
        else if (n.kind === 'pool') { n.x = 0; n.y = 0; }
        else { n.x = Math.cos(a) * 240; n.y = Math.sin(a) * 240; }
      });

      if (sim) sim.stop();
      const maxV = d3.max(links, l => l.v) || 1;
      sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).distance(l => 70 + 90 * (1 - Math.sqrt(l.v / maxV))).strength(l => 0.08 + 0.5 * Math.sqrt(l.v / maxV)))
        .force('charge', d3.forceManyBody().strength(n => n.kind === 'wallet' ? -60 : -260))
        .force('collide', d3.forceCollide(n => radius(n) + 4))
        .force('x', d3.forceX(n => n.kind === 'mint' ? -200 : 0).strength(n => n.kind === 'mint' ? 0.15 : 0.03))
        .force('y', d3.forceY(0).strength(0.04))
        .alphaDecay(0.018).velocityDecay(0.55)
        .on('tick', () => { if (!fitted && sim.alpha() < 0.25) { fitted = true; fit(true); } else if (fitted && !settled && sim.alpha() < 0.05) { settled = true; fit(true); } });
      fitted = false; settled = false;

      replayReset(true);
      keyPinned = null; setKey(null);
      updateKey();
      buildMarks();
      transform = d3.zoomIdentity.translate(W / 2, H / 2).scale(0.9);
      d3.select(canvas).call(zoom.transform, transform);
    }

    function fit(animate) {
      if (!G) return;
      const vis = G.nodes.filter(visible);
      // frame the bulk of the graph: a few far-flung loners must not shrink everything
      const qs = (arr, p) => { const v = arr.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; };
      const xs = vis.map(n => n.x), ys = vis.map(n => n.y);
      const x0 = qs(xs, 0.04) - 30, x1 = qs(xs, 0.96) + 30, y0 = qs(ys, 0.04) - 30, y1 = qs(ys, 0.96) + 30;
      const pad = 80, bottom = opts.showReplay ? 190 : 80;
      const k = Math.min(2.2, 0.92 * Math.min((W - pad * 2) / (x1 - x0 || 1), (H - bottom) / (y1 - y0 || 1)));
      const t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, (H - (opts.showReplay ? 70 : 0)) / 2 - k * (y0 + y1) / 2).scale(k);
      d3.select(canvas).transition().duration(animate && !calm ? 900 : 0).call(zoom.transform, t);
    }

    /* ---------- interaction ---------- */
    const zoom = d3.zoom().scaleExtent([0.2, 6])
      .filter(e => !(e.type === 'mousedown' && nodeAt(e.offsetX, e.offsetY)) && !e.button)
      .on('zoom', e => { transform = e.transform; });
    d3.select(canvas).call(zoom).on('dblclick.zoom', null);

    function nodeAt(px, py) {
      if (!G) return null;
      const [x, y] = transform.invert([px, py]);
      let best = null, bd = Infinity;
      for (const n of G.nodes) {
        if (!visible(n)) continue;
        const d = Math.hypot(n.x - x, n.y - y), r = radius(n, replayBal(n)) + 3;
        if (d < r && d < bd) { best = n; bd = d; }
      }
      return best;
    }

    d3.select(canvas).call(d3.drag()
      .subject(e => nodeAt(e.sourceEvent.offsetX, e.sourceEvent.offsetY) || null)
      .on('start', e => { canvas.classList.add('dragging'); if (!e.active) sim.alphaTarget(0.25).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
      .on('drag', e => { const [x, y] = transform.invert([e.sourceEvent.offsetX, e.sourceEvent.offsetY]); e.subject.fx = x; e.subject.fy = y; })
      .on('end', e => { canvas.classList.remove('dragging'); if (!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }));

    const tip = q('.tm-tip');
    canvas.addEventListener('pointermove', e => {
      const n = nodeAt(e.offsetX, e.offsetY);
      hover = n;
      canvas.classList.toggle('pointing', !!n);
      if (!n) { tip.classList.remove('show'); return; }
      tip.innerHTML = `<b>${esc(n.label)}</b>${n.kind === 'others' ? '' : `<div class="tm-mono">${esc(n.id)}</div>`}
        <div class="tm-kv"><span>Holds</span><span>${pctf(replay.balances && !replay.done ? Math.max(replayBal(n), 0) : n.balance)}</span></div>
        <div class="tm-kv"><span>Moved</span><span>${pctf(n.volume)}</span></div>
        ${n.cluster ? `<div class="tm-kv"><span>Linked group</span><span>#${n.cluster}</span></div>` : ''}
        ${n.sniper ? `<div class="tm-kv"><span>Sniper</span><span>early buyer</span></div>` : ''}`;
      const r = container.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - r.left, W - 220) + 'px';
      tip.style.top = Math.min(e.clientY - r.top, H - 140) + 'px';
      tip.classList.add('show');
    });
    canvas.addEventListener('pointerleave', () => { hover = null; tip.classList.remove('show'); });
    canvas.addEventListener('click', e => {
      const n = nodeAt(e.offsetX, e.offsetY);
      if (n) openPanel(n); else { selected = null; q('.tm-panel').classList.remove('open'); }
      opts.onSelect?.(n || null);
    });

    function openPanel(n) {
      selected = n;
      const panel = q('.tm-panel');
      const flows = new Map();
      for (const l of G.links) {
        if (l.source === n) flows.set(l.target, { out: (flows.get(l.target)?.out || 0) + l.v, in: flows.get(l.target)?.in || 0 });
        if (l.target === n) flows.set(l.source, { in: (flows.get(l.source)?.in || 0) + l.v, out: flows.get(l.source)?.out || 0 });
      }
      const top = [...flows].sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).slice(0, 8);
      const tags = [[n.kind === 'others' ? 'aggregate' : n.kind, nodeColor(n)]];
      if (n.cluster) tags.push(['linked group #' + n.cluster, COLORS.cluster]);
      if (n.sniper) tags.push(['sniper', COLORS.sniper]);
      const link = n.kind !== 'others' && n.kind !== 'mint' && opts.explorerUrl ? opts.explorerUrl(n.id) : null;
      panel.innerHTML = `
        <button class="tm-close" aria-label="Close">×</button>
        <span class="tm-label">${n.kind === 'others' ? 'Everyone else' : 'Address'}</span>
        <h3>${esc(n.label)}</h3>
        ${n.kind !== 'others' ? `<div class="tm-addr" data-copy="${esc(n.id)}">${esc(n.id)} ⧉</div>` : ''}
        <div class="tm-tags">${tags.map(([t, c]) => `<span class="tm-tag" style="color:${c};border-color:${c}55">${esc(t)}</span>`).join('')}</div>
        <div class="tm-stats"><div><span class="tm-label">Holds</span><b>${pctf(n.balance)}</b></div><div><span class="tm-label">Moved</span><b>${pctf(n.volume)}</b></div></div>
        <h4 class="tm-label">Biggest counterparties</h4>
        ${top.map(([o, f]) => `<div class="tm-cp" data-i="${o.i}"><span>${esc(o.label)}</span><span>${f.in ? '← ' + pctf(f.in) : ''} ${f.out ? '→ ' + pctf(f.out) : ''}</span></div>`).join('') || '<p class="tm-hint">No transfers with mapped addresses.</p>'}
        ${link ? `<a class="tm-ext" href="${esc(link)}" target="_blank" rel="noopener">Open in explorer ↗</a>` : ''}`;
      panel.classList.add('open');
      panel.querySelector('.tm-close').onclick = () => { selected = null; panel.classList.remove('open'); };
      panel.querySelectorAll('[data-copy]').forEach(el => el.onclick = () => navigator.clipboard?.writeText(el.dataset.copy));
      panel.querySelectorAll('.tm-cp').forEach(el => el.onclick = () => {
        const o = G.nodes[+el.dataset.i];
        openPanel(o);
        d3.select(canvas).transition().duration(calm ? 0 : 700).call(zoom.translateTo, o.x, o.y);
      });
    }

    q('.tm-chips')?.addEventListener('click', e => {
      const b = e.target.closest('.tm-chip');
      if (!b) return;
      const f = b.dataset.f;
      if (f === 'fit') return fit(true);
      if (f === 'png') return exportPng();
      filters[f] = !filters[f];
      b.classList.toggle('on', filters[f]);
      if (f === 'others' && sim) sim.alpha(0.3).restart();
    });

    /* ---------- replay ---------- */
    function replayReset(toEnd) {
      replay.lastBlock = G ? G.lastBlock : 0;
      replay.cursor = toEnd && G ? G.events.length : 0;
      replay.block = toEnd ? replay.lastBlock : 0;
      replay.balances = G ? new Float64Array(G.nodes.length) : null;
      replay.done = toEnd;
      if (toEnd && G) G.nodes.forEach((n, i) => { replay.balances[i] = n.balance; });
      syncTimeline();
    }

    function applyEvent(ev, spawn) {
      const [, s, d, v] = ev;
      replay.balances[s] -= v; replay.balances[d] += v;
      if (spawn) { spawnParticle(G.nodes[s], G.nodes[d], v, true); flashes.set(G.nodes[d], performance.now()); }
    }

    function seek(block) {
      if (!G) return;
      replay.balances.fill(0);
      replay.cursor = 0;
      while (replay.cursor < G.events.length && G.events[replay.cursor][0] <= block) applyEvent(G.events[replay.cursor++], false);
      replay.block = block;
      replay.done = replay.cursor >= G.events.length && !replay.playing;
      if (replay.done) G.nodes.forEach((n, i) => { replay.balances[i] = n.balance; });
      syncTimeline();
    }

    function syncTimeline() {
      const tl = q('.tm-range');
      if (!tl) return;
      const p = replay.lastBlock ? replay.block / replay.lastBlock : 1;
      tl.value = Math.round(p * 1000);
      tl.style.setProperty('--p', (p * 100) + '%');
      q('.tm-tl-block').textContent = 'block +' + Math.round(replay.block).toLocaleString('en-US');
      const shown = G ? Math.round((replay.cursor / Math.max(G.events.length, 1)) * G.total) : 0;
      q('.tm-tl-count').textContent = shown.toLocaleString('en-US') + ' / ' + (G ? G.total.toLocaleString('en-US') : 0) + ' transfers';
    }

    function setPlaying(on) {
      replay.playing = on;
      const btn = q('.tm-play');
      if (!btn) return;
      btn.querySelector('svg').innerHTML = on ? '<path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor"/>' : '<path d="M3 1.5v13l11-6.5z" fill="currentColor"/>';
      btn.setAttribute('aria-label', on ? 'Pause replay' : 'Play replay');
    }

    function play() {
      if (!G) return;
      if (replay.done || replay.cursor >= G.events.length) { replay.balances.fill(0); replay.cursor = 0; replay.block = 0; replay.done = false; }
      setPlaying(true);
    }
    const pause = () => setPlaying(false);

    q('.tm-play')?.addEventListener('click', () => (replay.playing ? pause() : play()));
    q('.tm-range')?.addEventListener('input', e => { if (!G) return; pause(); seek((+e.target.value / 1000) * replay.lastBlock); });
    q('.tm-speed')?.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      replay.speed = +b.dataset.s;
      q('.tm-speed').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });

    /* ---------- particles ---------- */
    function spawnParticle(a, b, v, big) {
      if (!filters.particles || calm || !visible(a) || !visible(b)) return;
      if (particles.length > 900) particles.shift();
      const flow = flowOf(a, b);
      const color = { buy: COLORS.buy, sell: COLORS.sell, mint: COLORS.mint, move: COLORS.move }[flow];
      particles.push({ a, b, t: 0, flow, speed: (big ? 0.012 : 0.006) * (0.7 + Math.random() * 0.6), size: big ? 1.6 + Math.min(Math.sqrt(v) * 1.4, 4) : 1.1 + Math.random() * 0.9, color, bend: (Math.random() - 0.5) * 0.35 });
    }

    function ambient() {
      if (!G || replay.playing || !filters.particles || calm) return;
      for (const l of G.links) {
        if (!visible(l.source) || !visible(l.target)) continue;
        if (Math.random() < 0.004 + Math.min(Math.log10(l.c + 1) * 0.01, 0.05)) spawnParticle(l.source, l.target, l.v, false);
      }
    }

    /* ---------- key ---------- */
    function updateKey() {
      if (!legend || !G) return;
      const n = { mint: 0, pool: 0, contract: 0, deployer: 0, wallet: 0, cluster: 0, sniper: 0, buy: 0, sell: 0 };
      for (const x of G.nodes) {
        if (x.kind === 'others') continue;
        n[kindOf(x)] = (n[kindOf(x)] || 0) + 1;
        if (x.cluster && kindOf(x) !== 'cluster') n.cluster++;
      }
      for (const l of G.links) { const f = flowOf(l.source, l.target); if (f === 'buy' || f === 'sell') n[f] += l.c; }
      legend.querySelectorAll('[data-n]').forEach(b => {
        const v = n[b.dataset.n] || 0;
        b.textContent = v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v;
        b.closest('.tm-lg-item').classList.toggle('zero', v === 0);
      });
      legend.classList.remove('ready');
      requestAnimationFrame(() => requestAnimationFrame(() => legend.classList.add('ready')));
    }

    function setKey(target) {
      keyFocus = target;
      legend?.querySelectorAll('.tm-lg-item').forEach(el => el.classList.toggle('on',
        !!keyPinned && ((keyPinned.k && el.dataset.k === keyPinned.k) || (keyPinned.f && el.dataset.f === keyPinned.f))));
    }

    if (legend) {
      legend.querySelectorAll('.tm-lg-item').forEach((el, i) => {
        el.style.setProperty('--i', i);
        const t = () => (el.dataset.k ? { k: el.dataset.k } : { f: el.dataset.f });
        el.addEventListener('mouseenter', () => setKey(t()));
        el.addEventListener('mouseleave', () => setKey(keyPinned));
        el.addEventListener('click', () => {
          const v = t();
          keyPinned = keyPinned && keyPinned.k === v.k && keyPinned.f === v.f ? null : v;
          setKey(keyPinned);
        });
      });
      legend.querySelector('.tm-lg-head').onclick = () => {
        const closed = legend.classList.toggle('closed');
        legend.querySelector('.tm-lg-head').setAttribute('aria-expanded', String(!closed));
      };
      if (W < 700 || H < 640) legend.classList.add('closed'); // a short map: the key would cover the title
    }

    /* ---------- timeline markers ---------- */
    function buildMarks() {
      const host = q('.tm-marks');
      if (!host || !G) return;
      const out = [];
      const seenSniper = new Set();
      for (const [blk, s, d, v] of G.events) {
        const a = G.nodes[s], b = G.nodes[d];
        if (a.kind === 'mint') { out.push({ blk, node: b, c: COLORS.mint, text: `Minted ${pctf(v)} to ${b.label}` }); continue; }
        if (a.kind === 'deployer' && isMarket(b)) out.push({ blk, node: a, c: COLORS.sell, text: `Dev sold ${pctf(v)}` });
        else if (b.kind === 'deployer' && isMarket(a) && v >= 0.5) out.push({ blk, node: b, c: COLORS.deployer, text: `Dev bought ${pctf(v)}` });
        else if (b.sniper && isMarket(a) && !seenSniper.has(b)) { seenSniper.add(b); out.push({ blk, node: b, c: COLORS.sniper, text: `Sniper bought ${pctf(v)}` }); }
        else if (v >= 2 && !isMarket(a) && !isMarket(b)) out.push({ blk, node: b, c: COLORS.cluster, text: `${pctf(v)} moved ${a.label} → ${b.label}` });
        else if (v >= 3 && isMarket(b)) out.push({ blk, node: a, c: COLORS.sell, text: `Big sell: ${pctf(v)} by ${a.label}` });
      }
      const marks = out.length > 24 ? out.filter((_, i) => i % Math.ceil(out.length / 24) === 0) : out;
      const lastBlk = Math.max(G.lastBlock, 1);
      host.innerHTML = marks.map((m, i) =>
        `<button class="tm-mark" type="button" data-i="${i}" style="left:${(m.blk / lastBlk) * 100}%;--c:${m.c};--d:${0.4 + i * 0.04}s" aria-label="${esc(m.text)}"></button>`).join('');
      const mtip = q('.tm-mark-tip');
      host.querySelectorAll('.tm-mark').forEach(el => {
        const m = marks[+el.dataset.i];
        el.onmouseenter = () => {
          mtip.innerHTML = `<b>block +${m.blk.toLocaleString('en-US')}</b>${esc(m.text)}`;
          const r = el.getBoundingClientRect(), p = q('.tm-replay').getBoundingClientRect();
          mtip.style.left = (r.left - p.left + 4) + 'px';
          mtip.classList.add('show');
        };
        el.onmouseleave = () => mtip.classList.remove('show');
        el.onclick = () => { pause(); seek(m.blk); focus(m.node); };
      });
    }

    /* ---------- find ---------- */
    function focus(n) {
      if (!n) return;
      if (n.kind === 'others' && !filters.others) container.querySelector('[data-f="others"]')?.click();
      openPanel(n);
      flashes.set(n, performance.now());
      d3.select(canvas).transition().duration(calm ? 0 : 800)
        .call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(transform.k, 1.6)).translate(-n.x, -n.y));
    }
    const find = q('.tm-find');
    find?.addEventListener('submit', e => {
      e.preventDefault();
      const s = find.querySelector('input').value.trim().toLowerCase();
      if (!G || !s) return;
      const n = G.nodes.find(x => x.id.toLowerCase() === s) || G.nodes.find(x => x.id.toLowerCase().startsWith(s) || x.label.toLowerCase().includes(s));
      find.classList.remove('miss');
      if (!n) { void find.offsetWidth; find.classList.add('miss'); return; }
      focus(n);
    });

    /* ---------- render ---------- */
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(now - last, 50); last = now;
      if (G && replay.playing) {
        replay.block += (replay.lastBlock / (opts.replaySeconds * 1000)) * dt * replay.speed;
        let spawned = 0;
        while (replay.cursor < G.events.length && G.events[replay.cursor][0] <= replay.block) applyEvent(G.events[replay.cursor++], spawned++ < 25);
        if (replay.cursor >= G.events.length) { replay.block = replay.lastBlock; setPlaying(false); replay.done = true; G.nodes.forEach((n, i) => { replay.balances[i] = n.balance; }); }
        syncTimeline();
      }
      ambient();
      draw(now, dt);
      raf = requestAnimationFrame(frame);
    }

    // straight lines: the control point sits on the segment
    const curve = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];
    const shadeCache = {};
    function shade(hex) {
      if (shadeCache[hex]) return shadeCache[hex];
      const n = parseInt(hex.slice(1), 16);
      const f = c => Math.round(c * 0.45);
      return (shadeCache[hex] = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`);
    }

    // pool = diamond, contract = square, mint = triangle, burn = cross, everyone else = circle
    function shapePath(n, r) {
      ctx.beginPath();
      if (n.kind === 'pool') { ctx.moveTo(n.x, n.y - r * 1.2); ctx.lineTo(n.x + r * 1.2, n.y); ctx.lineTo(n.x, n.y + r * 1.2); ctx.lineTo(n.x - r * 1.2, n.y); ctx.closePath(); }
      else if (n.kind === 'contract') ctx.rect(n.x - r * 0.9, n.y - r * 0.9, r * 1.8, r * 1.8);
      else if (n.kind === 'mint') { ctx.moveTo(n.x, n.y - r * 1.15); ctx.lineTo(n.x + r, n.y + r * 0.7); ctx.lineTo(n.x - r, n.y + r * 0.7); ctx.closePath(); }
      else if (n.kind === 'burn') { const k = r * 0.8; ctx.moveTo(n.x - k, n.y - k); ctx.lineTo(n.x + k, n.y + k); ctx.moveTo(n.x + k, n.y - k); ctx.lineTo(n.x - k, n.y + k); ctx.moveTo(n.x + r, n.y); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); }
      else ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    }
    const tintCache = {};
    function tint(hex, a) {
      const k = hex + a;
      if (tintCache[k]) return tintCache[k];
      const v = parseInt(hex.slice(1), 16);
      return (tintCache[k] = `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`);
    }

    function draw(now, dt) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!G) return;
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const focusNode = selected || hover;
      const linked = focusNode ? new Set(G.links.filter(l => l.source === focusNode || l.target === focusNode).flatMap(l => [l.source, l.target])) : null;
      const dimmed = n => (focusNode && !linked.has(n) && n !== focusNode)
        || (filters.clusters && !n.cluster && n.kind === 'wallet') || (filters.snipers && !n.sniper && n.kind === 'wallet')
        || (keyFocus?.k && !inKey(n))
        || (keyFocus?.f && !isMarket(n) && !G.links.some(l => (l.source === n || l.target === n) && flowOf(l.source, l.target) === keyFocus.f));
      const maxV = Math.log10(d3.max(G.links, l => l.v) + 1) || 1;
      ctx.globalAlpha = Math.min(1, Math.max(0, (now - (G.nodes[0]._born ?? now)) / 900));

      for (const l of G.links) {
        const a = l.source, b = l.target;
        if (!visible(a) || !visible(b)) continue;
        const on = focusNode && (a === focusNode || b === focusNode);
        const w = 0.35 + 1.6 * (Math.log10(l.v + 1) / maxV);
        const keyOn = keyFocus && ((keyFocus.k && (inKey(a) || inKey(b))) || (keyFocus.f && flowOf(a, b) === keyFocus.f));
        ctx.strokeStyle = on ? 'rgba(255,255,255,0.6)'
          : focusNode ? 'rgba(255,255,255,0.03)'
          : keyFocus ? (keyOn ? (keyFocus.f ? COLORS[keyFocus.f] + '99' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.025)')
          : `rgba(255,255,255,${0.05 + 0.16 * (Math.log10(l.v + 1) / maxV)})`;
        ctx.lineWidth = w / Math.sqrt(transform.k);
        const [cx, cy] = curve(a, b, 0.12);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      }

      ctx.globalAlpha = 1;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed * dt / 16;
        if (p.t >= 1) { particles.splice(i, 1); continue; }
        const [cx, cy] = curve(p.a, p.b, 0.12 + p.bend * 0.2);
        const t = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2, u = 1 - t;
        const x = u * u * p.a.x + 2 * u * t * cx + t * t * p.b.x;
        const y = u * u * p.a.y + 2 * u * t * cy + t * t * p.b.y;
        const faded = (focusNode && p.a !== focusNode && p.b !== focusNode) || (keyFocus?.f && p.flow !== keyFocus.f) || (keyFocus?.k && !inKey(p.a) && !inKey(p.b));
        ctx.globalAlpha = faded ? 0.08 : Math.sin(Math.PI * t) * 0.95;
        const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1, ux = (p.b.x - p.a.x) / len, uy = (p.b.y - p.a.y) / len;
        const tail = (4 + p.size * 3) / Math.sqrt(transform.k);
        ctx.strokeStyle = p.color; ctx.lineWidth = (0.6 + p.size * 0.7) / Math.sqrt(transform.k); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - ux * tail, y - uy * tail); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      const sorted = G.nodes.filter(visible).sort((a, b) => radius(a) - radius(b));
      const k1 = Math.min(1, dt / 150), k2 = Math.min(1, dt / 220);
      for (const n of sorted) {
        // sizes and fades ease toward their target, so nothing jumps; nodes grow in one by one
        if (n._born == null) n._born = now + 120 + n.i * 14;
        const grow = calm ? 1 : Math.min(1, Math.max(0, (now - n._born) / 520));
        const target = radius(n, Math.max(replayBal(n), 0)) * (1 - Math.pow(1 - grow, 3));
        n._r = n._r == null ? target : n._r + (target - n._r) * k1;
        const r = Math.max(0.01, n._r);
        const c = nodeColor(n);
        const dim = dimmed(n);
        n._a = n._a == null ? 0 : n._a + ((dim ? 0.14 : 1) * grow - n._a) * k2;
        ctx.globalAlpha = n._a;

        const hit = flashes.get(n);
        if (hit && now - hit < 700) {
          const k = (now - hit) / 700;
          ctx.strokeStyle = c; ctx.lineWidth = 1.5 / transform.k; ctx.globalAlpha = n._a * 0.7 * (1 - k);
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 + k * 16, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = n._a;
        }

        if (n.kind === 'others') {
          ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.setLineDash([2, 5]); ctx.lineWidth = 1 / transform.k;
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        } else {
          shapePath(n, r);
          ctx.fillStyle = '#000'; ctx.fill();
          ctx.fillStyle = tint(c, n.kind === 'deployer' ? 0.55 : n.kind === 'wallet' ? 0.14 : 0.22); ctx.fill();
          ctx.strokeStyle = c; ctx.lineWidth = (n.kind === 'wallet' ? 1 : 1.5) / transform.k; ctx.stroke();
          // a bright core in the middle, like the cores of the network
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.2, r * 0.18), 0, Math.PI * 2); ctx.fill();
          if (n.kind === 'deployer' && !dim) {
            ctx.strokeStyle = c; ctx.lineWidth = 1 / transform.k; ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, now / 900, now / 900 + Math.PI * 1.6); ctx.stroke(); ctx.setLineDash([]);
          }
          if (n.cluster && !dim) { ctx.strokeStyle = COLORS.cluster; ctx.lineWidth = 1 / transform.k; ctx.setLineDash([1, 2]); ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        }
        if (n === focusNode) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / transform.k;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 + Math.sin(now / 200) * 1.5, 0, Math.PI * 2); ctx.stroke();
        }

        const show = n === focusNode || (linked && linked.has(n)) || (filters.labels && (n.kind !== 'wallet' || r > 12));
        if (show && !dim) {
          ctx.globalAlpha = n._a;
          ctx.font = `400 ${10.5 / Math.sqrt(transform.k)}px 'JetBrains Mono', ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = n.kind === 'wallet' ? 'rgba(255,255,255,0.5)' : '#ffffff';
          ctx.fillText(n.kind === 'wallet' ? n.label : n.label.toUpperCase(), n.x, n.y + r + 15 / Math.sqrt(transform.k));
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---------- export ---------- */
    function exportPng() {
      if (!G) return;
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const c = out.getContext('2d');
      c.fillStyle = getComputedStyle(container).getPropertyValue('--tm-bg').trim() || '#000';
      c.fillRect(0, 0, out.width, out.height);
      c.drawImage(canvas, 0, 0);
      c.fillStyle = '#ffffff';
      c.font = `500 ${34 * DPR}px Inter, system-ui, sans-serif`;
      c.fillText(q('.tm-title').textContent, 24 * DPR, 54 * DPR);
      c.font = `${12 * DPR}px ui-monospace, monospace`;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText(q('.tm-sub').textContent, 24 * DPR, 78 * DPR);
      c.textAlign = 'right';
      c.fillText('overmind.ink', out.width - 24 * DPR, out.height - 20 * DPR);
      out.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${opts.exportName}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    }

    function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      sim?.stop();
      ro?.disconnect();
      container.innerHTML = '';
      container.classList.remove('tm');
    }

    raf = requestAnimationFrame(frame);
    if (flow) setData(flow);

    return {
      setData, play, pause, seek, fit: () => fit(true), exportPng, destroy,
      /** Highlight a group as the key does: { k: 'deployer' } or { f: 'sell' }; null clears. */
      highlight: target => { keyPinned = target; setKey(target); },
      focus: id => focus(G?.nodes.find(n => n.id.toLowerCase() === String(id).toLowerCase())),
    };
  }

  return { mount, colors: DEFAULT_COLORS };
});
