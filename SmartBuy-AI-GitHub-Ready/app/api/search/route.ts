import { NextRequest, NextResponse } from "next/server";
import { searchProducts, type ConditionFilter, type MarketScope } from "@/lib/search";

export const dynamic = "force-dynamic";

const allowedScopes: MarketScope[] = ["all", "ukraine", "private", "international"];
const allowedConditions: ConditionFilter[] = ["all", "new", "used"];

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const category = (request.nextUrl.searchParams.get("category") || "").trim();
  const maxPriceRaw = request.nextUrl.searchParams.get("maxPrice");
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  // New v1.0.1 controls. Old ?market= links still work for backwards compatibility.
  const legacy = request.nextUrl.searchParams.get("market") || "";
  const rawScope = (request.nextUrl.searchParams.get("scope") || (legacy === "stores" ? "ukraine" : legacy === "private" ? "private" : legacy === "international" ? "international" : "all")) as MarketScope;
  const rawCondition = (request.nextUrl.searchParams.get("condition") || (legacy === "new" ? "new" : legacy === "used" ? "used" : "all")) as ConditionFilter;
  const scope = allowedScopes.includes(rawScope) ? rawScope : "all";
  const condition = allowedConditions.includes(rawCondition) ? rawCondition : "all";

  const smart = request.nextUrl.searchParams.get("smart") === "1";
  const result = await searchProducts(q, category, maxPrice, scope, condition, smart);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
