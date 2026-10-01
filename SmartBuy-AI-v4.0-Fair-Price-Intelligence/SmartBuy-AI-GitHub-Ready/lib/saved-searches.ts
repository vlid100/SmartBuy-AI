import type { SavedSearch } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hashSyncKey } from "@/lib/persistence";
import { searchProducts, type ConditionFilter, type MarketScope } from "@/lib/search";
import { createNotificationForHash } from "@/lib/notifications";

const MAX_CRON_CHECKS = 4;

export function savedSearchFingerprint(item: Pick<SavedSearch, "query" | "category" | "marketScope" | "conditionFilter" | "maxPrice">) {
  return [
    item.query.trim().toLowerCase(),
    item.category || "Усі",
    item.marketScope || "all",
    item.conditionFilter || "all",
    String(item.maxPrice || "").trim(),
  ].join("|");
}

function bestResultPrice(results: { bestPrice: number }[]) {
  const prices = results.map(item => Number(item.bestPrice)).filter(price => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function fromRow(row: any): SavedSearch {
  return {
    id: String(row.id),
    query: String(row.query || ""),
    category: String(row.category || "Усі"),
    marketScope: (row.market_scope || "all") as SavedSearch["marketScope"],
    conditionFilter: (row.condition_filter || "all") as SavedSearch["conditionFilter"],
    maxPrice: row.max_price_uah == null ? "" : String(Math.round(Number(row.max_price_uah))),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at || undefined,
    lastBestPrice: row.last_best_price == null ? undefined : Number(row.last_best_price),
    previousBestPrice: row.previous_best_price == null ? undefined : Number(row.previous_best_price),
    resultCount: Number(row.result_count || 0),
    offerCount: Number(row.offer_count || 0),
    dealDrop: Number(row.deal_drop || 0),
    enabled: row.enabled !== false,
    lastCheckStatus: (row.last_check_status || "never") as SavedSearch["lastCheckStatus"],
    lastError: row.last_error || undefined,
  };
}

function toRow(syncHash: string, item: SavedSearch) {
  return {
    id: item.id,
    sync_key_hash: syncHash,
    fingerprint: savedSearchFingerprint(item),
    query: item.query.trim(),
    category: item.category || "Усі",
    market_scope: item.marketScope || "all",
    condition_filter: item.conditionFilter || "all",
    max_price_uah: item.maxPrice ? Number(item.maxPrice) : null,
    enabled: item.enabled !== false,
    last_best_price: item.lastBestPrice ?? null,
    previous_best_price: item.previousBestPrice ?? null,
    result_count: item.resultCount ?? 0,
    offer_count: item.offerCount ?? 0,
    deal_drop: item.dealDrop ?? 0,
    last_checked_at: item.lastCheckedAt ?? null,
    last_check_status: item.lastCheckStatus ?? "never",
    last_error: item.lastError ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function getSavedSearches(syncKey: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, items: [] as SavedSearch[] };
  const { data, error } = await db
    .from("smartbuy_saved_searches")
    .select("*")
    .eq("sync_key_hash", hashSyncKey(syncKey))
    .order("updated_at", { ascending: false });
  if (error) {
    const tableReady = !/smartbuy_saved_searches|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, items: [] as SavedSearch[], error: error.message };
  }
  return { cloud: true, tableReady: true, items: (data || []).map(fromRow) };
}

export async function upsertSavedSearch(syncKey: string, item: SavedSearch) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, item };
  const syncHash = hashSyncKey(syncKey);
  const row = toRow(syncHash, item);
  const { data, error } = await db
    .from("smartbuy_saved_searches")
    .upsert(row, { onConflict: "sync_key_hash,fingerprint" })
    .select("*")
    .maybeSingle();
  if (error) {
    const tableReady = !/smartbuy_saved_searches|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, item, error: error.message };
  }
  return { cloud: true, tableReady: true, item: data ? fromRow(data) : item };
}

export async function deleteSavedSearch(syncKey: string, id: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false };
  const { error } = await db
    .from("smartbuy_saved_searches")
    .delete()
    .eq("sync_key_hash", hashSyncKey(syncKey))
    .eq("id", id);
  if (error) {
    const tableReady = !/smartbuy_saved_searches|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, error: error.message };
  }
  return { cloud: true, tableReady: true };
}

