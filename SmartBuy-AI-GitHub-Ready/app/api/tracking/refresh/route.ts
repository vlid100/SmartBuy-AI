import { NextRequest, NextResponse } from "next/server";
import { hashSyncKey } from "@/lib/persistence";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { refreshTrackedProducts } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: string } | null;
  const token = body?.token?.trim() || "";
  if (token.length < 8) return NextResponse.json({ cloud: false, checked: 0 }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ cloud: false, checked: 0 }, { status: 503 });

  const { data, error } = await db
    .from("smartbuy_watchlist")
    .select("product_key")
    .eq("sync_key_hash", hashSyncKey(token));
  if (error) return NextResponse.json({ cloud: true, checked: 0, error: "watchlist_read_failed" }, { status: 500 });
  const keys = [...new Set((data || []).map(row => String(row.product_key)))];
  const result = await refreshTrackedProducts({ productKeys: keys, limit: 20 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
