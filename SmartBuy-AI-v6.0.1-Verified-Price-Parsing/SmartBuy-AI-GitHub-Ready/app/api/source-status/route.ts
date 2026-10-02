import { NextResponse } from "next/server";
import { sourceCapabilitySummary, sourceCounts } from "@/lib/source-registry";
import { automaticLiveSources, probeLiveSources, stableLiveSources } from "@/lib/live-market";
import { sourceRouterSummary } from "@/lib/source-router";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    version: "6.0.1",
    market: "Ukraine adaptive live routing + private probes + international direct search",
    architecture: "source-connectors+capability-matrix+assisted-product-import+adaptive-source-router+query-expansion+search-quality+fair-price-intelligence",
    automaticAggregation: "public-pages-best-effort-no-bypass",
    stableSources: stableLiveSources.map(s => s.name),
    probeSources: probeLiveSources.map(s => s.name),
    router: sourceRouterSummary(automaticLiveSources),
    sources: sourceCounts,
    capabilities: sourceCapabilitySummary(),
  });
}
