# Vahid AI — Cloudflare Pages deployment

This repository now includes a Cloudflare Pages Functions alternative for the existing Render API.

## Deploy without changing the existing Render service

1. Sign in to Cloudflare and open https://dash.cloudflare.com/
2. Open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the GitHub repository `vahidrafiepour1405-ui/VahidAi` and branch `main`.
4. Set **Build command** to empty / none.
5. Set **Build output directory** to `public`.
6. Deploy the Pages project.
7. Open the generated `*.pages.dev` URL and test:
   - `/` — Vahid AI interface
   - `/api/status` — API health
   - `/api/crypto` — live crypto market data with provider fallbacks
   - `/api/analysis` — truthful data-availability status

Cloudflare Pages should discover the root-level `functions/` directory automatically. The original Render service remains unchanged and can be used as rollback.

## Important

- A successful deployment does not guarantee that the new `pages.dev` hostname will be reachable on every ISP without a VPN. Test the URL on the user's mobile network with VPN disabled.
- Live market data depends on external providers being reachable from Cloudflare.
- Whale tracking, order flow, liquidity analysis and generated trade signals are intentionally marked unavailable until real data providers are connected.
- Do not enter API secrets into frontend code or commit them to this repository.
