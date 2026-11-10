// Read-only OHLCV adapters. Only fully closed candles are returned.
const timeout = 9000;
function clean(rows, intervalMs) {
  const now=Date.now();
  return rows.map(c=>({time:Number(c.time),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume)}))
    .filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)&&Number.isFinite(c.volume)&&c.open>0&&c.low>0&&c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close)&&c.volume>=0&&c.time+intervalMs<=now)
    .sort((a,b)=>a.time-b.time);
}
async function json(url) {
  const r=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw new Error("HTTP "+r.status);
  return r.json();
}
export async function binanceCandles(symbol,interval) {
  const ms=interval==="5m"?300000:900000;
  const rows=await json("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit=120");
  if(!Array.isArray(rows))throw new Error("Unexpected Binance kline payload");
  return clean(rows.map(x=>({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})),ms);
}
export async function bybitCandles(symbol,interval) {
  const minutes=interval==="5m"?"5":"15",ms=interval==="5m"?300000:900000;
  const payload=await json("https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(symbol)+"&interval="+minutes+"&limit=120");
  if(payload.retCode!==0||!Array.isArray(payload.result?.list))throw new Error("Bybit: "+(payload.retMsg||"unexpected kline payload"));
  return clean(payload.result.list.map(x=>({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})),ms);
}
export async function getVenueCandles(provider,symbol,interval) {
  return provider==="Binance"?binanceCandles(symbol,interval):bybitCandles(symbol,interval);
}
export function comparePrices(a,b,maxDivergencePct=0.35) {
  const pa=a.at(-1)?.close,pb=b.at(-1)?.close;
  if(!Number.isFinite(pa)||!Number.isFinite(pb)||pa<=0||pb<=0)return {ok:false,divergencePct:null};
  const d=Math.abs(pa-pb)/((pa+pb)/2)*100;
  return {ok:d<=maxDivergencePct,divergencePct:Number(d.toFixed(4))};
}
export async function scanM5MultiSource(symbol) {
  const providers=["Binance","Bybit"];
  const results=await Promise.all(providers.map(async provider=>{
    try {
      const [candles5m,candles15m]=await Promise.all([
        getVenueCandles(provider,symbol,"5m"),getVenueCandles(provider,symbol,"15m")
      ]);
      if(candles5m.length<60||candles15m.length<60)throw new Error("Fewer than 60 closed candles");
      const last=candles5m.at(-1),age=Date.now()-(last.time+300000);
      if(age>600000)throw new Error("Latest closed 5m candle is stale");
      return {provider,status:"LIVE",candles5m,candles15m,lastPrice:last.close};
    } catch(e) { return {provider,status:"OFFLINE",error:String(e?.message||e).slice(0,180)}; }
  }));
  const good=results.filter(x=>x.status==="LIVE");
  if(good.length!==2)return {status:"PARTIAL_DATA",symbol,signal:"WAIT",score:null,reason:"Both independent venues must return fresh closed candles; no single-source trade signal is allowed.",providers:results.map(({provider,status,error})=>({provider,status,error:error||null})),source:"Binance + Bybit"};
  const alignment=comparePrices(good[0].candles5m,good[1].candles5m);
  if(!alignment.ok)return {status:"DATA_MISMATCH",symbol,signal:"WAIT",score:null,reason:"Venue prices differ by more than the 0.35% safety threshold.",divergencePct:alignment.divergencePct,providers:results.map(x=>({provider:x.provider,status:x.status})),source:"Binance + Bybit"};
  return {status:"LIVE",symbol,source:"Binance + Bybit",divergencePct:alignment.divergencePct,venues:good};
}
