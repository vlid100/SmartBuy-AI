import { NextRequest, NextResponse } from "next/server";
import { refreshTrackedProducts } from "@/lib/tracking";
import { refreshSavedSearches } from "@/lib/saved-searches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Keep the daily Hobby cron conservative: both jobs use external market pages.
  const tracked = await refreshTrackedProducts({ limit: 6 });
  const savedSearches = await refreshSavedSearches({ limit: 4 });
  return NextResponse.json({
    ok: true,
    tracked,
    savedSearches,
    ranAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
