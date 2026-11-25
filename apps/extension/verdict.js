// One plain-English line that says what the numbers mean for someone about to buy: the hive's lean and the safety
// check, combined. Shared by the card on token pages (content script) and the toolbar window.
// eslint-disable-next-line no-unused-vars
function overmindVerdict(consensus, safety, minVoters = 3) {
  const has = consensus && consensus.voters >= minVoters;
  const s = has ? Math.round(consensus.score) : null;
  const risk = safety?.risk;
  const reason = (safety?.reasons ?? [])[0]?.text ?? null;
  const flag = risk === 'high' ? 'high' : risk === 'medium' ? 'medium' : null;
  const n = consensus ? consensus.smart_buyers + consensus.smart_sellers : 0;
  const buys = s >= 60 ? 'Smart money is buying' : 'Smart money is leaning in';
  const sells = s <= -60 ? 'Smart money is leaving' : 'Smart money is leaning out of';
  if (has && s >= 20) {
    if (!flag) return { tone: 'good', icon: '✓', text: `${buys} and there are no red flags.` };
    return { tone: 'warn', icon: '!', text: `${buys}, but watch out: ${reason ?? `${flag} risk`}.` };
  }
  if (has && s <= -20)
    return { tone: 'bad', icon: '↓', text: flag ? `${sells === 'Smart money is leaving' ? 'Smart money is leaving' : 'Smart money is leaning out'}, and ${reason ?? `it is ${flag} risk`}.` : `${sells} this token.` };
  if (has) return { tone: 'neutral', icon: '≈', text: `Smart money is split on it${flag ? `, and ${reason ?? `it is ${flag} risk`}` : ''}.` };
  if (risk === 'high') return { tone: 'bad', icon: '!', text: `High risk: ${reason ?? 'red flags in holders, bundles or dev history'}.` };
  if (risk === 'medium') return { tone: 'warn', icon: '!', text: `Too early for smart money${n ? ` (only ${n} traded it)` : ''}. Watch out: ${reason ?? 'medium risk'}.` };
  if (risk === 'low') return { tone: 'neutral', icon: '…', text: `Too early: smart money hasn't really traded it yet${n ? ` (${n} wallet${n === 1 ? '' : 's'})` : ''}. No red flags so far.` };
  return { tone: 'neutral', icon: '…', text: 'Not enough data on this token yet.' };
}
