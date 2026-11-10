// Conservative position sizing for linear quote-settled instruments only.
export function calculateRiskPlan({
  balance=100,riskPct=0.5,dailyLoss=0,tradesToday=0,entry,stop,
  market="spot",leverage=1,feeRate=0.001,maxDailyLossPct=1.5,maxTrades=3
}={}){
  const n=[balance,riskPct,dailyLoss,tradesToday,entry,stop,leverage,feeRate,maxDailyLossPct,maxTrades];
  if(!n.every(Number.isFinite)||balance<=0||riskPct<=0||riskPct>1||dailyLoss<0||tradesToday<0||!Number.isInteger(tradesToday)||entry<=0||stop<=0||entry===stop||feeRate<0||feeRate>0.01)
    return {status:"INVALID_INPUT",allowed:false,reason:"Check balance, risk, entry, stop, fees and daily counters."};
  if(!["spot","futures"].includes(market))return {status:"UNSUPPORTED_MARKET",allowed:false,reason:"Only linear spot/futures sizing is supported; inverse contracts and forex lots need instrument-specific specifications."};
  if(market==="spot"&&leverage!==1)return {status:"INVALID_INPUT",allowed:false,reason:"Spot sizing requires leverage 1."};
  if(market==="futures"&&(leverage<1||leverage>2))return {status:"LEVERAGE_LIMIT",allowed:false,reason:"Medium-risk preset caps futures leverage at 2x."};
  const dailyLimit=balance*maxDailyLossPct/100;
  const remaining=Math.max(0,dailyLimit-dailyLoss);
  if(dailyLoss>=dailyLimit)return {status:"DAILY_STOP",allowed:false,reason:"Daily loss limit reached. Stop trading for today.",dailyLimit,remainingRiskBudget:0};
  if(tradesToday>=maxTrades)return {status:"TRADE_LIMIT",allowed:false,reason:"Maximum number of trades reached for today.",dailyLimit,remainingRiskBudget:0};
  const riskBudget=Math.min(balance*riskPct/100,remaining);
  const stopDistance=Math.abs(entry-stop);
  const feeCostPerUnit=entry*feeRate*2;
  const riskPerUnit=stopDistance+feeCostPerUnit;
  const rawQty=riskBudget/riskPerUnit;
  const maxNotional=balance*(market==="spot"?0.95:leverage);
  const qty=Math.min(rawQty,maxNotional/entry);
  const notional=qty*entry,estimatedRisk=qty*riskPerUnit;
  return {
    status:"OK",allowed:true,market,balanceUsd:balance,riskPct,riskBudgetUsd:Number(riskBudget.toFixed(4)),
    dailyLossUsd:dailyLoss,dailyLossLimitUsd:Number(dailyLimit.toFixed(4)),remainingDailyLossUsd:Number(remaining.toFixed(4)),
    entry,stop,stopDistance:Number(stopDistance.toPrecision(8)),feeRateRoundTrip:feeRate*2,
    estimatedRoundTripFeesUsd:Number((notional*feeRate*2).toFixed(4)),quantity:Number(qty.toPrecision(8)),
    notionalUsd:Number(notional.toFixed(4)),estimatedLossAtStopUsd:Number(estimatedRisk.toFixed(4)),
    cappedByBuyingPower:qty<rawQty,leverage:market==="futures"?leverage:1,
    estimatedMarginUsd:market==="futures"?Number((notional/leverage).toFixed(4)):Number(notional.toFixed(4)),
    remainingTrades:maxTrades-tradesToday-1,
    note:"Linear quote-settled sizing estimate only. Verify exchange contract quantity steps, minimum order, tick size, funding, spread and slippage. Fee assumption is illustrative and must be replaced with your actual fee tier."
  };
}
