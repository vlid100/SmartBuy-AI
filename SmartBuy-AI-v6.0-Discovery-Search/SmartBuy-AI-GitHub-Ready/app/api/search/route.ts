import { after, NextRequest, NextResponse } from "next/server";
import { searchProducts, type ConditionFilter, type MarketScope } from "@/lib/search";
import { applyRateLimit } from "@/lib/rate-limit";
import { serverLog } from "@/lib/server-log";
import { snapshotProducts } from "@/lib/persistence";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const allowedScopes: MarketScope[] = ["all", "ukraine", "private", "international"];
const allowedConditions: ConditionFilter[] = ["all", "new", "used"];

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, "search", 36, 60_000); if (limited) return limited;
  const started = Date.now();
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
  try {
    const routeBudgetMs = Math.max(12_000, Math.min(Number(process.env.SMARTBUY_SEARCH_ROUTE_TIMEOUT_MS || 30_000), 36_000));
    const result = await searchProducts(q, category, maxPrice, scope, condition, smart, { deadlineAt: started + routeBudgetMs });

    // Persist product snapshots after the response path is ready. Next.js `after()` lets
    // Vercel do this work without making the user wait for Supabase history writes.
    if (result.results.length) {
      const snapshot = result.results;
      after(async () => {
        try { await snapshotProducts(snapshot); } catch {}
      });
    }
    if (Date.now() - started > 6000 || !result.results.length || result.partial) void serverLog("search_complete", "info", { scope, durationMs: Date.now() - started, count: result.count, sourceCount: result.coverage.sourceCount, partial: Boolean(result.partial) });
    return NextResponse.json(result, { headers: {
      "Cache-Control": "no-store",
      "X-SmartBuy-Search-Ms": String(Date.now() - started),
      "X-SmartBuy-Partial": result.partial ? "1" : "0",
    } });
  } catch (error) {
    void serverLog("search_error", "error", { scope, durationMs: Date.now() - started, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "search_failed", message: "Не вдалося завершити пошук." }, { status: 500 });
  }
}
