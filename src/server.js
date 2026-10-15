import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const port = Number(process.env.PORT || 3000);
const appName = "Vahid AI";
const coins = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "hyperliquid", symbol: "HYPE", name: "Hyperliquid" }
];
let cache = { at: 0, data: null };
const CACHE_MS = 20_000;

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function getCrypto() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return { ...cache.data, cache: true };
  const ids = coins.map(c => c.id).join(",");
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" +
    encodeURIComponent(ids) + "&price_change_percentage=24h";
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Market provider HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected market provider response");
  const byId = new Map(rows.map(row => [row.id, row]));
  const data = coins.map(c => {
    const row = byId.get(c.id);
    return row ? {
      id: c.id, symbol: c.symbol, name: c.name,
      price: Number.isFinite(row.current_price) ? row.current_price : null,
      change24h: Number.isFinite(row.price_change_percentage_24h) ? row.price_change_percentage_24h : null,
      marketCap: Number.isFinite(row.market_cap) ? row.market_cap : null,
      volume24h: Number.isFinite(row.total_volume) ? row.total_volume : null,
      sourceTime: row.last_updated || null,
      status: Number.isFinite(row.current_price) ? "LIVE" : "INSUFFICIENT_DATA"
    } : { id: c.id, symbol: c.symbol, name: c.name, price: null, change24h: null, marketCap: null, volume24h: null, sourceTime: null, status: "INSUFFICIENT_DATA" };
  });
  cache = { at: Date.now(), data: { status: "LIVE", source: "CoinGecko API", fetchedAt: new Date().toISOString(), assets: data } };
  return cache.data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }
  if (url.pathname === "/api/status") {
    return send(res, 200, { app: appName, version: "1.0.0", server: "ONLINE", marketData: "PROVIDER_CHECKED_PER_REQUEST", timestamp: new Date().toISOString(), note: "Live status means the API server is responding; each data module reports its own status." });
  }
  if (url.pathname === "/api/crypto") {
    try {
      const data = await getCrypto();
      return send(res, 200, data);
    } catch (error) {
      return send(res, 503, {
        status: "OFFLINE", source: "CoinGecko API", fetchedAt: null,
        error: "Live crypto data is currently unavailable. No prices have been fabricated.",
        detail: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined,
        assets: coins.map(c => ({ ...c, price: null, change24h: null, marketCap: null, volume24h: null, sourceTime: null, status: "INSUFFICIENT_DATA" }))
      });
    }
  }
  if (url.pathname === "/api/analysis") {
    return send(res, 200, {
      status: "INSUFFICIENT_DATA",
      message: "Order-flow, order-book liquidity and verified whale events are not yet connected to a dedicated provider. No trading signal is generated.",
      modules: {
        orderFlow: "NOT_CONNECTED",
        liquidity: "NOT_CONNECTED",
        whaleTracking: "NOT_CONNECTED",
        entryExit: "NOT_AVAILABLE"
      }
    });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try { return send(res, 200, await readFile(path.join(root, "index.html"), "utf8"), "text/html; charset=utf-8"); }
    catch { return send(res, 500, "UI file not found", "text/plain; charset=utf-8"); }
  }
  return send(res, 404, { error: "Not found" });
});

server.listen(port, "0.0.0.0", () => console.log(`Vahid AI listening on port ${port}`));