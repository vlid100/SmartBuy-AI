-- SmartBuy AI v1.5 migration — Notification Center.
-- Run once in Supabase > SQL Editor. Safe to run again.
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
