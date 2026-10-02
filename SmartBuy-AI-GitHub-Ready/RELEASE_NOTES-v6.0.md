# SmartBuy AI v6.0 — Discovery Search

## Головна зміна
SmartBuy більше не трактує «магазин не віддав картку/ціну» як «товару немає». Пошук розділено на Discovery та Verification.

- Natural-language query expansion для описових товарів.
- Короткі товарні ядра: наприклад `3-ярусна окремо стояча стійка для рушників` → `стійка для рушників`.
- Українські, російські та англійські варіанти пошуку.
- Best-effort переклад описового запиту для AliExpress / Temu / Amazon.
- Окремий descriptive matcher зі stemming/concept matching.
- Конкретні моделі, SKU, пам'ять, колір і регіон усе ще проходять строгий Variant Guard.
- Web Discovery fallback (Brave Search API якщо ключ заданий; інакше best-effort DuckDuckGo HTML), тільки по підтримуваних marketplace-доменах.
- Якщо ціна не підтверджена, знайдена сторінка товару все одно показується окремо, а не зникає.
- Повільні/заблоковані джерела не обнуляють уже знайдені результати.

## Опційні environment variables
- `SMARTBUY_BRAVE_SEARCH_API_KEY` — надійніший Web Discovery через Brave Search API.
- `SMARTBUY_WEB_DISCOVERY_ENABLED=false` — вимкнути Web Discovery.
- `SMARTBUY_DDG_FALLBACK_ENABLED=false` — вимкнути fallback DuckDuckGo.
- `SMARTBUY_PUBLIC_TRANSLATION_ENABLED=false` — вимкнути best-effort переклад міжнародних описових запитів.
- `SMARTBUY_TRANSLATION_API_URL` — замінити translation endpoint.

Новий SQL для Supabase не потрібен.
