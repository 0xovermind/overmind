# Overmind browser extension

Shows the Overmind hive score of a token right on its Pons and DexScreener page: what the ~300 most profitable wallets on Robinhood Chain are doing with it, live.

- **Pons:** `ponsfamily.com/launchpad/<token>`
- **DexScreener:** `dexscreener.com/robinhood/<pair>` (the pair is resolved to its token through DexScreener's public API)

The card refreshes every 30 seconds. Drag it by its header to move it; the position is remembered. Use `–` to shrink it to a small Overmind button.

## Install (developer mode)

1. Open `chrome://extensions` in Chrome, Edge or Brave.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.

## Privacy

The extension reads only the address in the page URL. It calls two hosts: `api.overmind.ink` (the hive score) and `api.dexscreener.com` (pair to token). It sends nothing about you, has no analytics and stores only the card's position on your device.
