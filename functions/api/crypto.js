const coins = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "hyperliquid", symbol: "HYPE", name: "Hyperliquid" }
];

function normalize(c, price, change24h, marketCap, volume24h, sourceTime) {
  return {
    id: c.id, symbol: c.symbol, name: c.name,
    price: Number.isFinite(price) ? price : null,
    change24h: Number.isFinite(change24h) ? change24h : null,
    marketCap: Number.isFinite(marketCap) ? marketCap : null,
    volume24h: Number.isFinite(volume24h) ? volume24h : null,
    sourceTime: sourceTime || null,
    status: Number.isFinite(price) ? "LIVE" : "INSUFFICIENT_DATA"
  };
}

async function request(url, timeout = 8000) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "VahidAI/1.0" },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error("Provider HTTP " + response.status);
  return response.json();
}

export async function onRequest() {
  const errors = [];
  try {
    const ids = coins.map(c => c.id).join(",");
    const rows = await request("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + encodeURIComponent(ids) + "&price_change_percentage=24h");
    if (!Array.isArray(rows)) throw new Error("Unexpected response");
    const map = new Map(rows.map(r => [r.id, r]));
    const assets = coins.map(c => {
      const r = map.get(c.id);
      return normalize(c, r?.current_price, r?.price_change_percentage_24h, r?.market_cap, r?.total_volume, r?.last_updated);
    });
    if (assets.some(a => a.price !== null)) return Response.json({
      status: "LIVE", source: "CoinGecko API", fetchedAt: new Date().toISOString(), assets
    }, { headers: { "Cache-Control": "no-store" } });
    errors.push("CoinGecko returned no usable prices");
  } catch (e) { errors.push("CoinGecko: " + String(e?.message || e)); }

  try {
    const payload = await request("https://api.coincap.io/v2/assets?limit=100");
    if (!Array.isArray(payload.data)) throw new Error("Unexpected response");
    const map = new Map(payload.data.map(r => [String(r.symbol || "").toUpperCase(), r]));
    const assets = coins.map(c => {
      const r = map.get(c.symbol);
      return normalize(c, r ? Number(r.priceUsd) : NaN, r ? Number(r.changePercent24Hr) : NaN,
        r ? Number(r.marketCapUsd) : NaN, r ? Number(r.volumeUsd24Hr) : NaN, null);
    });
    if (!assets.some(a => a.price !== null)) throw new Error("No usable prices");
    return Response.json({ status: "LIVE", source: "CoinCap API (fallback)", fetchedAt: new Date().toISOString(), assets },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) { errors.push("CoinCap: " + String(e?.message || e)); }

  try {
    const rows = await request("https://api.binance.com/api/v3/ticker/24hr");
    if (!Array.isArray(rows)) throw new Error("Unexpected response");
    const map = new Map(rows.map(r => [String(r.symbol || "").toUpperCase(), r]));
    const assets = coins.map(c => {
      const r = map.get(c.symbol + "USDT");
      return normalize(c, r ? Number(r.lastPrice) : NaN, r ? Number(r.priceChangePercent) : NaN,
        NaN, r ? Number(r.quoteVolume) : NaN, r?.closeTime ? new Date(Number(r.closeTime)).toISOString() : null);
    });
    if (!assets.some(a => a.price !== null)) throw new Error("No usable prices");
    return Response.json({ status: "LIVE", source: "Binance public market ticker (fallback)", fetchedAt: new Date().toISOString(), assets },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) { errors.push("Binance: " + String(e?.message || e)); }

  try {
    const rows = await request("https://api.coinpaprika.com/v1/tickers?quotes=USD", 10000);
    if (!Array.isArray(rows)) throw new Error("Unexpected response");
    const map = new Map();
    for (const r of rows) {
      const s = String(r.symbol || "").toUpperCase();
      if (s && !map.has(s)) map.set(s, r);
    }
    const assets = coins.map(c => {
      const r = map.get(c.symbol), q = r?.quotes?.USD;
      return normalize(c, q ? Number(q.price) : NaN, q ? Number(q.percent_change_24h) : NaN,
        q ? Number(q.market_cap) : NaN, q ? Number(q.volume_24h) : NaN, r?.last_updated);
    });
    if (!assets.some(a => a.price !== null)) throw new Error("No usable prices");
    return Response.json({ status: "LIVE", source: "CoinPaprika API (fallback)", fetchedAt: new Date().toISOString(), assets },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) { errors.push("CoinPaprika: " + String(e?.message || e)); }

  return Response.json({
    status: "OFFLINE", source: "CoinGecko / CoinCap / Binance / CoinPaprika", fetchedAt: null,
    error: "Live crypto data is currently unavailable. No prices have been fabricated.",
    detail: errors.join(" | ").slice(0, 700),
    assets: coins.map(c => normalize(c, NaN, NaN, NaN, NaN, null))
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
