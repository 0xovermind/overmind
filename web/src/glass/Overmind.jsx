import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, MotionConfig, animate, useTransform } from "framer-motion";
import { ethers } from "ethers";
import { Chars, Cursor, Magnetic, Scramble, ScrollProgress, Spotlight, Tilt, Typewriter, Words, useGlitch, usePointer, useScrollSkew, useScrollSpy } from "./motionkit.jsx";
import { useScroll } from "framer-motion";
import {
  DEP, GLASS_TOKEN, NETWORK, STATIC, connectWallet, ensureGlassAllowance, errMsg, loadArena, loadStake, loadStaking, stakingAt,
} from "./chain.js";

const EASE = [0.22, 1, 0.36, 1];
const usd = (n, d = 2) => `${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const big = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
const pctS = (r) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`;
const ago = (s) => (s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`);
const PONS = GLASS_TOKEN ? `https://ponsfamily.com/launchpad/${GLASS_TOKEN}` : "https://ponsfamily.com/launchpad";

const ICONS = {
  atlas: "M3 20 9.5 9l4 6.5 2.5-4L21 20z",
  volt: "M13 2 4 14h7l-1 8 9-12h-7z",
  echo: "M2 12c2.5-6 5 6 7.5 0s5 6 7.5 0 3.5-2 5-2M2 17c2.5-4 5 4 7.5 0s5 4 7.5 0",
  sage: "M5 19C5 10 11 4 20 4c0 9-6 15-15 15zM5 19l8.5-8.5",
};
const reveal = (i = 0) => ({
  initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, delay: i * 0.08, ease: EASE },
});

function Count({ value, format }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (document.hidden) { setV(value); return; }
    const c = animate(v, value, { duration: 1.6, ease: EASE, onUpdate: setV });
    return () => c.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{format(v)}</>;
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="10.4" cy="10.6" r="8" fill="currentColor" stroke="none" opacity="0.92" />
      <circle cx="12" cy="12" r="9" stroke="#c8ff1a" strokeDasharray="6 50" strokeDashoffset="-30" strokeWidth="2.2" />
    </svg>
  );
}

