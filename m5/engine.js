// AlphaFlow M5 signal engine v0.1. OHLCV heuristic only; no order execution.
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
export function ema(values, period) {
  if(values.length<period)return null; const k=2/(period+1); let out=mean(values.slice(0,period));
  for(const x of values.slice(period))out=x*k+out*(1-k); return out;
}
export function rsi(values,period=14){
  if(values.length<=period)return null;let g=0,l=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>0)g+=d;else l-=d;}
  let ag=g/period,al=l/period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;}
  return al===0?100:100-100/(1+ag/al);
}
export function atr(cs,p=14){if(cs.length<p+1)return null;const tr=[];for(let i=1;i<cs.length;i++){const c=cs[i],q=cs[i-1];tr.push(Math.max(c.high-c.low,Math.abs(c.high-q.close),Math.abs(c.low-q.close)));}return mean(tr.slice(-p));}
export function vwap(cs){let pv=0,v=0;for(const c of cs){pv+=(c.high+c.low+c.close)/3*c.volume;v+=c.volume;}return v?pv/v:null;}
export function analyze({candles5m,candles15m,symbol}){
  if(!Array.isArray(candles5m)||!Array.isArray(candles15m)||candles5m.length<55||candles15m.length<55)
    return {status:"INSUFFICIENT_DATA",symbol,signal:"WAIT",score:null,reason:"At least 55 candles are required on both timeframes.",source:"Binance public OHLCV"};
  const c5=candles5m.map(c=>c.close),c15=candles15m.map(c=>c.close),last=candles5m.at(-1);
  const e20=ema(c5,20),e50=ema(c5,50),h20=ema(c15,20),h50=ema(c15,50),r=rsi(c5),a=atr(candles5m),v=vwap(candles5m.slice(-24));
  const recent=candles5m.slice(-22,-2),lo=Math.min(...recent.map(c=>c.low)),hi=Math.max(...recent.map(c=>c.high));
  const sweepLow=last.low<lo&&last.close>lo,sweepHigh=last.high>hi&&last.close<hi;
  const up=h20>h50&&c15.at(-1)>h20,down=h20<h50&&c15.at(-1)<h20;
  const bull=last.close>Math.max(...candles5m.slice(-6,-1).map(c=>c.high));
  const bear=last.close<Math.min(...candles5m.slice(-6,-1).map(c=>c.low));
  let signal="WAIT",reason="No complete trend, sweep and structure confirmation.";
  if(up&&sweepLow&&bull&&last.close>v){signal="BUY";reason="15m bullish bias + 5m sell-side sweep + bullish structure break + close above VWAP.";}
  if(down&&sweepHigh&&bear&&last.close<v){signal="SELL";reason="15m bearish bias + 5m buy-side sweep + bearish structure break + close below VWAP.";}
  const entry=signal==="WAIT"?null:last.close,stop=signal==="BUY"?Math.min(last.low,lo)-.15*(a||0):signal==="SELL"?Math.max(last.high,hi)+.15*(a||0):null;
  const risk=entry===null?null:Math.abs(entry-stop),target=signal==="BUY"?entry+2*risk:signal==="SELL"?entry-2*risk:null;
  const score=signal==="WAIT"?0:80+((signal==="BUY"&&r>45&&r<70)||(signal==="SELL"&&r<55&&r>30)?10:0);
  return {status:"LIVE",symbol,signal,score,reason,source:"Binance public OHLCV",timeframe:"5m",trend15m:up?"BULLISH":down?"BEARISH":"MIXED",entry,stopLoss:stop,takeProfit:target,riskReward:entry!==null?"1:2":null,candleTime:new Date(last.time).toISOString(),indicators:{ema20_5m:e20,ema50_5m:e50,ema20_15m:h20,ema50_15m:h50,vwap:v,rsi14:r,atr14:a},disclaimer:"Heuristic candidate only. Verify spread, fees, slippage, news and contract specs. No order is placed."};
}
