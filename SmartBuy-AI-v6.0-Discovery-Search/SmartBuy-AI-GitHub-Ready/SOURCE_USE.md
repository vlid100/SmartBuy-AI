# SmartBuy source-use guardrails (v6.0)

SmartBuy uses best-effort requests to public search/product pages. It does **not** bypass CAPTCHA, login walls, rate limits, robots challenges or access-control mechanisms. When a source returns 401/403/429, CAPTCHA or an anti-bot page, SmartBuy records the source as blocked and keeps a direct search link instead of inventing data.

Production rules implemented in code:

- per-source timeouts, cache and adaptive cooldown;
- conservative query expansion and strict model matching;
- OLX/Rozetka alternate public search URLs before a source is declared unavailable;
- limited deep enrichment of only the first few seller pages;
- server/API rate limiting and no API-response caching for live prices;
- user-visible source links so price, stock, warranty and seller data can be verified at the origin;
- seller scores describe available signals only and never label a seller a fraudster;
- any automatic connector can be disabled immediately with `SMARTBUY_DISABLED_SOURCES=olx,amazon,...` if a source policy changes;
- international connectors are `best-effort`: if Amazon/AliExpress/Temu block server access, SmartBuy falls back to direct links and assisted URL import.

Before a public/commercial launch, the site owner should review the current Terms of Service / robots guidance for every source and disable any connector whose terms do not permit the intended automated access. Site rules can change independently of SmartBuy.


## v6.0 Discovery Search

Discovery Search separates finding a product from verifying its price. It may query a web-search provider for links limited to supported marketplace domains. It never treats a search-engine snippet as a verified price. If a marketplace blocks automated access, SmartBuy can still show the discovered product page as an unverified link. `SMARTBUY_WEB_DISCOVERY_ENABLED=false`, `SMARTBUY_DDG_FALLBACK_ENABLED=false` and `SMARTBUY_PUBLIC_TRANSLATION_ENABLED=false` disable these fallbacks.