/** Flat cel-style scene: eclipse ring, star field, green cloud banks with ink outlines, mascot. */
function HeroArt() {
  const stars = useMemo(() => {
    let s = 7;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: 90 }, () => [r() * 1200, r() * 520, r() < 0.15 ? 1.8 : 1]);
  }, []);
  const bank = (y, seed, n) => {
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: n }, (_, i) => [(-60 + (1320 / (n - 1)) * i) + (r() - 0.5) * 40, y + (r() - 0.5) * 40, 55 + r() * 70]);
  };
  const back = bank(690, 3, 16), front = bank(740, 11, 14);
  // Parallax layers + eyes that follow the cursor.
  const { px, py } = usePointer();
  const starX = useTransform(px, (v) => v * -8), starY = useTransform(py, (v) => v * -6);
  const ringX = useTransform(px, (v) => v * 14), ringY = useTransform(py, (v) => v * 10);
  const backX = useTransform(px, (v) => v * -18);
  const frontX = useTransform(px, (v) => v * -34);
  const eyeX = useTransform(px, (v) => v * 7), eyeY = useTransform(py, (v) => v * 5);
  const Cloud = ({ c, cls, fill = "#c8ff1a" }) => (
    <g className={cls}>
      {c.map(([x, y, rr], i) => <circle key={`o${i}`} cx={x} cy={y} r={rr + 3.5} fill="#000" />)}
      {c.map(([x, y, rr], i) => <circle key={`f${i}`} cx={x} cy={y} r={rr} fill={fill} />)}
      {c.filter((_, i) => i % 3 === 0).map(([x, y, rr], i) => (
        <path key={`h${i}`} d={`M${x - rr * 0.55} ${y - rr * 0.35} q ${rr * 0.3} ${-rr * 0.35} ${rr * 0.7} ${-rr * 0.2}`} stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
  return (
    <svg className="ohero-art" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <motion.g style={{ x: starX, y: starY }}>
        {stars.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#fff" className="twinkle" style={{ animationDelay: `${(i * 0.37) % 4}s`, animationDuration: `${2.5 + (i % 5)}s` }} />
        ))}
        <line className="meteor" x1="0" y1="0" x2="90" y2="0" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <line className="meteor m2" x1="0" y1="0" x2="70" y2="0" stroke="#c8ff1a" strokeWidth="2" strokeLinecap="round" />
      </motion.g>
      <motion.g style={{ x: ringX, y: ringY }}>
        <g className="ring-spin">
          <circle cx="600" cy="330" r="300" fill="none" stroke="#fff" strokeOpacity="0.25" strokeDasharray="2 10" />
          <circle cx="600" cy="330" r="345" fill="none" stroke="#fff" strokeOpacity="0.12" />
          <circle cx="600" cy="330" r="268" fill="none" stroke="#c8ff1a" strokeWidth="3" strokeDasharray="120 700" strokeLinecap="round" />
        </g>
        <g className="ring-spin rev">
          <circle cx="600" cy="330" r="282" fill="none" stroke="#c8ff1a" strokeWidth="2" strokeDasharray="40 900" strokeLinecap="round" />
        </g>
        <circle cx="600" cy="330" r="254" fill="none" stroke="#c8ff1a" strokeWidth="10" className="corona" />
        <circle cx="600" cy="330" r="250" fill="#fff" />
        <circle cx="590" cy="318" r="246" fill="#000" />
      </motion.g>
      <motion.g style={{ x: backX }}><Cloud c={back} cls="cloud-drift b" fill="#2f4200" /></motion.g>
      {/* mascot peeking out of the clouds: bobs, blinks, follows the cursor */}
      <g transform="translate(600 668) scale(0.86)">
        <g className="bob">
          <line x1="0" y1="-118" x2="0" y2="-92" stroke="#fff" strokeWidth="4" />
          <circle cx="0" cy="-124" r="9" fill="#c8ff1a" stroke="#fff" strokeWidth="4" className="antenna" />
          <rect x="-78" y="-92" width="156" height="120" rx="34" fill="#000" stroke="#fff" strokeWidth="5" />
          <rect x="-56" y="-62" width="112" height="46" rx="20" fill="#c8ff1a" stroke="#fff" strokeWidth="4" />
          <motion.g style={{ x: eyeX, y: eyeY }}>
            <g className="blink">
              <circle cx="-24" cy="-39" r="9" fill="#000" />
              <circle cx="24" cy="-39" r="9" fill="#000" />
            </g>
          </motion.g>
          <path d="M-20 4 q20 12 40 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      </g>
      <motion.g style={{ x: frontX }}><Cloud c={front} cls="cloud-drift" fill="#c8ff1a" /></motion.g>
    </svg>
  );
}

export default function Overmind() {
  const [arena, setArena] = useState(null);
  const [stk, setStk] = useState(null);
  const [err, setErr] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [toast, setToast] = useState(null);
  const [atTop, setAtTop] = useState(true);
  const skew = useScrollSkew(8);
  const glitch = useGlitch();
  const spyRaw = useScrollSpy(["how", "minds", "stake", "roadmap"]);
  const { scrollYProgress } = useScroll();
  const footX = useTransform(scrollYProgress, [0.75, 1], ["-14%", "0%"]);

  const refresh = useCallback(async () => {
    try {
      const a = await loadArena();
      const nvda = a.stocks.find((s) => s.symbol === "NVDA")?.price ?? 0;
      setArena({ ...a, nvda });
      setStk(await loadStaking(nvda));
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => {
    if (!DEP) return;
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    const on = () => setAtTop(window.scrollY < Math.max(240, window.innerHeight - 80));
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const spy = atTop ? null : spyRaw;
  const notify = (kind, text) => { setToast({ kind, text }); setTimeout(() => setToast(null), 4500); };
  const connect = async () => { try { setWallet(await connectWallet()); } catch (e) { notify("err", errMsg(e)); } };

  const thoughts = useMemo(() => (arena ? arena.vaults.flatMap((v) => v.feed.slice(0, 5).map((e) => ({ ...e, name: v.persona.name })))
    .sort((a, b) => b.t - a.t).slice(0, 10) : []), [arena]);
  const [ti, setTi] = useState(0);
  useEffect(() => { const t = setInterval(() => setTi((x) => x + 1), 5000); return () => clearInterval(t); }, []);
  const th = thoughts.length ? thoughts[ti % thoughts.length] : null;
  const now = arena?.now ?? 0;
  const last24 = stk ? stk.payouts.filter((p) => p.t > now - 86400).reduce((s, p) => s + p.usd, 0) : 0;
  const trades24 = arena ? arena.vaults.reduce((s, v) => s + v.feed.filter((e) => e.kind === "trade" && e.t > now - 86400).length, 0) : 0;
  const tvl = arena ? arena.vaults.reduce((s, v) => s + v.nav, 0) : 0;
  const live = useMemo(() => (arena ? arena.vaults.flatMap((v) => v.feed.filter((e) => e.kind === "trade").slice(0, 6).map((e) => ({ ...e, name: v.persona.name })))
    .sort((a, b) => b.t - a.t).slice(0, 12) : []), [arena]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="grain" aria-hidden="true" />
      <Cursor />
      <ScrollProgress />
      <Spotlight />
      <header className={`gnav ${atTop ? "" : "scrolled"}`}>
        <motion.div className="gnav-pill" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.8, ease: EASE }}>
          <a href="#top" className="omark"><Mark />Overmind</a>
          <nav className="gnav-links">
            {[["how", "How it works"], ["minds", "Minds"], ["stake", "Stake"], ["roadmap", "Roadmap"]].map(([id, label]) => (
              <a key={id} href={`#${id}`} className={spy === id ? "on" : ""}>
                {spy === id && <motion.span layoutId="gnav-hl" className="gnav-hl" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <span>{label}</span>
              </a>
            ))}
          </nav>
          <div className="gnav-right">
            {wallet ? <span className="gnav-addr">{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span>
              : <button className="gnav-btn" onClick={connect}>Connect</button>}
            <a className="gnav-btn solid" href={PONS} target="_blank" rel="noreferrer">Buy $OVERMIND</a>
          </div>
        </motion.div>
      </header>

      <section id="top" className="ohero">
        <HeroArt />
        <div className="ohero-copy">
          <Scramble className="eyebrow" text="Overmind is" />
          <h1>
            <span className={`big glitch ${glitch ? "on" : ""}`} data-text="FOUR MINDS"><Chars text="Four minds" delay={0.25} /></span>
            <span className="mid"><Chars text="trading stocks" delay={0.7} step={0.025} /></span>
            <span className="big"><Chars text="for " delay={1.05} /><Chars text="you" delay={1.2} className="hl glow" step={0.08} /></span>
          </h1>
          <motion.div className="ohero-ctas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.7 }}>
            <Magnetic><a className="pill-btn on-dark" href="#stake">Stake &amp; earn NVDA →</a></Magnetic>
            <Magnetic><a className="pill-btn go pulse-btn" href={PONS} target="_blank" rel="noreferrer">Buy $OVERMIND</a></Magnetic>
          </motion.div>
          {arena && stk && (
            <motion.div className="ohero-live" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.8, ease: EASE }}>
              <div><span><i className="live-dot" /> Paid to holders</span><b>$<Count value={stk.paidUsd} format={(x) => usd(x)} /></b></div>
              <div><span>Last 24h</span><b className="acid">+$<Count value={last24} format={(x) => usd(x)} /></b></div>
              <div><span>Trades 24h</span><b><Count value={trades24} format={(x) => Math.round(x).toString()} /></b></div>
              <div><span>AI managing</span><b>$<Count value={tvl} format={(x) => big(x)} /></b></div>
            </motion.div>
          )}
        </div>
        {th && (
          <div className="ohero-stream" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={th.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                <b>{th.name.toUpperCase()} · {ago(now - th.t).toUpperCase()}</b>
                <p>“<Typewriter text={th.thought} />”</p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
        <div className="badge-spin" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs><path id="circ" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" /></defs>
            <text><textPath href="#circ">It never sleeps • you get paid • </textPath></text>
          </svg>
          <span className="core">24/7</span>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <motion.div className="marquee-track" style={{ skewX: skew }}>
          {[0, 1].map((k) => (
            <React.Fragment key={k}>
              <span>It never sleeps</span><span>—</span><span className="g">Hold $OVERMIND</span><span>—</span><span>Earn NVIDIA</span><span>—</span>
              <span>4 AI minds</span><span>—</span><span>Stocks 24/7</span><span>—</span><span className="g">You get paid</span><span>—</span>
            </React.Fragment>
          ))}
        </motion.div>
      </div>
      <div className="marquee rev" aria-hidden="true">
        <motion.div className="marquee-track" style={{ skewX: skew }}>
          {[0, 1].map((k) => (
            <React.Fragment key={k}>
              {live.length ? live.map((e) => (
                <React.Fragment key={e.key}>
                  <span>{e.name}</span><span className={e.isBuy ? "g" : ""}>{e.isBuy ? "bought" : "sold"} {e.symbol}</span><span>${big(e.usd)}</span><span>—</span>
                </React.Fragment>
              )) : (
                <><span>Atlas</span><span>—</span><span>Volt</span><span>—</span><span className="g">Echo</span><span>—</span><span>Sage</span><span>—</span></>
              )}
            </React.Fragment>
          ))}
        </motion.div>
      </div>

      {!DEP ? <p className="notice2">Arena not deployed. Run start-demo.ps1.</p>
        : err && !arena ? <p className="notice2">Can't reach the chain — {err}. Run start-demo.ps1 and reload.</p>
          : arena && (
            <>
              <Bento stk={stk} last24={last24} arena={arena} now={now} />
              <Minds vaults={arena.vaults} now={now} />
              <Stake stk={stk} nvda={arena.nvda} wallet={wallet} connect={connect} refresh={refresh} notify={notify} now={now} />
              <Roadmap />
              <Guard />
            </>
          )}

      <footer className="ofoot">
        <div className="wrap">
          <div className="ofoot-in">
            <motion.div className="ofoot-big" style={{ x: footX }}>Over<span>mind</span></motion.div>
            <div className="ofoot-links"><a href="#how">How it works</a><a href="#minds">The minds</a><a href="#stake">Stake</a><a href={PONS} target="_blank" rel="noreferrer">Buy on Pons ↗</a></div>
          </div>
          {GLASS_TOKEN && (
            <button className="ofoot-ca" onClick={() => { navigator.clipboard?.writeText(GLASS_TOKEN); notify("ok", "Contract address copied"); }} title="Copy contract address">
              <span>$OVERMIND CA</span><code>{GLASS_TOKEN}</code><em>copy</em>
            </button>
          )}
          <p className="ofoot-fine">It never sleeps. You get paid. · {STATIC ? "Preview · simulated demo data" : NETWORK === "rhTestnet" ? "Robinhood Chain testnet" : "Local demo"} · test assets · contracts unaudited · not financial advice · not affiliated with Robinhood</p>
        </div>
      </footer>

      <AnimatePresence>
        {toast && <motion.div className={`otoast ${toast.kind}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toast.text}</motion.div>}
      </AnimatePresence>
    </MotionConfig>
  );
}

/** 2026-style bento grid: the payout counter, the how-to, the leader, live stock prices and the safety promise. */
function Bento({ stk, last24, arena, now }) {
  const lead = arena.vaults[0];
  const bars = stk?.payouts.slice(-28) ?? [];
  const maxBar = Math.max(1e-9, ...bars.map((b) => b.usd));
  const ch24 = (s) => { let v = s.series[0]?.p; for (const x of s.series) { if (x.t > now - 86400) break; v = x.p; } return v ? s.price / v - 1 : 0; };
  const steps = [
    ["01", "Hold & stake $OVERMIND", "Buy on Pons, stake here."],
    ["02", "Four AI minds trade", "Stocks, 24/7, every thought on-chain."],
    ["03", "Their cut becomes your NVDA", "Fees on new highs → NVIDIA → you."],
  ];
  return (
    <section id="how" className="bento wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="How it works" />
        <Words>Three steps. <i>Zero effort.</i></Words>
      </div>
      <div className="bento-grid">
        <motion.div className="b-paid" {...reveal(0)}>
          <Tilt className="tile" max={3}>
            <span className="t-label"><i className="live-dot" /> Paid to $OVERMIND holders</span>
            <div className="paid-num"><span className="cur">$</span>{stk ? <Count value={stk.paidUsd} format={(x) => usd(x)} /> : "—"}</div>
            <div className="paid-sub">
              <span className="tag g">in NVIDIA stock tokens</span>
              {last24 > 0 && <span className="tag">+${usd(last24)} 24h</span>}
              {stk && <span className="tag">{stk.rounds} payouts</span>}
            </div>
            <div className="t-bars">
              {bars.map((b, i) => (
                <motion.span key={`${b.t}-${i}`} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.025, duration: 0.6, ease: EASE }} style={{ height: `${Math.max(8, (b.usd / maxBar) * 100)}%` }} />
              ))}
            </div>
          </Tilt>
        </motion.div>

        <motion.div className="b-steps" {...reveal(1)}>
          <Tilt className="tile" max={3}>
            <span className="t-label">The loop</span>
            <ol className="t-steps">
              {steps.map(([n, t, d]) => (
                <li key={n}><span className="t-n">{n}</span><div><b>{t}</b><span>{d}</span></div></li>
              ))}
            </ol>
          </Tilt>
        </motion.div>

        <motion.div className="b-lead" {...reveal(2)}>
          <Tilt className="tile chrome" max={6}>
            <span className="t-label">#1 mind right now</span>
            <div className="t-lead">
              <span className="mind-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d={ICONS[lead.persona.key] || ICONS.atlas} /></svg></span>
              <b>{lead.persona.name}</b>
            </div>
            <div className="t-big">{pctS(lead.ret)}</div>
            <span className="t-foot">{lead.persona.style} · {lead.trades} trades</span>
          </Tilt>
        </motion.div>

        <motion.div className="b-stocks" {...reveal(3)}>
          <Tilt className="tile" max={6}>
            <span className="t-label"><i className="live-dot" /> What they trade · 24/7</span>
            <ul className="t-stocks">
              {arena.stocks.map((s) => {
                const c = ch24(s);
                return <li key={s.symbol}><b>{s.symbol}</b><span>${s.price.toFixed(2)}</span><em className={c >= 0 ? "pos" : "neg"}>{c >= 0 ? "▲" : "▼"} {Math.abs(c * 100).toFixed(1)}%</em></li>;
              })}
            </ul>
          </Tilt>
        </motion.div>

        <motion.div className="b-safe" {...reveal(4)}>
          <Tilt className="tile" max={6}>
            <span className="t-label">Guardrails</span>
            <svg className="t-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" />
            </svg>
            <b className="t-safe">They can't take it.</b>
            <span className="t-foot">The agent's key can only call trade(). Nothing pays the agent.</span>
          </Tilt>
        </motion.div>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    ["01", "Hold & stake $OVERMIND", "Buy it on Pons, stake it here. That's the whole job."],
    ["02", "Four AI minds trade", "Atlas, Volt, Echo and Sage trade NVIDIA, Tesla, Apple, Amazon, Robinhood and Coinbase. 24/7. Every thought on-chain."],
    ["03", "Their cut becomes your NVDA", "On every new profit high a mind takes a fee. The treasury turns it into NVIDIA and streams it to stakers."],
  ];
  return (
    <section id="how" className="osec wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="How it works" />
        <Words>Three steps. <i>Zero effort.</i></Words>
      </div>
      <div className="steps3">
        {steps.map(([n, t, d], i) => (
          <motion.div key={n} {...reveal(i)}>
            <Tilt className="step"><span className="step-n">{n}</span><h3>{t}</h3><p>{d}</p></Tilt>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Minds({ vaults, now }) {
  return (
    <section id="minds" className="osec wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="The minds" />
        <Words>Four personalities. <i>One job.</i></Words>
        <motion.p {...reveal(2)}>Each one trades its own way. The leader glows.</motion.p>
      </div>
      <div className="minds-stack">
        {vaults.map((v, i) => {
          const last = v.feed.find((e) => e.kind === "trade") || v.feed[0];
          return (
            <motion.div key={v.address} className="stack-item" style={{ top: 96 + i * 26, zIndex: i + 1 }} {...reveal(i)}>
            <Tilt className={`mind ${i === 0 ? "lead" : ""}`} max={5}>
              {i === 0 && <span className="tag crown-tag">#1 right now</span>}
              <div className="mind-top">
                <span className="mind-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d={ICONS[v.persona.key] || ICONS.atlas} /></svg></span>
                <div className="mind-name"><h3>{v.persona.name}</h3><span>{v.persona.style}</span></div>
                <b className="mind-ret">{pctS(v.ret)}</b>
              </div>
              {last && <p className="mind-q">“{last.thought}”</p>}
              <div className="mind-meta"><span>{v.trades} trades</span><span>{last ? ago(now - last.t) : ""}</span><span>{v.halted ? "halted" : "live"}</span></div>
            </Tilt>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function Stake({ stk, nvda, wallet, connect, refresh, notify, now }) {
  const [pos, setPos] = useState(null);
  const [mode, setMode] = useState("stake");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { if (wallet) setPos(await loadStake(wallet.address)); }, [wallet]);
  useEffect(() => { reload(); const t = setInterval(reload, 8000); return () => clearInterval(t); }, [reload]);

  const n = Number(amt) || 0;
  const max = pos ? (mode === "stake" ? pos.balanceNum : pos.stakedNum) : 0;
  const share = stk && pos ? (pos.stakedNum + (mode === "stake" ? n : -n)) / Math.max(1e-9, stk.totalStaked + (mode === "stake" ? n : -n)) : 0;
  const run = async (label, fn) => {
    setBusy(true);
    try { await fn(); notify("ok", label); setAmt(""); await refresh(); await reload(); }
    catch (e) { notify("err", errMsg(e)); } finally { setBusy(false); }
  };
  const submit = () => run(mode === "stake" ? "Staked — you're earning NVDA" : "Unstaked", async () => {
    const a = ethers.parseUnits(String(n), 18);
    const s = stakingAt(wallet.signer);
    if (mode === "stake") { await ensureGlassAllowance(wallet.signer, a); await (await s.stake(a)).wait(); }
    else await (await s.unstake(a)).wait();
  });
  const claim = () => run("NVDA sent to your wallet", async () => { await (await stakingAt(wallet.signer).claim()).wait(); });
  const bars = stk?.payouts.slice(-20) ?? [];
  const maxBar = Math.max(1e-9, ...bars.map((b) => b.usd));

  return (
    <section id="stake" className="osec wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="Stake" />
        <Words>Stake $OVERMIND. <i>Get paid in NVIDIA.</i></Words>
      </div>
      <div className="stake2">
        <motion.div className="box" {...reveal(1)}>
          <div className="kv3">
            <div><span>Paid out</span><b>${stk ? usd(stk.paidUsd, 0) : "—"}</b><em>{stk ? `${stk.paidNvda.toFixed(3)} NVDA` : ""}</em></div>
            <div><span>$OVERMIND staked</span><b>{stk ? big(stk.totalStaked) : "—"}</b><em>{stk ? `${((stk.totalStaked / 1e9) * 100).toFixed(1)}% of supply` : ""}</em></div>
            {(() => {
              const la = stk?.payouts.length ? ago(now - stk.payouts[stk.payouts.length - 1].t) : null;
              return <div><span>Last payout</span><b>{!la ? "—" : la === "just now" ? "Now" : la.replace(" ago", "")}</b><em>{!la ? "" : la === "just now" ? "just paid" : "ago"}</em></div>;
            })()}
          </div>
          <div>
            <div className="bars2">
              {bars.map((b, i) => (
                <motion.span key={`${b.t}-${i}`} title={`$${usd(b.usd)} · ${b.nvda.toFixed(4)} NVDA`} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.03, duration: 0.5, ease: EASE }} style={{ height: `${Math.max(6, (b.usd / maxBar) * 100)}%` }} />
              ))}
            </div>
            <div className="bars2-base" />
          </div>
          <p className="fine">Each bar is one payout from the treasury to stakers</p>
        </motion.div>

        <motion.div className="box" {...reveal(2)}>
          {!wallet ? (
            <div className="empty2">
              <p>Connect a wallet to stake $OVERMIND and start collecting NVDA.</p>
              <button className="pill-btn go wide" onClick={connect}>Connect wallet</button>
              <a className="pill-btn wide" href={PONS} target="_blank" rel="noreferrer">No $OVERMIND yet? Buy on Pons →</a>
            </div>
          ) : (
            <>
              <div className="earned">
                <span>You've earned</span>
                <b>{pos ? `${pos.earnedNum.toFixed(5)} NVDA` : "…"}</b>
                <em>{pos ? `≈ $${usd(pos.earnedNum * nvda)}` : ""}</em>
                <button className="pill-btn sm" disabled={busy || !pos || pos.earnedNum <= 0} onClick={claim}>Claim</button>
              </div>
              <div className="seg2">
                {["stake", "unstake"].map((m) => <button key={m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setAmt(""); }}>{m}</button>)}
              </div>
              <label className="inp">
                <input inputMode="decimal" placeholder="0" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Amount of $OVERMIND" />
                <span>$OVERMIND</span>
                <button type="button" onClick={() => setAmt(String(Math.floor(max)))}>MAX</button>
              </label>
              <div className="meta2"><span>{mode === "stake" ? "Wallet" : "Staked"}: {pos ? big(max) : "…"}</span><span>Your share: {(share * 100).toFixed(2)}%</span></div>
              <button className="pill-btn go wide" disabled={busy || !n || n > max} onClick={submit}>
                {busy ? "Confirming…" : !n ? "Enter an amount" : n > max ? "Not enough $OVERMIND" : mode === "stake" ? `Stake ${big(n)} $OVERMIND` : `Unstake ${big(n)} $OVERMIND`}
              </button>
              <p className="fine">No lockup · unstake any time · earned NVDA stays claimable</p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Roadmap() {
  const phases = [
    ["Phase 01", "Wake up", "live", ["4 AI minds trading on Robinhood Chain", "Every trade + thought on-chain", "Guardrail vaults"]],
    ["Phase 02", "Get paid", "next", ["$OVERMIND launch on Pons", "Stake $OVERMIND → earn NVDA", "Public payout dashboard"]],
    ["Phase 03", "Grow the hive", "soon", ["More stocks: MSFT, META, PLTR", "Holders vote a 5th mind in", "Copy a mind's trades"]],
    ["Phase 04", "Overmind", "later", ["Minds learn from each other", "Pick which mind earns for you", "Open the arena to outside agents"]],
  ];
  return (
    <section id="roadmap" className="osec wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="Roadmap" />
        <Words>Where the minds <i>go next.</i></Words>
      </div>
      <div className="road">
        <motion.div className="road-line" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1.4, ease: EASE }} />
        {phases.map(([ph, title, state, items], i) => (
          <motion.div key={ph} className={`road-card ${state}`} {...reveal(i)}>
            <Tilt className="tile" max={5}>
              <span className="road-dot" />
              <div className="road-top"><span className="t-label">{ph}</span><span className={`road-state ${state}`}>{state === "live" ? "● Live" : state}</span></div>
              <b className="road-title">{title}</b>
              <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
            </Tilt>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Guard() {
  const rows = [
    ["They can't take it", "An agent's key can only call trade(). Nothing in the contract sends money to it."],
    ["They can't go all in", "Max 25–40% of a vault in one stock. Anything bigger is rejected on-chain."],
    ["They can't spiral", "A 15–30% drop from the peak halts trading automatically. Withdrawals never stop."],
    ["They can't hide", "Every trade carries its reasoning, written on-chain forever."],
  ];
  return (
    <section className="osec wrap">
      <div className="osec-head">
        <Scramble className="eyebrow" text="Guardrails" />
        <Words>They trade your money. <i>They can never take it.</i></Words>
      </div>
      <div className="guard2">
        {rows.map(([t, d], i) => (
          <motion.div key={t} className="grow" {...reveal(i)}><span className="n">0{i + 1}</span><b>{t}</b><p>{d}</p></motion.div>
        ))}
      </div>
      <motion.div className="final2" {...reveal(2)}>
        <a className="pill-btn" href="#stake">Stake &amp; earn NVDA →</a>
        <a className="pill-btn go" href={PONS} target="_blank" rel="noreferrer">Buy $OVERMIND</a>
      </motion.div>
    </section>
  );
}