async function checkOneRow(row: any) {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("supabase_not_configured");
  const checkedAt = new Date().toISOString();
  try {
    const maxPrice = row.max_price_uah == null ? undefined : Number(row.max_price_uah);
    const data = await searchProducts(
      String(row.query || ""),
      row.category === "Усі" ? "" : String(row.category || ""),
      maxPrice,
      (row.market_scope || "all") as MarketScope,
      (row.condition_filter || "all") as ConditionFilter,
    );
    const best = bestResultPrice(data.results || []);
    const previous = row.last_best_price == null ? null : Number(row.last_best_price);
    const drop = best != null && previous != null && best < previous ? previous - best : 0;
    const status = best != null ? "ok" : "no_live_data";
    const patch = {
      previous_best_price: previous,
      last_best_price: best ?? previous,
      result_count: data.results?.length || 0,
      offer_count: data.coverage?.totalOffers || 0,
      deal_drop: drop,
      last_checked_at: checkedAt,
      last_check_status: status,
      last_error: null,
      updated_at: checkedAt,
    };
    const { data: updated, error } = await db.from("smartbuy_saved_searches").update(patch).eq("id", row.id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (drop > 0 && best != null) {
      await createNotificationForHash({
        syncKeyHash: String(row.sync_key_hash),
        dedupeKey: `saved:${row.id}:price:${Math.round(best)}`,
        kind: "deal_alert",
        title: `Ціна впала на ${Math.round(drop).toLocaleString("uk-UA")} ₴`,
        body: `${String(row.query || row.category || "Збережений пошук")}: найкраща ціна зараз ${Math.round(best).toLocaleString("uk-UA")} ₴.`,
        entityType: "saved_search",
        entityId: String(row.id),
        price: best,
        previousPrice: previous ?? undefined,
      });
    }
    return { ok: true, item: fromRow(updated || { ...row, ...patch }), deal: drop > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const patch = { last_checked_at: checkedAt, last_check_status: "error", last_error: message.slice(0, 300), updated_at: checkedAt };
    await db.from("smartbuy_saved_searches").update(patch).eq("id", row.id);
    return { ok: false, item: fromRow({ ...row, ...patch }), deal: false, error: message };
  }
}

export async function checkSavedSearchesForSync(syncKey: string, id?: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, checked: 0, deals: 0, items: [] as SavedSearch[] };
  let query = db.from("smartbuy_saved_searches").select("*").eq("sync_key_hash", hashSyncKey(syncKey));
  if (id) query = query.eq("id", id);
  else query = query.eq("enabled", true).order("last_checked_at", { ascending: true, nullsFirst: true });
  const { data, error } = await query;
  if (error) {
    const tableReady = !/smartbuy_saved_searches|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, checked: 0, deals: 0, items: [] as SavedSearch[], error: error.message };
  }
  const rows = id ? (data || []).slice(0, 1) : (data || []).slice(0, 12);
  const results = [] as Awaited<ReturnType<typeof checkOneRow>>[];
  for (const row of rows) results.push(await checkOneRow(row));
  return {
    cloud: true,
    tableReady: true,
    checked: results.length,
    deals: results.filter(result => result.deal).length,
    errors: results.filter(result => !result.ok).length,
    items: results.map(result => result.item),
  };
}

export async function refreshSavedSearches(options?: { limit?: number }) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, checked: 0, deals: 0, errors: 0 };
  const limit = Math.max(1, Math.min(options?.limit || MAX_CRON_CHECKS, 8));
  const { data, error } = await db
    .from("smartbuy_saved_searches")
    .select("*")
    .eq("enabled", true)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    const tableReady = !/smartbuy_saved_searches|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, checked: 0, deals: 0, errors: 1, error: error.message };
  }
  const results = [] as Awaited<ReturnType<typeof checkOneRow>>[];
  for (const row of data || []) results.push(await checkOneRow(row));
  return {
    cloud: true,
    tableReady: true,
    checked: results.length,
    deals: results.filter(result => result.deal).length,
    errors: results.filter(result => !result.ok).length,
  };
}
