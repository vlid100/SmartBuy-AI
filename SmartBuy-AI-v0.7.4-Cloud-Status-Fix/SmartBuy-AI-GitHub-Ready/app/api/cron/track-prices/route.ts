import { NextRequest, NextResponse } from "next/server";
import { refreshTrackedProducts } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await refreshTrackedProducts({ limit: 12 });
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
