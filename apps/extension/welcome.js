// "Try it on a live token": point the button at the Pons token smart money is buying hardest right now.
fetch('https://api.overmind.ink/hive?limit=60&scope=pons')
  .then((r) => r.json())
  .then((b) => {
    const t = (b.tokens ?? []).filter((x) => x.voters >= 3).sort((a, z) => z.score - a.score)[0];
    if (!t) return;
    document.getElementById('try').href = `https://ponsfamily.com/launchpad/${t.token}`;
    document.getElementById('try').textContent = `Try it on $${t.symbol}`;
    document.getElementById('tryHint').textContent = `Smart money is buying it hardest right now (hive ${t.score > 0 ? '+' : ''}${Math.round(t.score)}).`;
  })
  .catch(() => {});
