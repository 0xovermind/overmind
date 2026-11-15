// Glassmind agent personas: identity, risk limits and a rule-based brain.
// The rule brain powers the local demo and is the fallback when no Claude API key is set.
// Shared by contracts/scripts/seed-arena.js (CommonJS) and agent/src/arena.mjs (via createRequire).

const PERSONAS = [
  {
    key: "atlas", name: "Atlas", symbol: "gATLAS", color: "#4ebe96",
    tagline: "Patient value. Buys quality on sale and holds through the noise.",
    maxPositionBps: 3500, maxDrawdownBps: 2000, perfFeeBps: 1000,
  },
  {
    key: "volt", name: "Volt", symbol: "gVOLT", color: "#ffa16c",
    tagline: "Momentum hunter. Rides what's moving, cuts what isn't.",
    maxPositionBps: 4000, maxDrawdownBps: 3000, perfFeeBps: 1500,
  },
  {
    key: "echo", name: "Echo", symbol: "gECHO", color: "#b6d6ff",
    tagline: "Contrarian. Fades the spikes, buys the panic.",
    maxPositionBps: 3500, maxDrawdownBps: 2500, perfFeeBps: 1000,
  },
  {
    key: "sage", name: "Sage", symbol: "gSAGE", color: "#d6fe51",
    tagline: "Balanced. Equal weight, steady rebalancing, sleeps well.",
    maxPositionBps: 2500, maxDrawdownBps: 1500, perfFeeBps: 800,
  },
];

const pctStr = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const money = (x) => `$${Math.round(x).toLocaleString("en-US")}`;

function pick(arr, r) {
  return arr[Math.floor(r * arr.length) % arr.length];
}

/**
 * @param persona one of PERSONAS
 * @param ctx { symbols, prices: {SYM: {now, h6, h24}}, holdings: {SYM: {tokens, value}}, cash, nav, rnd: () => [0,1) }
 * @returns { action: "buy"|"sell"|"hold", symbol?, usd?, fraction?, thought }
 */
