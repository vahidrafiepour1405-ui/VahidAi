const TF = {"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1H":"1h","2H":"2h","4H":"4h","6H":"6h","12H":"12h","1D":"1d","3D":"3d","1W":"1w","1M":"1M"};
function symbolOf(v){const s=String(v||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g,"");return /^[A-Z0-9]{5,20}$/.test(s)?s:"BTCUSDT";}
async function getJson(url){const r=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error("Provider HTTP "+r.status);return r.json();}
export async function liveMarkets(){
 const errors=[];
 try{
  const rows=await getJson("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h");
  if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid CoinGecko response");
  return {status:"LIVE",source:"CoinGecko API",count:rows.length,fetchedAt:new Date().toISOString(),assets:rows.map(x=>({id:x.id,symbol:String(x.symbol||"").toUpperCase(),name:x.name,price:Number.isFinite(x.current_price)?x.current_price:null,change24h:Number.isFinite(x.price_change_percentage_24h)?x.price_change_percentage_24h:null,marketCap:Number.isFinite(x.market_cap)?x.market_cap:null,volume24h:Number.isFinite(x.total_volume)?x.total_volume:null,rank:x.market_cap_rank??null,image:x.image||null,sourceTime:x.last_updated||null,status:Number.isFinite(x.current_price)?"LIVE":"INSUFFICIENT_DATA"}))};
 }catch(e){errors.push(String(e?.message||e));}
 try{
  const rows=await getJson("https://api.coinpaprika.com/v1/tickers?quotes=USD");
  if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid CoinPaprika response");
  const assets=rows.slice(0,200).map((x,i)=>({id:x.id,symbol:String(x.symbol||"").toUpperCase(),name:x.name,price:Number.isFinite(Number(x.quotes?.USD?.price))?Number(x.quotes.USD.price):null,change24h:Number.isFinite(Number(x.quotes?.USD?.percent_change_24h))?Number(x.quotes.USD.percent_change_24h):null,marketCap:Number.isFinite(Number(x.quotes?.USD?.market_cap))?Number(x.quotes.USD.market_cap):null,volume24h:Number.isFinite(Number(x.quotes?.USD?.volume_24h))?Number(x.quotes.USD.volume_24h):null,rank:Number.isFinite(Number(x.rank))?Number(x.rank):i+1,image:null,sourceTime:x.last_updated||null,status:x.quotes?.USD?.price!=null?"LIVE":"INSUFFICIENT_DATA"}));
  return {status:"LIVE",source:"CoinPaprika API fallback",count:assets.length,fetchedAt:new Date().toISOString(),assets};
 }catch(e){errors.push(String(e?.message||e));}
 throw new Error(errors.join(" | "));
}
export async function liveCandles(symbol,timeframe="4H",limit=100){
 const s=symbolOf(symbol),tf=TF[String(timeframe)]||"4h",n=Math.min(500,Math.max(20,Number(limit)||100));
 const rows=await getJson("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval="+encodeURIComponent(tf)+"&limit="+n);
 if(!Array.isArray(rows)||!rows.length)throw new Error("No OHLCV returned for "+s);
 const candles=rows.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]),closeTime:Number(x[6]),quoteVolume:Number(x[7]),trades:Number(x[8])}));
 const last=candles[candles.length-1],prev=candles[candles.length-2],recent=candles.slice(-30),tol=last.close*0.0015,hi=Math.max(...recent.map(c=>c.high)),lo=Math.min(...recent.map(c=>c.low));
 return {status:"LIVE",source:"Binance public OHLCV",symbol:s,timeframe:tf,fetchedAt:new Date().toISOString(),count:candles.length,candles,structure:{recentHigh:hi,recentLow:lo,equalHighCandidates:recent.filter(c=>Math.abs(c.high-hi)<=tol).map(c=>({price:c.high,time:c.time})),equalLowCandidates:recent.filter(c=>Math.abs(c.low-lo)<=tol).map(c=>({price:c.low,time:c.time})),possibleLiquiditySweepHigh:!!(prev&&last&&prev.high>=hi-tol&&last.close<hi-tol&&last.high>=hi-tol),possibleLiquiditySweepLow:!!(prev&&last&&prev.low<=lo+tol&&last.close>lo+tol&&last.low<=lo+tol),note:"Heuristic candidates from OHLCV, not verified stop orders or proof of engineered liquidity."}};
}
export async function liveOrderFlow(symbol){
 const s=symbolOf(symbol);
 const [book,trades]=await Promise.all([getJson("https://api.binance.com/api/v3/depth?symbol="+encodeURIComponent(s)+"&limit=100"),getJson("https://api.binance.com/api/v3/aggTrades?symbol="+encodeURIComponent(s)+"&limit=1000")]);
 let buy=0,sell=0,buyCount=0,sellCount=0;
 for(const t of trades){const q=Number(t.q||0);if(t.m){sell+=q;sellCount++;}else{buy+=q;buyCount++;}}
 const bids=(book.bids||[]).reduce((a,x)=>a+Number(x[1]||0),0),asks=(book.asks||[]).reduce((a,x)=>a+Number(x[1]||0),0),total=buy+sell;
 return {status:"LIVE",source:"Binance order book + recent aggregated trades",symbol:s,updatedAt:new Date().toISOString(),tradesCount:trades.length,buyAggressiveVolume:buy,sellAggressiveVolume:sell,delta:buy-sell,deltaPercent:total?100*(buy-sell)/total:null,buyTradeCount:buyCount,sellTradeCount:sellCount,bidDepthBase:bids,askDepthBase:asks,bookImbalance:bids+asks?100*(bids-asks)/(bids+asks):null,bestBid:book.bids?.[0]?.[0]||null,bestAsk:book.asks?.[0]?.[0]||null,warning:"One exchange only; this is not the whole market or verified whale activity."};
}
