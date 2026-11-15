// Public RPC gate for the demo chain: forwards only ordinary read / send-signed-tx methods to the Hardhat
// node, so visitors can't call hardhat_* / evm_* admin methods (setBalance, impersonate, reset, ...).
import http from "node:http";

const UPSTREAM = process.env.UPSTREAM || "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT || 8546);
const ALLOWED = new Set([
  "eth_chainId", "net_version", "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_getLogs", "eth_getBlockByNumber",
  "eth_getBlockByHash", "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_sendRawTransaction", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
]);
const MAX_BODY = 256 * 1024;

const deny = (id) => ({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: "Method not allowed on this RPC" } });

async function forward(payload) {
  const r = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return r.json();
}

http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "POST only" });
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
  req.on("end", async () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    try {
      if (Array.isArray(body)) {
        if (body.length > 100) return send(400, { error: "Batch too large" });
        const ok = body.filter((m) => ALLOWED.has(m?.method));
        const results = ok.length ? await forward(ok) : [];
        const byId = new Map((Array.isArray(results) ? results : [results]).map((r) => [r.id, r]));
        return send(200, body.map((m) => (ALLOWED.has(m?.method) ? byId.get(m.id) ?? deny(m.id) : deny(m?.id))));
      }
      if (!ALLOWED.has(body?.method)) return send(200, deny(body?.id));
      return send(200, await forward(body));
    } catch (e) {
      return send(502, { jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32603, message: "Chain unavailable" } });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`rpc gate on 127.0.0.1:${PORT} -> ${UPSTREAM}`));
