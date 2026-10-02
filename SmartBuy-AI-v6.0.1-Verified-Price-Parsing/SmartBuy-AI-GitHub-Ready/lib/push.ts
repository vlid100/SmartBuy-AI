import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hashSyncKey } from "@/lib/persistence";

export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

type PushPayload = { title: string; body: string; url?: string; tag?: string; kind?: string };

export function pushPublicKey() { return (process.env.WEB_PUSH_PUBLIC_KEY || "").trim(); }
export function pushConfigured() {
  return Boolean(pushPublicKey() && (process.env.WEB_PUSH_PRIVATE_KEY || "").trim() && (process.env.WEB_PUSH_SUBJECT || "").trim());
}

function configure() {
  if (!pushConfigured()) return false;
  webpush.setVapidDetails((process.env.WEB_PUSH_SUBJECT || "mailto:admin@example.com").trim(), pushPublicKey(), (process.env.WEB_PUSH_PRIVATE_KEY || "").trim());
  return true;
}

export async function savePushSubscription(syncKey: string, subscription: PushSubscriptionInput, userAgent?: string) {
  const db = getSupabaseAdmin();
  if (!db || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return { cloud: Boolean(db), tableReady: false };
  const { error } = await db.from("smartbuy_push_subscriptions").upsert({
    sync_key_hash: hashSyncKey(syncKey), endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
    expiration_time: subscription.expirationTime || null, user_agent: userAgent || null, updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return { cloud: true, tableReady: !/smartbuy_push_subscriptions|relation .* does not exist|schema cache/i.test(error.message || ""), error: error.message };
  return { cloud: true, tableReady: true };
}

export async function deletePushSubscription(syncKey: string, endpoint: string) {
  const db = getSupabaseAdmin(); if (!db) return { cloud: false, tableReady: false };
  const { error } = await db.from("smartbuy_push_subscriptions").delete().eq("sync_key_hash", hashSyncKey(syncKey)).eq("endpoint", endpoint);
  return { cloud: true, tableReady: !error, error: error?.message };
}

export async function sendPushForHash(syncKeyHash: string, payload: PushPayload) {
  const db = getSupabaseAdmin();
  if (!db || !configure()) return { sent: 0, configured: pushConfigured() };
  const { data, error } = await db.from("smartbuy_push_subscriptions").select("id,endpoint,p256dh,auth").eq("sync_key_hash", syncKeyHash).limit(20);
  if (error || !data?.length) return { sent: 0, configured: true, error: error?.message };
  let sent = 0;
  await Promise.all(data.map(async (row: any) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: "normal" });
      sent += 1;
    } catch (err: any) {
      const status = Number(err?.statusCode || 0);
      if (status === 404 || status === 410) await db.from("smartbuy_push_subscriptions").delete().eq("id", row.id);
    }
  }));
  return { sent, configured: true };
}

export async function sendPushForSyncKey(syncKey: string, payload: PushPayload) {
  return sendPushForHash(hashSyncKey(syncKey), payload);
}
