# SmartBuy AI v0.8 — Price Intelligence

v0.8 builds on the working v0.7.4 cloud setup.

## New in v0.8
- stricter model matching to reduce false matches (capacity, model numbers and variants such as Pro/Max/Ultra)
- source name shown next to the best current price
- tracked-price checks store source names, offer count and match confidence
- richer 90-day price history with min / average / max / current price
- recent history rows include offer/source counts
- price verdict: very good / good / normal / high based on accumulated history
- improved market summary that names the cheapest source and warns about large price spread

## Upgrade
Replace the files in your existing `SmartBuy-AI-GitHub-Ready` folder and commit to GitHub. Vercel will redeploy automatically.

No Supabase SQL migration is required for v0.8. Existing `SUPABASE_URL` and server key variables remain unchanged.
