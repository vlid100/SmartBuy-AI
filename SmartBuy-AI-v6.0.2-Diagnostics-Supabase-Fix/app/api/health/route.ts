import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "SmartBuy AI",
    version: "6.0.2",
    liveMarket: "source connectors + capability matrix + adaptive routing + conservative query expansion + deduplication",
    pwa: true,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
