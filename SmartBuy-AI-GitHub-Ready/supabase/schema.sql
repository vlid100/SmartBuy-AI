-- SmartBuy AI — базова схема даних для Supabase/Postgres
create extension if not exists pgcrypto;

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  trusted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  category text not null,
  brand text,
  model text,
  image_url text,
  specs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  external_url text not null,
  external_sku text,
  price_uah numeric(12,2) not null,
  in_stock boolean not null default true,
  warranty_months integer,
  delivery_text text,
  last_seen_at timestamptz not null default now(),
  unique(product_id, store_id, external_url)
);

create table if not exists price_history (
  id bigint generated always as identity primary key,
  offer_id uuid not null references offers(id) on delete cascade,
  price_uah numeric(12,2) not null,
  captured_at timestamptz not null default now()
);

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  target_price_uah numeric(12,2),
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_offers_product_price on offers(product_id, price_uah);
create index if not exists idx_price_history_offer_time on price_history(offer_id, captured_at desc);

alter table watchlist enable row level security;
create policy "Users can read own watchlist" on watchlist for select using (auth.uid() = user_id);
create policy "Users can insert own watchlist" on watchlist for insert with check (auth.uid() = user_id);
create policy "Users can update own watchlist" on watchlist for update using (auth.uid() = user_id);
create policy "Users can delete own watchlist" on watchlist for delete using (auth.uid() = user_id);
