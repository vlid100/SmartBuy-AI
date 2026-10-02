# SmartBuy AI v5.0.1 — Search Stability Fix

v5.0.1 keeps the v5.0 production feature set and fixes long-running market searches.

Search stability changes:
- client safety timeout increased while source-level budgets prevent one slow site from blocking the market;
- OLX/Rozetka and probe sources have absolute per-source deadlines;
- international fetch + enrichment share one total deadline;
- timeout/error clears stale coverage counters, preventing `0 моделей · old пропозицій`.

v5.0 is a consolidation release: instead of adding another isolated card, it closes the remaining production gaps around live sources, seller data, variant dedupe, Web Push and deployment hardening.

## What is new

- **True Web Push**: VAPID + PushManager + Supabase subscriptions + service-worker `push` / `notificationclick`. Notifications created by price tracking and Deal Alerts can be delivered when no SmartBuy tab is open.
- **International Live** for Amazon, AliExpress and Temu: best-effort public-page search + limited detail-page enrichment, original currency, NBU conversion to UAH, image, seller, availability, shipping and returns when the source exposes them. Parsed shipping cost can prefill the Real Total Cost calculator. CAPTCHA/403 is reported honestly and direct search/import stays available.
- **OLX / Rozetka hardening**: alternate public search URLs, retries, JSON/JSON-LD + selectors + generic fallback, strict original-query validation and limited product-page enrichment for seller/delivery/return signals.
- **Seller intelligence v2**: seller rating, review count, account/store history and return policy now feed Seller Trust when these fields are available. Private-listing warnings stay neutral and never label a seller as a fraudster.
- **Variant Guard v2**: color, SKU/model code and regional-version conflicts are checked before two offers can merge. Missing optional data does not automatically split an otherwise matching product.
- **Production layer**: per-instance API burst rate limiting, optional Supabase server-event log, stronger security headers, Privacy/Terms pages, `robots.txt`, `sitemap.xml`, source-use guardrails and diagnostics for Web Push / new tables.

## One-time setup after upload

### 1. Supabase
Run **`supabase/v5.0_production.sql`** once in Supabase → SQL Editor. It adds:

- `smartbuy_push_subscriptions`
- `smartbuy_server_events`

`supabase/update_to_latest.sql` and `schema.sql` also contain the same v5.0 migration for a fresh project.

### 2. VAPID keys for Web Push
After `npm install`, run:

```bash
npm run vapid
```

Add the printed values to Vercel → Project → Settings → Environment Variables:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` (for example `mailto:you@example.com`)

Redeploy. In SmartBuy → Notifications press **Увімкнути Web Push**, then **Тест push**.

### 3. Recommended environment variable

Set `NEXT_PUBLIC_SITE_URL` to your production URL so sitemap/canonical metadata use the correct host.

If a marketplace policy changes, you can stop its automatic connector without a code change:

```env
SMARTBUY_DISABLED_SOURCES=olx,amazon
```

Leave the variable empty normally. Direct links remain available.

## Important limitation of external sources

SmartBuy does not bypass CAPTCHA, authentication, access controls or source rate limits. Amazon/AliExpress/Temu/OLX/Rozetka and other sites may independently change markup or block Vercel server requests. In that case SmartBuy marks the source as blocked/empty and keeps a direct source link instead of inventing data. See `SOURCE_USE.md`.

## Checks

```bash
npm install
npm run smoke
npm run audit
npm run check
npm run build
```
