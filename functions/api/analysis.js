export async function onRequest() {
  return Response.json({
    status: "INSUFFICIENT_DATA",
    message: "Order-flow, order-book liquidity and verified whale events are not yet connected to a dedicated provider. No trading signal is generated.",
    modules: {
      orderFlow: "NOT_CONNECTED",
      liquidity: "NOT_CONNECTED",
      whaleTracking: "NOT_CONNECTED",
      entryExit: "NOT_AVAILABLE"
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
