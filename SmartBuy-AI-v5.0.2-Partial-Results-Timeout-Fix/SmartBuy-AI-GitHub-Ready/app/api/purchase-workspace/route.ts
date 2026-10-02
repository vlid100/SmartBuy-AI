import { NextRequest, NextResponse } from "next/server";
import type { PurchaseWorkspaceItem } from "@/lib/purchase-workspace";
import { deletePurchaseWorkspace, getPurchaseWorkspace, upsertPurchaseWorkspace } from "@/lib/purchase-workspace";

export const dynamic = "force-dynamic";

type Body = { token?: string; item?: PurchaseWorkspaceItem; productKey?: string };

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get("token") || "").trim();
  if (token.length < 8) return NextResponse.json({ cloud: false, tableReady: false, items: [] }, { status: 400 });
  const result = await getPurchaseWorkspace(token);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8 || !body.item?.product?.id) return NextResponse.json({ cloud: false, tableReady: false }, { status: 400 });
  const result = await upsertPurchaseWorkspace(body.token, body.item);
  return NextResponse.json(result, { status: result.tableReady === false ? 503 : 200 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8 || !body.productKey) return NextResponse.json({ cloud: false, tableReady: false }, { status: 400 });
  const result = await deletePurchaseWorkspace(body.token, body.productKey);
  return NextResponse.json(result, { status: result.tableReady === false ? 503 : 200 });
}
