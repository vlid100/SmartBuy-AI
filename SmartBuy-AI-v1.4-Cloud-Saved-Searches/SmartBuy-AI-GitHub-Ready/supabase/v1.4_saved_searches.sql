-- SmartBuy AI v1.4 migration — run once in Supabase > SQL Editor.
-- Safe to run more than once.
create extension if not exists pgcrypto;

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
