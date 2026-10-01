import type { Product } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hashSyncKey } from "@/lib/persistence";

export type PurchaseWorkspaceCostProfile = {
  productId: string;
  sourceId: string;
  sourceName: string;
  sourceKind: "offer" | "manual";
  itemPrice: number;
  delivery: number;
  fees: number;
  taxes: number;
  discount: number;
  currency?: "UAH" | "USD" | "EUR" | "PLN" | "GBP";
  exchangeRate?: number;
  rateUpdatedAt?: string;
  updatedAt: string;
};

export type PurchaseWorkspaceItem = {
  product: Product;
  shortlisted: boolean;
  checklist: string[];
  costProfiles: PurchaseWorkspaceCostProfile[];
  updatedAt?: string;
};

function tableReadyFromError(message = "") {
  return !/smartbuy_purchase_workspace|relation .* does not exist|schema cache/i.test(message);
}

function fromRow(row: any): PurchaseWorkspaceItem | null {
  const product = row?.product_data as Product | undefined;
  if (!product?.id) return null;
  return {
    product,
    shortlisted: row.shortlisted !== false,
    checklist: Array.isArray(row.checklist) ? row.checklist.map(String) : [],
    costProfiles: Array.isArray(row.cost_profiles) ? row.cost_profiles : [],
    updatedAt: row.updated_at || undefined,
  };
}

export async function getPurchaseWorkspace(syncKey: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, items: [] as PurchaseWorkspaceItem[] };
  const { data, error } = await db
    .from("smartbuy_purchase_workspace")
    .select("product_key,product_data,shortlisted,checklist,cost_profiles,updated_at")
    .eq("sync_key_hash", hashSyncKey(syncKey))
    .order("updated_at", { ascending: false });
  if (error) return { cloud: true, tableReady: tableReadyFromError(error.message), items: [] as PurchaseWorkspaceItem[], error: error.message };
  return { cloud: true, tableReady: true, items: (data || []).map(fromRow).filter(Boolean) as PurchaseWorkspaceItem[] };
}

export async function upsertPurchaseWorkspace(syncKey: string, item: PurchaseWorkspaceItem) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false, item };
  const now = new Date().toISOString();
  const row = {
    sync_key_hash: hashSyncKey(syncKey),
    product_key: item.product.id,
    product_data: item.product,
    shortlisted: item.shortlisted,
    checklist: Array.from(new Set(item.checklist || [])),
    cost_profiles: item.costProfiles || [],
    updated_at: now,
  };
  const { data, error } = await db
    .from("smartbuy_purchase_workspace")
    .upsert(row, { onConflict: "sync_key_hash,product_key" })
    .select("product_key,product_data,shortlisted,checklist,cost_profiles,updated_at")
    .maybeSingle();
  if (error) return { cloud: true, tableReady: tableReadyFromError(error.message), item, error: error.message };
  return { cloud: true, tableReady: true, item: fromRow(data) || { ...item, updatedAt: now } };
}

export async function deletePurchaseWorkspace(syncKey: string, productKey: string) {
  const db = getSupabaseAdmin();
  if (!db) return { cloud: false, tableReady: false };
  const { error } = await db
    .from("smartbuy_purchase_workspace")
    .delete()
    .eq("sync_key_hash", hashSyncKey(syncKey))
    .eq("product_key", productKey);
  if (error) return { cloud: true, tableReady: tableReadyFromError(error.message), error: error.message };
  return { cloud: true, tableReady: true };
}
