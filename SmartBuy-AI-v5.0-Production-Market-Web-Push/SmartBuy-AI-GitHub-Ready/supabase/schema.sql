-- SmartBuy AI v0.6 — price history + watchlist sync without login
-- Run this once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists smartbuy_products (
  product_key text primary key,
  title text not null,
  category text not null default 'Інше',
  image_url text,
  last_best_price numeric(12,2) not null,
  product_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists smartbuy_price_history (
  id bigint generated always as identity primary key,
  product_key text not null references smartbuy_products(product_key) on delete cascade,
  best_price numeric(12,2) not null,
  source_count integer not null default 0,
  offer_count integer not null default 0,
  captured_at timestamptz not null default now()
);

create table if not exists smartbuy_watchlist (
  id uuid primary key default gen_random_uuid(),
  sync_key_hash text not null,
  product_key text not null references smartbuy_products(product_key) on delete cascade,
  target_price_uah numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sync_key_hash, product_key)
);

create index if not exists idx_smartbuy_history_product_time on smartbuy_price_history(product_key, captured_at desc);
create index if not exists idx_smartbuy_watch_sync on smartbuy_watchlist(sync_key_hash, updated_at desc);

-- Browser never reads these tables directly. All access goes through Next.js API routes
-- using SUPABASE_SERVICE_ROLE_KEY on Vercel, so keep RLS enabled and do not add anon policies.
alter table smartbuy_products enable row level security;
alter table smartbuy_price_history enable row level security;
alter table smartbuy_watchlist enable row level security;

-- v1.4 — cloud Saved Searches + Deal Alerts
create table if not exists smartbuy_saved_searches (
  id text primary key default gen_random_uuid()::text,
  sync_key_hash text not null,
  fingerprint text not null,
  query text not null default '',
  category text not null default 'Усі',
  market_scope text not null default 'all',
  condition_filter text not null default 'all',
  max_price_uah numeric(12,2),
  enabled boolean not null default true,
  last_best_price numeric(12,2),
  previous_best_price numeric(12,2),
  result_count integer not null default 0,
  offer_count integer not null default 0,
  deal_drop numeric(12,2) not null default 0,
  last_checked_at timestamptz,
  last_check_status text not null default 'never',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sync_key_hash, fingerprint)
);

create index if not exists idx_smartbuy_saved_sync on smartbuy_saved_searches(sync_key_hash, updated_at desc);
create index if not exists idx_smartbuy_saved_cron on smartbuy_saved_searches(enabled, last_checked_at asc);
alter table smartbuy_saved_searches enable row level security;


-- v1.5 — Notification Center
create extension if not exists pgcrypto;

create table if not exists smartbuy_notifications (
  id uuid primary key default gen_random_uuid(),
  sync_key_hash text not null,
  dedupe_key text not null,
  kind text not null default 'info',
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  price_uah numeric(12,2),
  previous_price_uah numeric(12,2),
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(sync_key_hash, dedupe_key)
);

create index if not exists idx_smartbuy_notifications_sync on smartbuy_notifications(sync_key_hash, created_at desc);
create index if not exists idx_smartbuy_notifications_unread on smartbuy_notifications(sync_key_hash, read_at, created_at desc);
alter table smartbuy_notifications enable row level security;

-- v2.9 — Cloud Purchase Workspace
create table if not exists smartbuy_purchase_workspace (
  id uuid primary key default gen_random_uuid(),
  sync_key_hash text not null,
  product_key text not null,
  product_data jsonb not null default '{}'::jsonb,
  shortlisted boolean not null default true,
  checklist jsonb not null default '[]'::jsonb,
  cost_profiles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sync_key_hash, product_key)
);

create index if not exists idx_smartbuy_purchase_workspace_sync on smartbuy_purchase_workspace(sync_key_hash, updated_at desc);
alter table smartbuy_purchase_workspace enable row level security;
-- SmartBuy AI v5.0 — Web Push subscriptions + production event log
-- Run once in Supabase > SQL Editor after deploying v5.0.
create extension if not exists pgcrypto;

create table if not exists smartbuy_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  sync_key_hash text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_smartbuy_push_sync on smartbuy_push_subscriptions(sync_key_hash, updated_at desc);
alter table smartbuy_push_subscriptions enable row level security;

create table if not exists smartbuy_server_events (
  id bigint generated always as identity primary key,
  event text not null,
  level text not null default 'info',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_smartbuy_server_events_time on smartbuy_server_events(created_at desc);
create index if not exists idx_smartbuy_server_events_level on smartbuy_server_events(level, created_at desc);
alter table smartbuy_server_events enable row level security;

-- Browser clients do not get direct table policies. Access stays behind Next.js server routes
-- using the Supabase service role key already configured on Vercel.
