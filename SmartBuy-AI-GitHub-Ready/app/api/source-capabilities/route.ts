import { NextResponse } from "next/server";
import { getSourceCapabilityMatrix, sourceCapabilitySummary } from "@/lib/source-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    version: "6.0.0",
    generatedAt: new Date().toISOString(),
    summary: sourceCapabilitySummary(),
    sources: getSourceCapabilityMatrix(),
    note: "Capability levels describe what SmartBuy can obtain or calculate from a connector. They are not a trust/rating score for a store.",
  }, { headers: { "Cache-Control": "no-store" } });
}
