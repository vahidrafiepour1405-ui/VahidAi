export async function onRequest() {
  return Response.json({
    app: "Vahid AI",
    version: "1.0.0",
    server: "ONLINE",
    marketData: "PROVIDER_CHECKED_PER_REQUEST",
    timestamp: new Date().toISOString(),
    note: "Live status means the API server is responding; each data module reports its own status."
  }, { headers: { "Cache-Control": "no-store" } });
}
