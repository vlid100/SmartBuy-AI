-- SmartBuy AI v0.3 — stores + private listings + price history
create extension if not exists pgcrypto;

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  source_type text not null check (source_type in ('store','private_marketplace','aggregator','international')),
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

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  external_id text,
  external_url text not null,
  seller_type text not null check (seller_type in ('store','private','international')),
  seller_name text,
  condition text not null check (condition in ('new','used','refurbished')),
  city text,
  price_uah numeric(12,2) not null,
  negotiable boolean not null default false,
  verified_seller boolean not null default false,
  in_stock boolean not null default true,
  warranty_text text,
  delivery_text text,
  published_at timestamptz,
  last_seen_at timestamptz not null default now(),
  unique(source_id, external_url)
);

create table if not exists price_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references listings(id) on delete cascade,
  price_uah numeric(12,2) not null,
  captured_at timestamptz not null default now()
);

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  target_price_uah numeric(12,2),
  include_used boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_listings_product_price on listings(product_id, price_uah);
create index if not exists idx_listings_seller_condition on listings(seller_type, condition);
create index if not exists idx_listings_source_seen on listings(source_id, last_seen_at desc);
create index if not exists idx_price_history_listing_time on price_history(listing_id, captured_at desc);

alter table watchlist enable row level security;
create policy "Users can read own watchlist" on watchlist for select using (auth.uid() = user_id);
create policy "Users can insert own watchlist" on watchlist for insert with check (auth.uid() = user_id);
create policy "Users can update own watchlist" on watchlist for update using (auth.uid() = user_id);
create policy "Users can delete own watchlist" on watchlist for delete using (auth.uid() = user_id);
