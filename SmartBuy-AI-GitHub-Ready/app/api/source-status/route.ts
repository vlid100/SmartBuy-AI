import { NextResponse } from "next/server";
import { sourceCounts } from "@/lib/source-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    version: "0.3.0",
    market: "Ukraine",
    sourceLinksReady: true,
    automaticAggregation: "in-progress",
    sources: sourceCounts,
  });
}
