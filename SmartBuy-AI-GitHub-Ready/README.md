# SmartBuy AI v4.0 — Fair Price Intelligence

SmartBuy is a Next.js/Vercel shopping assistant focused on the Ukrainian market, private listings and assisted international comparison.

## New in v4.0

- **Fair Price Intelligence** estimates a typical market price range for the exact product/modification instead of treating the lowest listing as the market price.
- The estimator excludes flagged price anomalies and prefers stronger model matches so a wrong storage/RAM/model variant is less likely to distort the range.
- When there is enough data, SmartBuy evaluates the recommended offer against offers in the **same condition** (new / used / refurbished) rather than mixing them.
- The product drawer shows the typical range, market midpoint, confidence, source/sample count, historical minimum and a visual price-position bar.
- Every seller can now receive a clear market-price label: **below market**, **within market**, **above market** or **suspiciously low**.
- Confidence is reduced when the sample is small, only one source is available or the price spread is unusually wide.
- Existing price history is used as context, but it does not silently overwrite the current market range.
- No new Supabase tables or SQL are required.

## Existing v3.9 behavior retained

- Seller Decision Engine combining price, seller trust, model match, warranty, delivery/payment signals and Real Total Cost.
- Recommended seller is separated from the absolute cheapest seller and the strongest trust signals.

## Existing v3.x stack retained

- Variant Guard + Seller Merge
- Multi-URL Assisted Product Import
- Adaptive Source Router + Query Expansion
- Search deduplication + canonical identity
- Source Connector Capability Matrix
- Supabase watchlist/history/saved searches/notifications/purchase workspace
- Price Timing, seller trust, review/spec intelligence
- Real Total Cost and cross-market comparison
- PWA, diagnostics and smoke-check

## Database

No new Supabase SQL is required for v4.0. If `supabase/update_to_latest.sql` from v2.9 was already applied, the database can stay as-is.
