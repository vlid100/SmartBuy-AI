# SmartBuy AI v1.0 — Full Market

v1.0 turns the previous Ukraine-only prototype into a clearer full-market shopping assistant.

## What is new
- one search now exposes three market layers:
  - Ukrainian stores and price sources
  - private sellers via OLX and Shafa direct search
  - international search via AliExpress, Temu and Amazon
- automatic prices remain visually separated from direct-search sources
- the app never invents a price for a source that SmartBuy cannot reliably read
- source launcher is grouped into Ukraine / private / international sections
- every product card has quick jumps to OLX, AliExpress, Temu and Amazon for the exact product title
- the product drawer has the same cross-market shortcuts
- zero/unknown ratings are hidden instead of showing `0.0`
- product cards are more compact while keeping price intelligence, matching confidence and tracking
- existing Supabase price history, watchlist sync, target prices and Vercel Cron tracking remain compatible

## Ukraine live aggregation
Best-effort automatic sources remain limited to public pages that can be read reliably without bypassing website protections. Current configured automatic adapters include Prom.ua, Bigl.ua and MOYO. Other Ukrainian sources remain available as direct search links.

## International
AliExpress, Temu and Amazon are direct-search integrations in v1.0. SmartBuy intentionally does not present their prices as live until a reliable permitted product-data integration is available.

## Upgrade
Replace the files in the existing `SmartBuy-AI-GitHub-Ready` folder and commit to GitHub. Vercel redeploys automatically.

No Supabase migration is required. Keep the existing `SUPABASE_URL` and server key environment variables.
