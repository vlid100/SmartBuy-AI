# SmartBuy AI v0.7.1 — manual tracking reliability fix

Hotfix for v0.7:
- manual price refresh runs each watched product in a separate API request;
- one slow marketplace can no longer fail the whole refresh;
- server exceptions are converted into structured results;
- the UI shows checked / updated / not found / errors and the first diagnostic reason when needed;
- existing Supabase schema and environment variables do not change.

No SQL migration is required if v0.6/v0.7 schema was already installed.
# SmartBuy AI v0.7 — Automatic Price Tracking

SmartBuy AI v0.7 builds on the working v0.6 cloud watchlist and adds scheduled background price checks.

## What is new

- Automatic Vercel Cron route: `/api/cron/track-prices`.
- Daily automatic checks for watched products.
- Manual **Перевірити ціни зараз** button in the Tracking tab.
- Current watched product data is refreshed in Supabase after a successful check.
- Price history is appended automatically when the best price changes or the snapshot interval is reached.
- Every tracked product shows the last check time and one of: updated / temporarily not found / error.
- Shows whether the price went down, went up, or stayed unchanged since the previous successful check.
- Target-price logic from v0.6 continues to work with the refreshed price.
- The site still works without Supabase, but automatic cloud tracking requires the Supabase server variables.

## Important: no new SQL migration is required

v0.7 stores tracking metadata inside the existing `smartbuy_products.product_data` JSON. If your v0.6 Supabase tables already work, you do **not** need to run a new SQL migration.

## Deploy update

Keep the same Vercel Root Directory: `SmartBuy-AI-GitHub-Ready`. Replace the old files with this version, commit to GitHub, and Vercel will redeploy. `vercel.json` registers the Cron Job automatically.

## Required Vercel variables

Keep the variables you already configured for v0.6:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but recommended:

- `CRON_SECRET` — a long random secret. When present, the cron endpoint accepts only Vercel's authorized cron request.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` variable.

## Cron schedule

`vercel.json` runs the tracking route every day at `07:15 UTC`. On the Vercel Hobby plan, scheduled jobs currently run at most once per day and can have roughly hourly scheduling precision. The manual button can be used at any time.

The automatic run checks up to 12 of the least-recently-checked watched products per run, with limited concurrency to keep Vercel usage under control. A manual check for one sync-code watchlist checks up to 20 products.

## How a refresh works

1. SmartBuy reads the watched products from Supabase.
2. It searches the currently enabled automatic Ukrainian sources.
3. It uses title-token similarity to avoid replacing a tracked product with an obviously different model.
4. If a confident match is found, SmartBuy updates the product card and price history.
5. If a confident match is not found, the old price is kept and the card is marked **тимчасово не знайдено** instead of inventing a price.

## Local run

```bash
npm install
npm run dev
```

Open http://localhost:3000
