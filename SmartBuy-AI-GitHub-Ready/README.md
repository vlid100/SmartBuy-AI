# SmartBuy AI v5.0.2 — Partial Results & Timeout Fix

v5.0.2 keeps the full v5.0 production feature set and rebuilds the search timing path so a slow marketplace can no longer wipe out results that SmartBuy has already found.

## Search fixes in v5.0.2

- **Partial results instead of all-or-nothing**: Ukraine and International Live waves are isolated with `Promise.allSettled`. If one wave fails, the other one still reaches the UI.
- **Hard overall search budgets**: the market core finishes before the Vercel route limit; Ukraine and international waves also have their own global deadlines.
- **Per-source deadlines include the response body**: the AbortController now remains active through `response.text()`. A site that sends headers and then stalls cannot hang the whole request.
- **No slow Supabase write on the user path**: product/price-history snapshots run with Next.js `after()` after the response is ready.
- **Batched history persistence**: SmartBuy now uses one batch product upsert and a bounded recent-history query instead of several sequential Supabase calls per product.
- **Timeout/error cache is short-lived**: one temporary failure no longer poisons the same query for several minutes.
- **MacBook Ukrainian query fix**: `макбук`, `мак бук`, `макбук ейр`, `макбук про` normalize to MacBook terms. `MacBook Air 15` also matches listings written as `15.3`, while M3/M4 generations remain separate product identities.
- **Client/server timeout no longer race**: the browser has a 50-second emergency guard, while the server intentionally returns much earlier with whatever verified results are available.
- **Accurate counters**: an unsuccessful request clears stale model/offer coverage; successful partial responses keep the real offers that were already found.

v5.0 remains the production foundation: true Web Push, International Live (Amazon/AliExpress/Temu), OLX/Rozetka hardening, seller intelligence, Variant Guard v2, rate limiting, server logs, Privacy/Terms, robots/sitemap and source-policy controls.

## One-time setup after upload

### Supabase
If you already ran **`supabase/v5.0_production.sql`**, do **not** run any new SQL for v5.0.2. This patch changes search/application code only.

### Web Push
Keep the existing Vercel variables:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

No new secret is required for v5.0.2.

## Optional timing controls

The built-in defaults are intended for Vercel and normally should be left unchanged:

```env
SMARTBUY_SEARCH_ROUTE_TIMEOUT_MS=30000
SMARTBUY_SEARCH_CORE_TIMEOUT_MS=26000
SMARTBUY_UKRAINE_TOTAL_TIMEOUT_MS=18000
SMARTBUY_INTERNATIONAL_WAVE_TIMEOUT_MS=8000
```

Per-source controls from v5.0.1 still work (`SMARTBUY_SOURCE_TOTAL_TIMEOUT_MS`, `SMARTBUY_PROBE_TOTAL_TIMEOUT_MS`, `SMARTBUY_PRIORITY_SOURCE_TOTAL_TIMEOUT_MS`, etc.).

## External-source limitation

SmartBuy does not bypass CAPTCHA, authentication, access controls or marketplace rate limits. If a source blocks Vercel, SmartBuy marks that source accordingly and returns results from the other sources instead of inventing data. Direct search/import links remain available. See `SOURCE_USE.md`.

## Checks

```bash
npm install
npm run smoke
npm run audit
npm run stability
npm run check
npm run build
```
