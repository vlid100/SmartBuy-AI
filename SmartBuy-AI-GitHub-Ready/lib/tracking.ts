import type { Product, ProductTracking } from "@/lib/types";
import { groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { snapshotProducts } from "@/lib/persistence";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(text: string) {
  const ignored = new Set(["купити", "ціна", "новий", "нова", "нове", "бв", "бу", "україна", "ua", "gb", "гб"]);
  return normalize(text).split(/\s+/).filter(token => token.length > 1 && !ignored.has(token));
}

function similarity(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const precision = common / Math.max(1, Math.min(left.size, right.size));
  const jaccard = common / Math.max(1, new Set([...left, ...right]).size);
  return precision * 0.7 + jaccard * 0.3;
}

function chooseMatch(stored: Product, candidates: Product[]) {
  let best: Product | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = similarity(stored.title, candidate.title);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) return null;
  const shared = tokens(stored.title).filter(token => new Set(tokens(best!.title)).has(token)).length;
  return bestScore >= 0.42 && shared >= Math.min(2, tokens(stored.title).length) ? best : null;
}

async function writeTrackingStatus(productKey: string, tracking: ProductTracking) {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { data } = await db.from("smartbuy_products").select("product_data").eq("product_key", productKey).maybeSingle();
  if (!data?.product_data) return;
  const product = data.product_data as Product;
  await db.from("smartbuy_products").update({
    product_data: { ...product, tracking },
    updated_at: new Date().toISOString(),
  }).eq("product_key", productKey);
}

async function refreshOne(stored: Product, previousBestPrice: number) {
  const checkedAt = new Date().toISOString();
  try {
    const live = await searchUkraineLive(stored.title);
    const candidates = groupLiveOffers(live.offers, stored.title);
    const match = chooseMatch(stored, candidates);
    const responsive = live.statuses.filter(status => status.state === "ok" || status.state === "empty").length;
    if (!match) {
      const tracking: ProductTracking = {
        lastCheckedAt: checkedAt,
        status: "not_found",
        message: responsive ? "Джерела відповіли, але точну модель не вдалося впевнено зіставити." : "Автоматичні джерела цього разу не дали результату.",
        previousBestPrice,
        lastSeenPrice: previousBestPrice,
      };
      await writeTrackingStatus(stored.id, tracking);
      return { productKey: stored.id, status: "not_found" as const, price: previousBestPrice };
    }

    const refreshed: Product = {
      ...match,
      id: stored.id,
      title: stored.title || match.title,
      image: match.image || stored.image,
      imageUrl: match.imageUrl || stored.imageUrl,
      tracking: {
        lastCheckedAt: checkedAt,
        status: "ok",
        message: `Оновлено з ${new Set(match.offers.map(offer => offer.marketplace)).size} автоматичних джерел.`,
        previousBestPrice,
        lastSeenPrice: match.bestPrice,
      },
    };
    await snapshotProducts([refreshed]);
    return { productKey: stored.id, status: "ok" as const, price: refreshed.bestPrice, previousPrice: previousBestPrice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Невідома помилка";
    await writeTrackingStatus(stored.id, {
      lastCheckedAt: checkedAt,
      status: "error",
      message,
      previousBestPrice,
      lastSeenPrice: previousBestPrice,
    });
    return { productKey: stored.id, status: "error" as const, price: previousBestPrice };
  }
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const queue = [...items];
  const results: R[] = [];
  async function runner() {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      results.push(await worker(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runner()));
  return results;
}

export async function refreshTrackedProducts(options?: { productKeys?: string[]; limit?: number }) {
  try {
    const db = getSupabaseAdmin();
    if (!db) return { cloud: false, checked: 0, updated: 0, notFound: 0, errors: 0, results: [] as unknown[], error: "supabase_not_configured" };

    let productKeys = options?.productKeys?.filter(Boolean) || [];
    if (!productKeys.length) {
      const { data: watches, error } = await db.from("smartbuy_watchlist").select("product_key");
      if (error) return { cloud: true, checked: 0, updated: 0, notFound: 0, errors: 1, results: [] as unknown[], error: error.message };
      productKeys = [...new Set((watches || []).map(row => String(row.product_key)))];
    }
    if (!productKeys.length) return { cloud: true, checked: 0, updated: 0, notFound: 0, errors: 0, results: [] as unknown[] };

    const { data: rows, error } = await db
      .from("smartbuy_products")
      .select("product_key,last_best_price,product_data")
      .in("product_key", productKeys);
    if (error) return { cloud: true, checked: 0, updated: 0, notFound: 0, errors: 1, results: [] as unknown[], error: error.message };

    const limit = Math.max(1, Math.min(options?.limit || DEFAULT_LIMIT, MAX_LIMIT));
    const sorted = (rows || [])
      .map(row => ({
        product: row.product_data as Product,
        previousBestPrice: Number(row.last_best_price || (row.product_data as Product)?.bestPrice || 0),
      }))
      .filter(item => item.product?.id)
      .sort((a, b) => {
        const at = a.product.tracking?.lastCheckedAt ? new Date(a.product.tracking.lastCheckedAt).getTime() : 0;
        const bt = b.product.tracking?.lastCheckedAt ? new Date(b.product.tracking.lastCheckedAt).getTime() : 0;
        return at - bt;
      })
      .slice(0, limit);

    const results = await runPool(sorted, Math.min(2, sorted.length || 1), item => refreshOne(item.product, item.previousBestPrice));
    return {
      cloud: true,
      checked: results.length,
      updated: results.filter(result => result.status === "ok").length,
      notFound: results.filter(result => result.status === "not_found").length,
      errors: results.filter(result => result.status === "error").length,
      results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return { cloud: true, checked: 0, updated: 0, notFound: 0, errors: 1, results: [] as unknown[], error: message };
  }
}
