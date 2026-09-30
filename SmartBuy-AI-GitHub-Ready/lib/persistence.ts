import { createHash } from "node:crypto";
import type { PricePoint, Product } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function hashSyncKey(syncKey: string) {
  return createHash("sha256").update(syncKey.trim()).digest("hex");
}

function compactProduct(product: Product) {
  return {
    ...product,
    offers: product.offers.slice(0, 30),
    priceHistory: undefined,
  };
}

export async function snapshotProducts(products: Product[]) {
  const db = getSupabaseAdmin();
  if (!db || products.length === 0) return { cloud: false };

  try {
    for (const product of products.slice(0, 24)) {
      await db.from("smartbuy_products").upsert({
        product_key: product.id,
        title: product.title,
        category: product.category,
        image_url: product.imageUrl || null,
        last_best_price: product.bestPrice,
        product_data: compactProduct(product),
        updated_at: new Date().toISOString(),
      }, { onConflict: "product_key" });

      const { data: latest } = await db
        .from("smartbuy_price_history")
        .select("best_price,captured_at")
        .eq("product_key", product.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestAt = latest?.captured_at ? new Date(latest.captured_at).getTime() : 0;
      const priceChanged = Number(latest?.best_price || 0) !== Math.round(product.bestPrice);
      if (!latest || priceChanged || Date.now() - latestAt >= SIX_HOURS_MS) {
        await db.from("smartbuy_price_history").insert({
          product_key: product.id,
          best_price: product.bestPrice,
          source_count: new Set(product.offers.map(o => o.marketplace)).size,
          offer_count: product.offers.length,
          captured_at: new Date().toISOString(),
        });
      }
    }
    return { cloud: true };
  } catch {
    return { cloud: false };
  }
}

export async function getPriceHistory(productKey: string, days = 90): Promise<{ cloud: boolean; points: PricePoint[] }> {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, points: [] };
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await db
    .from("smartbuy_price_history")
    .select("best_price,captured_at")
    .eq("product_key", productKey)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (error) return { cloud: true, points: [] };
  return {
    cloud: true,
    points: (data || []).map(row => ({ date: row.captured_at, price: Number(row.best_price) })),
  };
}

export async function getWatchlist(syncKey: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, items: [] as { product: Product; targetPrice?: number }[] };
  const syncHash = hashSyncKey(syncKey);
  const { data: watches, error } = await db
    .from("smartbuy_watchlist")
    .select("product_key,target_price_uah,updated_at")
    .eq("sync_key_hash", syncHash)
    .order("updated_at", { ascending: false });
  if (error || !watches?.length) return { cloud: true, items: [] as { product: Product; targetPrice?: number }[] };
  const keys = watches.map(row => row.product_key);
  const { data: products } = await db.from("smartbuy_products").select("product_key,product_data").in("product_key", keys);
  const byKey = new Map((products || []).map(row => [row.product_key, row.product_data as Product]));
  const items = watches.flatMap(row => {
    const product = byKey.get(row.product_key);
    if (!product) return [];
    return [{ product, targetPrice: row.target_price_uah == null ? undefined : Number(row.target_price_uah) }];
  });
  return { cloud: true, items };
}

export async function upsertWatch(syncKey: string, product: Product, targetPrice?: number) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false };
  await snapshotProducts([product]);
  const syncHash = hashSyncKey(syncKey);
  const { error } = await db.from("smartbuy_watchlist").upsert({
    sync_key_hash: syncHash,
    product_key: product.id,
    target_price_uah: targetPrice && targetPrice > 0 ? targetPrice : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "sync_key_hash,product_key" });
  return { cloud: !error };
}

export async function deleteWatch(syncKey: string, productKey: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false };
  const syncHash = hashSyncKey(syncKey);
  const { error } = await db.from("smartbuy_watchlist").delete().eq("sync_key_hash", syncHash).eq("product_key", productKey);
  return { cloud: !error };
}
