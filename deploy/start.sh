#!/usr/bin/env bash
# Runs the whole Overmind demo on the server (started by systemd as overmind.service):
#   demo chain -> seed 4 days of history -> build the site against it -> RPC gate -> live AI agents.
# If any part dies, everything stops and systemd restarts it from scratch (the Hardhat chain is in-memory).
set -euo pipefail
ROOT=/opt/overmind/app
WWW=/var/www/overmind
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

cd "$ROOT/contracts"
mkdir -p deployments
npx hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/overmind-chain.log 2>&1 &
for i in $(seq 1 120); do
  curl -sf -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null && break
  sleep 1
done

echo "seeding arena..."
npx hardhat run scripts/seed-arena.js --network localhost

echo "building site..."
cd "$ROOT/web"
npx vite build --mode server --outDir dist-server --emptyOutDir
find "$WWW" -mindepth 1 -delete
cp -r dist-server/. "$WWW/"

node "$ROOT/deploy/rpc-proxy.mjs" &

echo "starting agents..."
cd "$ROOT/agent"
TICK_SECONDS="${TICK_SECONDS:-30}" node src/arena.mjs --feed &

wait -n
echo "a component exited; restarting"
exit 1
