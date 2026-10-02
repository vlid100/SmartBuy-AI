# SmartBuy AI v5.0.2 — Search Stability

This patch fixes the all-market timeout/empty-result failure seen in v5.0.1.

## Fixed
- Partial market results are returned even when some connectors are slow or blocked.
- Each source has a bounded deadline; response body download is covered by the same AbortController timeout.
- Ukraine and international waves use global budgets and `Promise.allSettled`, so one failed wave no longer discards the other.
- Product/price-history persistence is moved off the response path and batched in Supabase.
- Short failure cache prevents transient timeouts from poisoning searches for several minutes.
- Client emergency timeout is now only a last-resort 50 s guard; normal search core is designed to return much earlier.
- Ukrainian MacBook queries (`макбук`, `мак бук`, `макбук ейр`, `макбук про`) normalize correctly.
- MacBook 15/15.3 family matching is supported while M3/M4 variants stay separate.
- Counters remain consistent on failure/partial responses.

## Deployment
No new Supabase SQL is required if the v5.0 production migration is already installed.
Replace the project files, commit to GitHub, and let Vercel rebuild.