function decide(persona, ctx) {
  const { symbols, prices, holdings, cash, nav, rnd } = ctx;
  const cap = (sym) => Math.max(0, nav * (persona.maxPositionBps / 10_000) * 0.95 - (holdings[sym]?.value || 0));
  const ch6 = (s) => prices[s].now / prices[s].h6 - 1;
  const ch24 = (s) => prices[s].now / prices[s].h24 - 1;
  const held = symbols.filter((s) => (holdings[s]?.value || 0) > 1);
  const weight = (s) => (holdings[s]?.value || 0) / nav;
  const r = rnd();

  if (persona.key === "atlas") {
    const cheap = symbols.map((s) => [s, ch24(s)]).sort((a, b) => a[1] - b[1])[0];
    if (cheap && cheap[1] < -0.025 && cash > 20) {
      const usd = Math.min(cash * 0.35, cap(cheap[0]));
      if (usd > 10) {
        return {
          action: "buy", symbol: cheap[0], usd,
          thought: pick([
            `${cheap[0]} is ${pctStr(cheap[1])} on the day. Nothing in the business changed overnight, the price did. Adding ${money(usd)}.`,
            `Quality on sale: ${cheap[0]} ${pctStr(cheap[1])} in 24h. I buy fear, not headlines. ${money(usd)} in, sized to stay under ${persona.maxPositionBps / 100}%.`,
            `${cheap[0]} dipped ${pctStr(cheap[1])}. Patience pays here — starting a ${money(usd)} position and leaving room to add.`,
          ], r),
        };
      }
    }
    const rich = held.map((s) => [s, ch24(s)]).sort((a, b) => b[1] - a[1])[0];
    if (rich && rich[1] > 0.04) {
      return {
        action: "sell", symbol: rich[0], fraction: 0.5,
        thought: `${rich[0]} ran ${pctStr(rich[1])} in a day. That's the market paying me early — trimming half, keeping the rest.`,
      };
    }
    return { action: "hold", thought: pick(["Nothing is cheap enough today. Holding is a position too.", "Watching. No price here is wrong enough to act on.", "Quiet tape. My edge is waiting, so I wait."], r) };
  }

  if (persona.key === "volt") {
    const loser = held.map((s) => [s, ch6(s)]).sort((a, b) => a[1] - b[1])[0];
    if (loser && loser[1] < -0.012) {
      return {
        action: "sell", symbol: loser[0], fraction: 1,
        thought: `${loser[0]} lost momentum: ${pctStr(loser[1])} in 6h. Rule one, cut what stops working. Out completely.`,
      };
    }
    const best = symbols.map((s) => [s, ch6(s)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0.012 && cash > 20) {
      const usd = Math.min(cash * 0.5, cap(best[0]));
      if (usd > 10) {
        return {
          action: "buy", symbol: best[0], usd,
          thought: pick([
            `${best[0]} is the strongest name on the board, ${pctStr(best[1])} in 6h. Trend is my friend — ${money(usd)} in.`,
            `Breakout on ${best[0]} (${pctStr(best[1])}, 6h). Chasing strength, stop is mental and tight. Buying ${money(usd)}.`,
            `${best[0]} won't stop. ${pctStr(best[1])} since this morning. Jumping on with ${money(usd)}.`,
          ], r),
        };
      }
    }
    return { action: "hold", thought: pick(["No clean trend right now. Sitting on my hands.", "Chop everywhere. Momentum needs direction — waiting for one.", "Nothing breaking out. Cash is ammo."], r) };
  }

  if (persona.key === "echo") {
    const spike = held.map((s) => [s, ch6(s)]).sort((a, b) => b[1] - a[1])[0];
    if (spike && spike[1] > 0.025) {
      return {
        action: "sell", symbol: spike[0], fraction: 0.6,
        thought: `Everyone wants ${spike[0]} after ${pctStr(spike[1])} in 6h. That's exactly when I sell. Taking 60% off.`,
      };
    }
    const crash = symbols.map((s) => [s, ch6(s)]).sort((a, b) => a[1] - b[1])[0];
    if (crash && crash[1] < -0.02 && cash > 20) {
      const usd = Math.min(cash * 0.4, cap(crash[0]));
      if (usd > 10) {
        return {
          action: "buy", symbol: crash[0], usd,
          thought: pick([
            `${crash[0]} ${pctStr(crash[1])} in 6h and the timeline is panicking. Panic is a price, and I'm a buyer: ${money(usd)}.`,
            `Blood on ${crash[0]} (${pctStr(crash[1])}). The crowd sells, I take the other side with ${money(usd)}.`,
          ], r),
        };
      }
    }
    return { action: "hold", thought: pick(["The crowd has no strong opinion today, so neither do I.", "No extremes to fade. Waiting for someone to panic.", "Consensus is boring. Holding."], r) };
  }

  // sage: equal-weight 80% invested, rebalance the biggest deviation
  const target = 0.8 / symbols.length;
  const dev = symbols.map((s) => [s, weight(s) - target]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  if (dev && Math.abs(dev[1]) > 0.04) {
    const [s, d] = dev;
    if (d < 0 && cash > 20) {
      const usd = Math.min(-d * nav, cash * 0.9, cap(s));
      if (usd > 10) return { action: "buy", symbol: s, usd, thought: `${s} is ${(weight(s) * 100).toFixed(1)}% of the book vs ${(target * 100).toFixed(1)}% target. Topping up ${money(usd)} to rebalance.` };
    } else if (d > 0) {
      const fraction = Math.min(1, d / weight(s));
      return { action: "sell", symbol: s, fraction, thought: `${s} drifted to ${(weight(s) * 100).toFixed(1)}% of the book. Trimming back to ${(target * 100).toFixed(1)}%. Discipline over drama.` };
    }
  }
  return { action: "hold", thought: pick(["Portfolio within bands. No action needed.", "Balanced and boring, by design.", "Weights on target. Doing nothing is the plan."], r) };
}

module.exports = { PERSONAS, decide };
