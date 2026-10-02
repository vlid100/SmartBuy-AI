import { NextRequest, NextResponse } from "next/server";
import { checkSavedSearchesForSync } from "@/lib/saved-searches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CheckBody = { token?: string; id?: string };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as CheckBody | null;
  const token = body?.token?.trim() || "";
  if (token.length < 8) return NextResponse.json({ cloud: false, tableReady: false, checked: 0 }, { status: 400 });
  const result = await checkSavedSearchesForSync(token, body?.id?.trim() || undefined);
  return NextResponse.json(result, { status: result.tableReady === false ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
