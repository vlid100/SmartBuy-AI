import type { Product, ProductTracking } from "@/lib/types";
import { groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { snapshotProducts } from "@/lib/persistence";
import { bestProductMatch } from "@/lib/matching";
import { createNotificationForHash } from "@/lib/notifications";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(250 * (i + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("retry_failed");
}

function chooseMatch(stored: Product, candidates: Product[]) {
  return bestProductMatch(stored, candidates);
}

async function writeTrackingStatus(productKey: string, tracking: ProductTracking) {
  const db = getSupabaseAdmin();
  if (!db) return false;
  try {
    const result = await retry(async () => {
      const { data, error } = await db.from("smartbuy_products").select("product_data").eq("product_key", productKey).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    });
    if (!result?.product_data) return false;
    const product = result.product_data as Product;
    await retry(async () => {
      const { error } = await db.from("smartbuy_products").update({
        product_data: { ...product, tracking },
        updated_at: new Date().toISOString(),
      }).eq("product_key", productKey);
      if (error) throw new Error(error.message);
      return true;
    });
    return true;
  } catch {
    // Tracking status is helpful, but a temporary Supabase transport issue must
    // never make the whole price check fail.
    return false;
  }
}

async function refreshOne(stored: Product, previousBestPrice: number) {
  const checkedAt = new Date().toISOString();
  try {
    const live = await searchUkraineLive(stored.title);
    const candidates = groupLiveOffers(live.offers, stored.title);
    const matched = chooseMatch(stored, candidates);
    const match = matched?.product || null;
    const responsive = live.statuses.filter(status => status.state === "ok" || status.state === "empty").length;
    const failedSources = live.statuses.filter(status => status.state === "error" || status.state === "timeout" || status.state === "blocked");

    if (!match) {
      const sourceDetail = failedSources.length
        ? ` Недоступні джерела: ${failedSources.map(s => s.name).join(", ")}.`
        : "";
      const tracking: ProductTracking = {
        lastCheckedAt: checkedAt,
        status: "not_found",
        message: responsive
          ? `Джерела відповіли, але точну модель не вдалося впевнено зіставити.${sourceDetail}`
          : `Автоматичні джерела цього разу не дали результату.${sourceDetail}`,
        previousBestPrice,
        lastSeenPrice: previousBestPrice,
        sourceNames: [],
        offerCount: 0,
      };
      await writeTrackingStatus(stored.id, tracking);
      return { productKey: stored.id, status: "not_found" as const, price: previousBestPrice, sourceErrors: failedSources.length };
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
        sourceNames: Array.from(new Set(match.offers.map(offer => offer.marketplace))).slice(0, 6),
        offerCount: match.offers.length,
        matchConfidence: matched ? Math.round(matched.match.score * 100) : undefined,
        matchedTitle: match.title,
      },
    };
    await snapshotProducts([refreshed]);
    return { productKey: stored.id, status: "ok" as const, price: refreshed.bestPrice, previousPrice: previousBestPrice, sourceErrors: failedSources.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Невідома помилка";
    await writeTrackingStatus(stored.id, {
      lastCheckedAt: checkedAt,
      status: "error",
      message,
      previousBestPrice,
      lastSeenPrice: previousBestPrice,
    });
    return { productKey: stored.id, status: "error" as const, price: previousBestPrice, detail: message };
  }
}

export async function refreshTrackedProducts(options?: { productKeys?: string[]; limit?: number }) {
  try {
    const db = getSupabaseAdmin();
    if (!db) return { cloud: false, checked: 0, updated: 0, notFound: 0, errors: 0, results: [] as unknown[], error: "supabase_not_configured" };

    let productKeys = options?.productKeys?.filter(Boolean) || [];
    if (!productKeys.length) {
      const watches: { product_key: string }[] = await retry(async () => {
        const { data, error } = await db.from("smartbuy_watchlist").select("product_key");
        if (error) throw new Error(error.message);
        return (data || []) as { product_key: string }[];
      });
      productKeys = Array.from(new Set<string>(watches.map(row => String(row.product_key))));
    }
    if (!productKeys.length) return { cloud: true, checked: 0, updated: 0, notFound: 0, errors: 0, results: [] as unknown[] };

    type ProductRow = { product_key: string; last_best_price: number | null; product_data: Product };
    const rows: ProductRow[] = await retry(async () => {
      const { data, error } = await db
        .from("smartbuy_products")
        .select("product_key,last_best_price,product_data")
        .in("product_key", productKeys);
      if (error) throw new Error(error.message);
      return (data || []) as ProductRow[];
    });

    const limit = Math.max(1, Math.min(options?.limit || DEFAULT_LIMIT, MAX_LIMIT));
    const sorted = rows
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

    // Deliberately sequential on Vercel Hobby: the tracked set is small and this
    // avoids concurrent outbound fetch bursts that were producing `fetch failed`.
    const results: Awaited<ReturnType<typeof refreshOne>>[] = [];
    for (const item of sorted) {
      results.push(await refreshOne(item.product, item.previousBestPrice));
    }

    // Create durable notifications for every sync profile watching a product.
    const okResults = results.filter(result => result.status === "ok" && "previousPrice" in result) as Array<{ productKey: string; status: "ok"; price: number; previousPrice: number }>;
    if (okResults.length) {
      const okKeys = okResults.map(result => result.productKey);
      type WatcherRow = { sync_key_hash: string; product_key: string; target_price_uah: number | null };
      const { data: watcherRowsRaw } = await db
        .from("smartbuy_watchlist")
        .select("sync_key_hash,product_key,target_price_uah")
        .in("product_key", okKeys);
      const watcherRows = (watcherRowsRaw || []) as WatcherRow[];
      const titleByKey = new Map(rows.map(row => [row.product_key, (row.product_data as Product)?.title || row.product_key]));
      for (const result of okResults) {
        const watchers = (watcherRows || []).filter(row => String(row.product_key) === result.productKey);
        const title = titleByKey.get(result.productKey) || "Відстежуваний товар";
        for (const watcher of watchers) {
          const syncHash = String(watcher.sync_key_hash || "");
          const target = watcher.target_price_uah == null ? null : Number(watcher.target_price_uah);
          if (result.price < result.previousPrice) {
            const drop = result.previousPrice - result.price;
            await createNotificationForHash({
              syncKeyHash: syncHash,
              dedupeKey: `product:${result.productKey}:price:${Math.round(result.price)}`,
              kind: "price_drop",
              title: `Ціна впала на ${Math.round(drop).toLocaleString("uk-UA")} ₴`,
              body: `${title}: зараз від ${Math.round(result.price).toLocaleString("uk-UA")} ₴.`,
              entityType: "product",
              entityId: result.productKey,
              price: result.price,
              previousPrice: result.previousPrice,
            });
          }
          if (target && result.price <= target && result.previousPrice > target) {
            await createNotificationForHash({
              syncKeyHash: syncHash,
              dedupeKey: `product:${result.productKey}:target:${Math.round(target)}`,
              kind: "target_hit",
              title: "Цільова ціна досягнута",
              body: `${title}: ${Math.round(result.price).toLocaleString("uk-UA")} ₴ при цілі ${Math.round(target).toLocaleString("uk-UA")} ₴.`,
              entityType: "product",
              entityId: result.productKey,
              price: result.price,
              previousPrice: result.previousPrice,
            });
          }
        }
      }
    }

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
