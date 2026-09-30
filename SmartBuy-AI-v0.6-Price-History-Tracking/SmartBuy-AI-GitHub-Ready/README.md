# SmartBuy AI v0.6 — Price History + Tracking

SmartBuy AI v0.6 keeps the hybrid Ukraine market search from v0.5 and adds an optional Supabase layer for price history and watchlist sync.

## What is new

- Automatic price snapshots for real search results.
- 90-day price-history chart in the product drawer.
- Current / minimum / average price and a simple price signal.
- Watchlist with a target price per product.
- Sync code: use the same code on another device to load the same cloud watchlist.
- Local fallback: the site still works if Supabase is not configured.
- No login is required for v0.6.

## Deploy update

Keep the same Vercel Root Directory: `SmartBuy-AI-GitHub-Ready`.
Replace the old project files with this version and commit to GitHub. Vercel will redeploy automatically.

## Enable Supabase cloud features

1. Create/open a Supabase project.
2. Open **SQL Editor** and run all SQL from `supabase/schema.sql`.
3. In Vercel open your SmartBuy project -> **Settings -> Environment Variables**.
4. Add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key
5. Apply to Production (and Preview if you want) and redeploy.

Important: `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it in client code and never rename it to a `NEXT_PUBLIC_*` variable.

## How history works

When a real SmartBuy search returns products, the server stores the current best price. A new price-history point is recorded when the best price changes or at least 6 hours have passed since the previous snapshot.

The history therefore grows as the product is searched over time. v0.6 does not yet run background scheduled searches automatically; that is prepared for a later version.

## Sync code

Every browser receives a random SmartBuy sync code. The code is stored locally. When Supabase is enabled, the server stores only a SHA-256 hash of that code in the watchlist table. To use the same watchlist on another device, copy the code from **Відстеження** and enter it there.

## Local run

```bash
npm install
npm run dev
```

Open http://localhost:3000
