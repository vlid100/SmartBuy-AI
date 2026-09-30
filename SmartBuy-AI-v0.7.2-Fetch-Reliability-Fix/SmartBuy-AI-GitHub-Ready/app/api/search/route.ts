import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/search";
import type { MarketFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

const allowedFilters: MarketFilter[] = ["all", "new", "used", "stores", "private", "international"];

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const category = (request.nextUrl.searchParams.get("category") || "").trim();
  const maxPriceRaw = request.nextUrl.searchParams.get("maxPrice");
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;
  const rawFilter = (request.nextUrl.searchParams.get("market") || "all") as MarketFilter;
  const marketFilter = allowedFilters.includes(rawFilter) ? rawFilter : "all";

  const result = await searchProducts(q, category, maxPrice, marketFilter);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
