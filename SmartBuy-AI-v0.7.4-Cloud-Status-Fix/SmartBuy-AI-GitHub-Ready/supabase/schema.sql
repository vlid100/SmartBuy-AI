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
