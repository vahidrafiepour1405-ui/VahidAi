# AlphaFlow M5 — Phase 2

Bilingual Persian/English, responsive web/PWA scalping decision-support workspace. Manual confirmation only.

## Implemented in this phase
- Read-only closed-candle adapters for Binance Spot and Bybit Spot.
- A candidate is considered only when both venues have fresh 5m and 15m candles, price divergence is at most 0.35%, and both engines independently agree on BUY or SELL.
- Closed-candle validation; forming candles, stale data, invalid OHLCV, missing provider data and venue disagreement produce WAIT / an explicit data status.
- Deterministic EMA20/50, RSI14, ATR14, rolling VWAP, recent liquidity-sweep and short-term structure-break filters.
- Weighted confluence score (0–100) representing rule confirmations, NOT win probability.
- Risk calculator for a $100 reference account: default risk 0.5% ($0.50), daily stop 1.5% ($1.50), maximum 3 trades/day, 2R target reference, illustrative 0.10% fee per side.
- Linear quote-settled spot/futures sizing estimate. Futures leverage is capped at 2x in the medium-risk preset; spot leverage must be 1x.
- PWA manifest and service worker; bilingual dashboard and browser notification permission control.

## Explicit limitations
- Forex remains INSUFFICIENT_DATA. Do not invent prices or signals. A licensed/reliable provider, credentials, spread and contract specifications are required.
- Multi-source confirmation is currently Binance + Bybit Spot only, not broad multi-exchange aggregation and not futures order books.
- The engine is deterministic and heuristic, not a trained predictive AI model.
- Risk sizing is only an estimate for linear quote-settled products. Inverse contracts, forex lots, tick values, quantity increments, minimum order size, funding, actual commissions and slippage require instrument-specific configuration.
- Browser notification permission is not the same as a configured push-notification service.
- PWA is not a signed Android APK. APK packaging/signing remains a separate build step.
- No order placement, exchange credentials, or autonomous trading is enabled.

## API
- GET /api/m5/scan?symbol=BTCUSDT — multi-venue consensus scan.
- GET /api/m5/risk?entry=...&stop=...&market=spot|futures&leverage=1|2 — position size estimate.
- GET /api/m5/forex — explicit INSUFFICIENT_DATA until a provider is configured.

## Run and validate
Node.js 20+: `npm test`, `node --check src/server.js`, `node --check m5/engine.js`, `node --check m5/providers.js`, `node --check m5/risk.js`, then `npm start`.

## Before real-money use
1. Review test results and provider uptime.
2. Backtest each market/instrument separately with historical spread, fees, funding and slippage.
3. Complete at least 100 paper trades, log every signal including WAIT, and measure expectancy, drawdown and execution slippage.
4. Do not treat the $10/day aspiration as a guaranteed or expected return. With $100, targeting $10/day implies 10% daily return and is not a prudent baseline.
