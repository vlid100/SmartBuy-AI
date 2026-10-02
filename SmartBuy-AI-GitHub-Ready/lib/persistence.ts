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
  const batch = products.slice(0, 24);
  if (!db || batch.length === 0) return { cloud: false };

  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const keys = batch.map(product => product.id);

    // v5.0.2: one read + one upsert for the whole result set. The old implementation
    // did up to four Supabase requests per product in a serial loop and could add tens
    // of seconds to /api/search after live results had already been found.
    const { data: existingRows } = await db
      .from("smartbuy_products")
      .select("product_key,last_best_price")
      .in("product_key", keys);
    const existingByKey = new Map<string, number>((existingRows || []).map((row: { product_key: string; last_best_price: number | null }) => [row.product_key, Number(row.last_best_price || 0)] as [string, number]));

    const productRows = batch.map(product => {
      const previousBestPrice = existingByKey.get(product.id) || product.bestPrice;
      const productForStorage: Product = {
        ...product,
        tracking: product.tracking || {
          lastCheckedAt: nowIso,
          status: "ok",
          message: "Оновлено під час пошуку SmartBuy.",
          previousBestPrice,
          lastSeenPrice: product.bestPrice,
          sourceNames: Array.from(new Set(product.offers.map(o => o.marketplace))).slice(0, 6),
          offerCount: product.offers.length,
          matchConfidence: 1,
          matchedTitle: product.title,
        },
      };
      return {
        product_key: product.id,
        title: product.title,
        category: product.category,
        image_url: product.imageUrl || null,
        last_best_price: product.bestPrice,
        product_data: compactProduct(productForStorage),
        updated_at: nowIso,
      };
    });
    const { error: productError } = await db.from("smartbuy_products").upsert(productRows, { onConflict: "product_key" });
    if (productError) return { cloud: false };

    // We only need recent history to decide whether a new point is necessary. This keeps
    // the query bounded even after months of price tracking.
    const recentSince = new Date(now - SIX_HOURS_MS).toISOString();
    const { data: recentRows } = await db
      .from("smartbuy_price_history")
      .select("product_key,best_price,captured_at")
      .in("product_key", keys)
      .gte("captured_at", recentSince)
      .order("captured_at", { ascending: false });

    const latestRecent = new Map<string, { best_price: number; captured_at: string }>();
    for (const row of (recentRows || []) as { product_key: string; best_price: number | null; captured_at: string }[]) {
      if (!latestRecent.has(row.product_key)) latestRecent.set(row.product_key, { best_price: Number(row.best_price || 0), captured_at: row.captured_at });
    }
    const historyRows = batch.flatMap(product => {
      const latest = latestRecent.get(product.id);
      const priceChanged = !latest || Math.round(latest.best_price) !== Math.round(product.bestPrice);
      if (latest && !priceChanged) return [];
      return [{
        product_key: product.id,
        best_price: product.bestPrice,
        source_count: new Set(product.offers.map(o => o.marketplace)).size,
        offer_count: product.offers.length,
        captured_at: nowIso,
      }];
    });
    if (historyRows.length) await db.from("smartbuy_price_history").insert(historyRows);
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
    .select("best_price,captured_at,source_count,offer_count")
    .eq("product_key", productKey)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (error) return { cloud: true, points: [] };
  return {
    cloud: true,
    points: (data || []).map(row => ({ date: row.captured_at, price: Number(row.best_price), sourceCount: Number(row.source_count || 0), offerCount: Number(row.offer_count || 0) })),
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
