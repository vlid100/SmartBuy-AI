# SmartBuy AI v0.7.4 — Cloud status fix

Ця версія виправляє помилку `TypeError: fetch failed` під час ручної перевірки відстежуваних товарів на Vercel.

## Що змінено
- ручні перевірки товарів запускаються послідовно, а не одночасно;
- читання Supabase має повторні спроби при тимчасовій мережевій помилці;
- помилка запису службового tracking-статусу не зриває всю перевірку;
- зовнішні джерела залишаються ізольованими: недоступність одного джерела не валить весь товар;
- відповідь API повертає точніші статуси `оновлено / не знайдено / помилка`.

Налаштування Supabase та Environment Variables змінювати не потрібно.


## v0.7.3 manual tracking fix
Ручна перевірка цін використовує той самий `/api/search`, що й основний пошук SmartBuy, а потім зберігає оновлений товар через `/api/watchlist`. Це прибирає залежність ручної кнопки від проблемного довгого `/api/tracking/refresh`. Vercel Cron залишається окремим серверним best-effort механізмом.


## v0.7.4 Cloud Status Fix
- Cloud mode is determined by a dedicated server status endpoint instead of treating every temporary fetch error as “local mode”.
- Supports `SUPABASE_SERVICE_ROLE_KEY` or the newer `SUPABASE_SECRET_KEY` on the server.
- Retries cloud/watchlist requests and keeps local data if Supabase is temporarily unreachable.
- If Vercel truly does not see the server variables, the UI names the missing variable without exposing secrets.
