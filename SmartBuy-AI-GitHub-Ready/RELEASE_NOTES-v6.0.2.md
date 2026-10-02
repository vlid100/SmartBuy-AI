# SmartBuy AI v6.0.2 — Diagnostics & Supabase Config Guard

- `SUPABASE_SECRET_KEY` (`sb_secret_...`) is now preferred over legacy `SUPABASE_SERVICE_ROLE_KEY`.
- Environment values are trimmed and accidental wrapping quotes are removed.
- Project URL and server-key format are validated before creating the Supabase client.
- Server client uses `detectSessionInUrl: false` for secret-key backend use.
- `/api/diagnostics` no longer returns an opaque HTTP 500 for diagnostics failures; it returns a redacted structured error.
- Supabase diagnostics now explains whether URL/key format is wrong instead of incorrectly asking to recreate tables.
- No database migration is required.
