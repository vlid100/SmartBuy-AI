import { NextResponse } from "next/server";
import { sourceCounts } from "@/lib/source-registry";
import { automaticLiveSources } from "@/lib/live-market";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    version: "0.9.0",
    market: "Ukraine",
    architecture: "hybrid",
    automaticAggregation: "allowed-public-pages-best-effort",
    automaticSources: automaticLiveSources.map(s => s.name),
    sources: sourceCounts,
  });
}
