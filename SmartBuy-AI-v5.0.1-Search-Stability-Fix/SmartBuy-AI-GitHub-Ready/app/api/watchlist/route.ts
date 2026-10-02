import { NextRequest, NextResponse } from "next/server";
import type { Product } from "@/lib/types";
import { deleteWatch, getWatchlist, upsertWatch } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const syncKey = (request.nextUrl.searchParams.get("token") || "").trim();
  if (syncKey.length < 8) return NextResponse.json({ cloud: false, items: [] }, { status: 400 });
  const result = await getWatchlist(syncKey);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: string; product?: Product; targetPrice?: number } | null;
  if (!body?.token || body.token.length < 8 || !body.product?.id) return NextResponse.json({ cloud: false }, { status: 400 });
  const result = await upsertWatch(body.token, body.product, body.targetPrice);
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: string; productKey?: string } | null;
  if (!body?.token || body.token.length < 8 || !body.productKey) return NextResponse.json({ cloud: false }, { status: 400 });
  const result = await deleteWatch(body.token, body.productKey);
  return NextResponse.json(result);
}
