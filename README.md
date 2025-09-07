# EDGAR Filing Cards — Full Optimized

This is the full version with:
- `/api/lookup` (ticker/name/CIK → CIK, handles BRK.B/BRK-B/BRKB)
- `/api/suggest` (fast dropdown, 1-letter suggestions, scoring)
- `/api/filings` (recent filings + 8-K item badges + S-1/424B amount parsing)
- `/api/debug` & `/api/ping-sec` (diagnostics)
- `scripts/build-ticker-map.mjs` (fetches all SEC tickers pre-build)

## Deploy (Vercel)
1. Add env var **SEC_USER_AGENT** = `EDGARCards/1.0 (you@domain.com)`
2. Build Command: `npm run build:tickers && npm run build`
3. Deploy

## Test endpoints
- `/api/debug`
- `/api/ping-sec`
- `/api/suggest?q=a&limit=200`
- `/api/lookup/AMD`
- `/api/filings/0000002488`

## Local dev
```bash
npm install
npm run build:tickers
npm run dev
```
