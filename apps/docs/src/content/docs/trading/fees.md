---
title: Fees
description: Overmind's platform fee during the beta, the referral discount, and how it's collected.
---

| | Fee |
| --- | --- |
| **Beta** | **0.25%** of the trade |
| After the beta | 0.5% of the trade |
| Referred traders | 10% off: 0.22% in the beta (rounded in your favour), 0.45% after |

The fee is shown on every quote, for example "Overmind fee 0.25% (beta, half price)", with "referral discount" added when it applies. "Min received" is already net of it.

## How it's collected

- **Always on the quote side.** The fee is taken in ETH or USDG, never in the token you trade: from your input on buys, from your output on sells. A token's own tax can't shrink or block it.
- **Uniswap routes:** inside the same transaction, through Uniswap's audited Universal Router.
- **PONS bonding-curve trades:** a separate plain ETH transfer from your wallet, right after the trade confirms. A trade that fails pays nothing.
- **Agents** pay the same fee, inside the swap.

Other costs are not Overmind's: the pool's own fee, a PONS curve's fee and creator tax, any token tax, and gas. The quote lists them.

## Where fees go

Platform fees are paid to a public [wallet](https://robin.etherscan.io/address/0x17e2316217eec076da874825dad5160e4fd6be77). They fund development, infrastructure and audits. See [Fees](/overmind/fees-and-buybacks/).
