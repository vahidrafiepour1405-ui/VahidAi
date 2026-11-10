// AlphaFlow M5 v0.2 — deterministic multi-timeframe setup filter.
// Scores are rule confirmations, NOT win probabilities. No execution logic.
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function ema(values,period){
  if(!Array.isArray(values)||values.length<period)return null;
  const k=2/(period+1);let out=mean(values.slice(0,period));
  for(const x of values.slice(period))out=x*k+out*(1-k);return out;
}
export function rsi(values,period=14){
  if(!Array.isArray(values)||values.length<=period)return null;
  let g=0,l=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>0)g+=d;else l-=d;}
  let ag=g/period,al=l/period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;}
  return al===0?100:100-100/(1+ag/al);
}
export function atr(cs,p=14){
  if(!Array.isArray(cs)||cs.length<p+1)return null;const tr=[];
  for(let i=1;i<cs.length;i++){const c=cs[i],q=cs[i-1];tr.push(Math.max(c.high-c.low,Math.abs(c.high-q.close),Math.abs(c.low-q.close)));}
  return mean(tr.slice(-p));
}
export function vwap(cs){
  let pv=0,v=0;for(const c of cs){const typical=(c.high+c.low+c.close)/3;pv+=typical*c.volume;v+=c.volume;}
  return v>0?pv/v:null;
}
function validCandles(cs){
  if(!Array.isArray(cs)||cs.length<60)return false;
  for(let i=0;i<cs.length;i++){const c=cs[i];if(![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.low<=0||c.high<c.low||c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high||c.volume<0||(i&&c.time<=cs[i-1].time))return false;}
  return true;
}
function wait(symbol,status,reason,extra={}){return {status,symbol,signal:"WAIT",score:null,reason,...extra};}
export function analyze({candles5m,candles15m,symbol="UNKNOWN"}){
  if(!validCandles(candles5m)||!validCandles(candles15m))return wait(symbol,"INSUFFICIENT_DATA","At least 60 valid, ordered, fully closed candles are required on both timeframes.");
  const c5=candles5m,c15=candles15m,last=c5.at(-1),closes5=c5.map(c=>c.close),closes15=c15.map(c=>c.close);
  const e20=ema(closes5,20),e50=ema(closes5,50),h20=ema(closes15,20),h50=ema(closes15,50),r=rsi(closes5),a=atr(c5),vw=vwap(c5.slice(-24));
  if(![e20,e50,h20,h50,r,a,vw].every(Number.isFinite)||a<=0)return wait(symbol,"INSUFFICIENT_DATA","Indicators could not be calculated safely.");
  const prior=c5.slice(-22,-2),priorLow=Math.min(...prior.map(c=>c.low)),priorHigh=Math.max(...prior.map(c=>c.high));
  const sweepLow=last.low<priorLow&&last.close>priorLow,sweepHigh=last.high>priorHigh&&last.close<priorHigh;
  const bullBreak=last.close>Math.max(...c5.slice(-6,-1).map(c=>c.high));
  const bearBreak=last.close<Math.min(...c5.slice(-6,-1).map(c=>c.low));
  const up15=h20>h50&&closes15.at(-1)>h20,down15=h20<h50&&closes15.at(-1)<h20;
  const up5=e20>e50,down5=e20<e50;
  const avgVol=mean(c5.slice(-21,-1).map(c=>c.volume)),volumeOK=avgVol>0&&last.volume>=avgVol*1.15;
  const longRsi=r>=45&&r<=68,shortRsi=r>=32&&r<=55;
  const longChecks={trend15m:up15,trend5m:up5,liquiditySweep:sweepLow,structureBreak:bullBreak,vwap:last.close>vw,volume:volumeOK,rsi:longRsi};
  const shortChecks={trend15m:down15,trend5m:down5,liquiditySweep:sweepHigh,structureBreak:bearBreak,vwap:last.close<vw,volume:volumeOK,rsi:shortRsi};
  const weights={trend15m:25,trend5m:10,liquiditySweep:20,structureBreak:20,vwap:10,volume:10,rsi:5};
  const scoreOf=checks=>Object.entries(checks).reduce((s,[k,v])=>s+(v?weights[k]:0),0);
  const longScore=scoreOf(longChecks),shortScore=scoreOf(shortChecks);
  let signal="WAIT",score=Math.max(longScore,shortScore),checks=null,reason="No setup met all mandatory filters.";
  if(longScore>=80&&up15&&up5&&sweepLow&&bullBreak&&last.close>vw){signal="BUY";checks=longChecks;score=longScore;reason="Bullish 15m/5m alignment, sell-side liquidity sweep, bullish structure break and VWAP confirmation.";}
  else if(shortScore>=80&&down15&&down5&&sweepHigh&&bearBreak&&last.close<vw){signal="SELL";checks=shortChecks;score=shortScore;reason="Bearish 15m/5m alignment, buy-side liquidity sweep, bearish structure break and VWAP confirmation.";}
  if(signal==="WAIT")return {...wait(symbol,"LIVE",reason,{score,source:"Binance + Bybit (venue consensus)",timeframe:"5m",trend15m:up15?"BULLISH":down15?"BEARISH":"MIXED",indicators:{ema20_5m:e20,ema50_5m:e50,ema20_15m:h20,ema50_15m:h50,vwap:vw,rsi14:r,atr14:a},lastClosedCandle:new Date(last.time).toISOString()}),checks:{long:longChecks,short:shortChecks}};
  const entry=last.close,buffer=Math.max(a*.15,entry*.0002);
  const stop=signal==="BUY"?last.low-buffer:last.high+buffer;
  const distance=Math.abs(entry-stop),atrMultiple=distance/a;
  if(!Number.isFinite(distance)||distance<=0||atrMultiple<0.2||atrMultiple>2.5)
    return wait(symbol,"LIVE","Stop distance is outside the permitted 0.2–2.5 ATR band; skip this setup.",{score,source:"Binance + Bybit (venue consensus)",atrMultiple});
  const target=signal==="BUY"?entry+2*distance:entry-2*distance;
  return {status:"LIVE",symbol,signal,score,reason,source:"Binance + Bybit (venue consensus)",timeframe:"5m",trend15m:up15?"BULLISH":"BEARISH",entry,stopLoss:stop,takeProfit:target,riskReward:"1:2 before costs",atrMultiple:Number(atrMultiple.toFixed(3)),checks,indicators:{ema20_5m:e20,ema50_5m:e50,ema20_15m:h20,ema50_15m:h50,vwap:vw,rsi14:r,atr14:a},lastClosedCandle:new Date(last.time).toISOString(),disclaimer:"Confirmation score is not win probability. Reference levels are not executable quotes. Account for spread, fees, funding and slippage. No order is placed."};
}
