import { NextResponse } from "next/server";
import { sourceCounts } from "@/lib/source-registry";
import { liveSources } from "@/lib/live-market";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ version: "0.4.0", market: "Ukraine", sourceLinksReady: true, automaticAggregation: "live-best-effort", liveSources: liveSources.map(s => s.name), sources: sourceCounts });
}
