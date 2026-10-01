import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hashSyncKey } from "@/lib/persistence";
import type { SmartNotification, SmartNotificationKind } from "@/lib/types";

type CreateNotificationInput = {
  syncKeyHash: string;
  dedupeKey: string;
  kind: SmartNotificationKind;
  title: string;
  body: string;
  entityType?: "product" | "saved_search";
  entityId?: string;
  price?: number;
  previousPrice?: number;
  url?: string;
};

function fromRow(row: any): SmartNotification {
  return {
    id: String(row.id),
    kind: row.kind as SmartNotificationKind,
    title: String(row.title || "SmartBuy"),
    body: String(row.body || ""),
    entityType: row.entity_type || undefined,
    entityId: row.entity_id || undefined,
    price: row.price_uah == null ? undefined : Number(row.price_uah),
    previousPrice: row.previous_price_uah == null ? undefined : Number(row.previous_price_uah),
    url: row.url || undefined,
    readAt: row.read_at || undefined,
    createdAt: row.created_at,
  };
}

export async function createNotificationForHash(input: CreateNotificationInput) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false };
  const { error } = await db.from("smartbuy_notifications").upsert({
    sync_key_hash: input.syncKeyHash,
    dedupe_key: input.dedupeKey,
    kind: input.kind,
    title: input.title,
    body: input.body,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    price_uah: input.price ?? null,
    previous_price_uah: input.previousPrice ?? null,
    url: input.url || null,
  }, { onConflict: "sync_key_hash,dedupe_key", ignoreDuplicates: true });
  return { cloud: !error, error: error?.message };
}

export async function createNotificationForSyncKey(syncKey: string, input: Omit<CreateNotificationInput, "syncKeyHash">) {
  return createNotificationForHash({ ...input, syncKeyHash: hashSyncKey(syncKey) });
}

export async function getNotifications(syncKey: string, limit = 50) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, items: [] as SmartNotification[] };
  const { data, error } = await db
    .from("smartbuy_notifications")
    .select("*")
    .eq("sync_key_hash", hashSyncKey(syncKey))
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) {
    const tableReady = !/smartbuy_notifications|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, items: [] as SmartNotification[], error: error.message };
  }
  return { cloud: true, tableReady: true, items: (data || []).map(fromRow) };
}

export async function markNotificationsRead(syncKey: string, id?: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false };
  let query = db.from("smartbuy_notifications").update({ read_at: new Date().toISOString() }).eq("sync_key_hash", hashSyncKey(syncKey)).is("read_at", null);
  if (id) query = query.eq("id", id);
  const { error } = await query;
  if (error) {
    const tableReady = !/smartbuy_notifications|relation .* does not exist|schema cache/i.test(error.message || "");
    return { cloud: true, tableReady, error: error.message };
  }
  return { cloud: true, tableReady: true };
}

export async function deleteNotification(syncKey: string, id: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false };
  const { error } = await db.from("smartbuy_notifications").delete().eq("sync_key_hash", hashSyncKey(syncKey)).eq("id", id);
  return { cloud: true, tableReady: !error, error: error?.message };
}
