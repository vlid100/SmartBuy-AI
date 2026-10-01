# SmartBuy AI v1.4 — Cloud Saved Searches + Automatic Deal Alerts

SmartBuy v1.4 moves Saved Searches from one browser into the same Supabase cloud already used by the watchlist. The same sync code can now carry products, target prices, price history **and saved searches** between devices.

## New in v1.4
- Saved Searches sync through Supabase.
- Existing local v1.3 saved searches are kept and uploaded after the v1.4 table is available.
- Daily Vercel Cron now checks both tracked products and a small batch of active Saved Searches.
- Deal Alert state, previous price, last best price, result count and offer count are stored in the cloud.
- Manual **Перевірити всі** and per-search **Перевірити** use the cloud route when available, with local fallback.
- Pause/resume/delete changes are synchronized to Supabase.
- The Saved Searches page clearly shows whether it is **cloud** or **local**.
- If the v1.4 table has not been created yet, SmartBuy keeps working locally and tells you exactly which SQL migration to run.

## One-time Supabase migration
Existing v0.6+ users must run this once:

`supabase/v1.4_saved_searches.sql`

Open **Supabase → SQL Editor**, paste the file contents, and press **Run**. The migration is idempotent, so running it again is safe.

No new environment variables are required. Keep the existing:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- optional `CRON_SECRET`

## Existing features retained
- Ukraine / private sellers / international market controls.
- Prom.ua, Bigl.ua and MOYO best-effort live adapters plus direct-search sources.
- OLX / Shafa and AliExpress / Temu / Amazon direct-search layers without invented prices.
- strict model matching and price anomaly filtering.
- Smart Value 1–100 and best-balance seller selection.
- watchlist, target prices, Supabase sync and price history.
- automatic watchlist price checks through Vercel Cron.

## Upgrade
Replace the files in the existing `SmartBuy-AI-GitHub-Ready` folder and commit to GitHub. Vercel redeploys automatically.

After deployment, run `supabase/v1.4_saved_searches.sql` once. Then refresh SmartBuy and open **Збережені** — the status should change to **Saved Searches у хмарі**.
