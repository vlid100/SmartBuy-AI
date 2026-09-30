# SmartBuy AI v0.9 — Better Matching + More Ukraine Sources

v0.9 builds on the working v0.8 tracking + Supabase setup.

## New in v0.9
- much stricter product identity matching
  - separates Pro / Pro Max / Ultra / Plus / Mini / Air / FE / SE variants
  - checks storage (128 / 256 / 512 GB, 1 TB) and common RAM/storage pairs
  - checks model codes such as DHP486 vs DHP484
  - rejects accessories (cases, glass, cables, chargers, parts) when the user searched for the device itself
  - rejects obvious copy/replica signals and Android copies in iPhone searches
- every live offer now carries a model-match confidence score
- suspicious price outliers are marked and moved out of the recommended minimum-price calculation
- canonical product titles are chosen by match quality, not simply by the shortest title
- Bigl.ua added as a third automatic source alongside Prom.ua and MOYO
- Ukrainian source launcher expanded to 18 sources:
  - OLX, Rozetka, Prom.ua, Bigl.ua, MOYO, Hotline, E-Katalog
  - COMFY, Foxtrot, ALLO, Epicentr, KTC, Citrus, STYLUS, MTA, TELEMART, BRAIN, Shafa
- offer cards show match percentage and price-anomaly warnings
- product summary explains when suspicious prices were excluded

## Upgrade
Replace the files in the existing `SmartBuy-AI-GitHub-Ready` folder and commit to GitHub. Vercel will redeploy automatically.

No Supabase SQL migration is required for v0.9. Keep the existing Supabase environment variables unchanged.

## Notes
Automatic server-side collection is still intentionally limited to sources that can be queried without bypassing website protections. Direct-source buttons remain available for the rest of the Ukrainian market.
