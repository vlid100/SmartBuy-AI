import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const productKey = (request.nextUrl.searchParams.get("product") || "").trim();
  const daysRaw = Number(request.nextUrl.searchParams.get("days") || "90");
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(7, Math.round(daysRaw))) : 90;
  if (!productKey) return NextResponse.json({ cloud: false, points: [] }, { status: 400 });
  const result = await getPriceHistory(productKey, days);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
