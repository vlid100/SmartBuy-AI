import { NextRequest, NextResponse } from "next/server";
import { hashSyncKey } from "@/lib/persistence";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { refreshTrackedProducts } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RefreshBody = { token?: string; productKey?: string };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as RefreshBody | null;
    const token = body?.token?.trim() || "";
    const requestedKey = body?.productKey?.trim() || "";
    if (token.length < 8) {
      return NextResponse.json({ cloud: false, checked: 0, error: "invalid_sync_code" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ cloud: false, checked: 0, error: "supabase_not_configured" }, { status: 503 });
    }

    let query = db
      .from("smartbuy_watchlist")
      .select("product_key")
      .eq("sync_key_hash", hashSyncKey(token));
    if (requestedKey) query = query.eq("product_key", requestedKey);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ cloud: true, checked: 0, error: "watchlist_read_failed", detail: error.message }, { status: 500 });
    }

    const keys = [...new Set((data || []).map(row => String(row.product_key)))];
    if (requestedKey && !keys.includes(requestedKey)) {
      return NextResponse.json({ cloud: true, checked: 0, error: "product_not_in_watchlist" }, { status: 404 });
    }
    if (!keys.length) {
      return NextResponse.json({ cloud: true, checked: 0, updated: 0, notFound: 0, errors: 0, results: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    // Manual refreshes can ask for one product at a time. This keeps each Vercel
    // invocation short even if a marketplace responds slowly.
    const result = await refreshTrackedProducts({ productKeys: keys, limit: requestedKey ? 1 : 6 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ cloud: true, checked: 0, error: "refresh_failed", detail }, { status: 500 });
  }
}
