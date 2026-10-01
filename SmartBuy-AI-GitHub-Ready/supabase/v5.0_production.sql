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
