import { liveMarkets, liveCandles, liveOrderFlow } from "./live-data.js";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const port = Number(process.env.PORT || 3000);
const appName = "AlphaFlow";
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
  const errors = [];
  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" +
      encodeURIComponent(ids) + "&price_change_percentage=24h";
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("CoinGecko HTTP " + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected CoinGecko response");
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
    cache = { at: Date.now(), data: { status: data.some(a => a.price !== null) ? "LIVE" : "INSUFFICIENT_DATA", source: "CoinGecko API", fetchedAt: new Date().toISOString(), assets: data } };
    if (data.some(a => a.price !== null)) return cache.data;
    errors.push("CoinGecko returned no usable prices");
  } catch (e) { errors.push("CoinGecko: " + String(e?.message || e)); }

  try {
    const map = new Map(coins.map(c => [c.id, c]));
    const response = await fetch("https://api.coincap.io/v2/assets?limit=100", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("CoinCap HTTP " + response.status);
    const payload = await response.json();
    if (!Array.isArray(payload.data)) throw new Error("Unexpected CoinCap response");
    const bySymbol = new Map(payload.data.map(row => [String(row.symbol || "").toUpperCase(), row]));
    const data = coins.map(c => {
      const row = bySymbol.get(c.symbol);
      const price = row && row.priceUsd != null ? Number(row.priceUsd) : null;
      const change = row && row.changePercent24Hr != null ? Number(row.changePercent24Hr) : null;
      const cap = row && row.marketCapUsd != null ? Number(row.marketCapUsd) : null;
      const volume = row && row.volumeUsd24Hr != null ? Number(row.volumeUsd24Hr) : null;
      return { id: c.id, symbol: c.symbol, name: c.name, price: Number.isFinite(price) ? price : null,
        change24h: Number.isFinite(change) ? change : null, marketCap: Number.isFinite(cap) ? cap : null,
        volume24h: Number.isFinite(volume) ? volume : null, sourceTime: null,
        status: Number.isFinite(price) ? "LIVE" : "INSUFFICIENT_DATA" };
    });
    if (!data.some(a => a.price !== null)) throw new Error("CoinCap returned no usable prices");
    cache = { at: Date.now(), data: { status: "LIVE", source: "CoinCap API (fallback)", fetchedAt: new Date().toISOString(), assets: data } };
    return cache.data;
  } catch (e) { errors.push("CoinCap: " + String(e?.message || e)); }

  try {
    // Third fallback: public Binance spot ticker. This is market-price data only,
    // not a source for whale identity or on-chain events.
    const symbols = coins.map(c => c.symbol + "USDT");
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Binance HTTP " + response.status);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Unexpected Binance response");
    const bySymbol = new Map(payload.map(row => [String(row.symbol || "").toUpperCase(), row]));
    const data = coins.map(c => {
      const row = bySymbol.get((c.symbol + "USDT").toUpperCase());
      const price = row && row.lastPrice != null ? Number(row.lastPrice) : null;
      const change = row && row.priceChangePercent != null ? Number(row.priceChangePercent) : null;
      const volume = row && row.quoteVolume != null ? Number(row.quoteVolume) : null;
      return { id: c.id, symbol: c.symbol, name: c.name,
        price: Number.isFinite(price) ? price : null,
        change24h: Number.isFinite(change) ? change : null,
        marketCap: null, volume24h: Number.isFinite(volume) ? volume : null,
        sourceTime: row && row.closeTime ? new Date(Number(row.closeTime)).toISOString() : null,
        status: Number.isFinite(price) ? "LIVE" : "INSUFFICIENT_DATA" };
    });
    if (!data.some(a => a.price !== null)) throw new Error("Binance returned no usable prices");
    cache = { at: Date.now(), data: { status: "LIVE", source: "Binance public market ticker (fallback)", fetchedAt: new Date().toISOString(), assets: data } };
    return cache.data;
  } catch (e) { errors.push("Binance: " + String(e?.message || e)); }

  try {
    // Fourth fallback: CoinPaprika public ticker feed.
    const response = await fetch("https://api.coinpaprika.com/v1/tickers?quotes=USD", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error("CoinPaprika HTTP " + response.status);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Unexpected CoinPaprika response");
    const bySymbol = new Map();
    for (const row of payload) {
      const symbol = String(row.symbol || "").toUpperCase();
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, row);
    }
    const data = coins.map(c => {
      const row = bySymbol.get(c.symbol);
      const quote = row && row.quotes && row.quotes.USD;
      const price = quote && quote.price != null ? Number(quote.price) : null;
      const change = quote && quote.percent_change_24h != null ? Number(quote.percent_change_24h) : null;
      const cap = quote && quote.market_cap != null ? Number(quote.market_cap) : null;
      const volume = quote && quote.volume_24h != null ? Number(quote.volume_24h) : null;
      return { id: c.id, symbol: c.symbol, name: c.name,
        price: Number.isFinite(price) ? price : null,
        change24h: Number.isFinite(change) ? change : null,
        marketCap: Number.isFinite(cap) ? cap : null,
        volume24h: Number.isFinite(volume) ? volume : null,
        sourceTime: row && row.last_updated ? row.last_updated : null,
        status: Number.isFinite(price) ? "LIVE" : "INSUFFICIENT_DATA" };
    });
    if (!data.some(a => a.price !== null)) throw new Error("CoinPaprika returned no usable prices");
    cache = { at: Date.now(), data: { status: "LIVE", source: "CoinPaprika API (fallback)", fetchedAt: new Date().toISOString(), assets: data } };
    return cache.data;
  } catch (e) { errors.push("CoinPaprika: " + String(e?.message || e)); }

  throw new Error(errors.join(" | "));
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
        status: "OFFLINE", source: "CoinGecko / CoinCap / Binance", fetchedAt: null,
        error: "Live crypto data is currently unavailable. No prices have been fabricated.",
        // Provider diagnostics contain only network errors/status codes, never credentials.
        detail: String(error?.message || error).slice(0, 700),
        assets: coins.map(c => ({ ...c, price: null, change24h: null, marketCap: null, volume24h: null, sourceTime: null, status: "INSUFFICIENT_DATA" }))
      });
    }
  }

  if (url.pathname === "/api/markets") {
    try { return send(res, 200, await liveMarkets()); }
    catch (error) { return send(res, 503, {status:"OFFLINE",source:"CoinGecko / CoinPaprika",count:0,fetchedAt:null,error:"Live market list unavailable; no sample data is substituted.",detail:String(error?.message||error).slice(0,500),assets:[]}); }
  }
  if (url.pathname === "/api/candles") {
    try { return send(res, 200, await liveCandles(url.searchParams.get("symbol"),url.searchParams.get("timeframe"),url.searchParams.get("limit"))); }
    catch (error) { return send(res, 503, {status:"OFFLINE",error:"Real OHLCV unavailable.",detail:String(error?.message||error).slice(0,300),candles:[]}); }
  }
  if (url.pathname === "/api/orderflow") {
    try { return send(res, 200, await liveOrderFlow(url.searchParams.get("symbol"))); }
    catch (error) { return send(res, 503, {status:"OFFLINE",symbol:String(url.searchParams.get("symbol")||"BTCUSDT"),error:"Live order-flow data unavailable.",detail:String(error?.message||error).slice(0,300)}); }
  }
  if (url.pathname === "/api/forex") return send(res, 200, {status:"INSUFFICIENT_DATA",source:null,message:"A verified forex/gold data provider and credentials are required; no prices are fabricated.",symbols:["XAUUSD","EURUSD","GBPUSD","USDJPY"]});
  if (url.pathname === "/api/whales") return send(res, 200, {status:"INSUFFICIENT_DATA",source:null,message:"Wallet discovery and entity labels are not configured; no whale counts or wallet events are fabricated.",providers:{debank:process.env.DEBANK_API_KEY?"CONFIGURED":"NOT_CONFIGURED",hypurrscan:"NOT_CONNECTED"}});

  if (url.pathname === "/api/analysis") {
    return send(res, 200, {
      status: "INSUFFICIENT_DATA",
      message: "Live order-book and recent aggregated-trade data are available through /api/orderflow for supported Binance spot pairs. OHLCV-based liquidity sweep candidates are available through /api/candles. Verified on-chain whale discovery, engineered-liquidity proof, and AI signal scoring are not configured; no trading signal is generated.",
      modules: {
        orderFlow: "CONNECTED_BINANCE_PUBLIC_API",
        candles: "CONNECTED_BINANCE_PUBLIC_API",
        liquiditySweep: "OHLCV_HEURISTIC_ONLY",
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

server.listen(port, "0.0.0.0", () => console.log(`AlphaFlow listening on port ${port}`));