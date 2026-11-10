# AlphaFlow M5 — Phase 1

Bilingual Persian/English web and Android-PWA-ready scalping workspace for manual-confirmation signals.

## Current scope
- Read-only Binance public OHLCV for selected crypto pairs (5m entry + 15m directional filter).
- EMA20/50, RSI14, ATR14, VWAP calculations.
- Heuristic candidate checks: recent liquidity sweep + short-term structure break + higher-timeframe trend.
- BUY / SELL / WAIT output, with analytical stop/target reference at 1:2.
- No order execution, API keys, broker credentials, or fabricated prices.

## Explicit limitations
- Forex data is not connected yet. It must report INSUFFICIENT_DATA until a verified provider and credentials are configured.
- Multi-exchange aggregation is not implemented in this phase. Binance is a single read-only source for initial crypto data.
- This is not a trained predictive AI model. The signal engine is deterministic and heuristic; it requires backtesting and paper trading.
- Stop/target values are analytical references only. Contract size, tick value, spread, commission, funding and slippage need instrument-specific adapters.
- Browser notifications require HTTPS and user permission; no push service is configured yet.

## Risk defaults
Reference balance USD 100; risk per trade 0.5% ($0.50); target 2R before costs; daily stop 1.5% ($1.50); max 3 trades/day. These are planning defaults, not a profitability guarantee.

## Run
The main AlphaFlow Node server will serve this module at /m5 and expose /api/m5/scan. Use Node 20+ and run npm start from repository root.

## Validation before real funds
Backtest with realistic fees and slippage, then at least 100 paper trades. Track spot, futures, forex, and each provider separately. Live order execution is disabled in this phase.
