import { NextRequest, NextResponse } from "next/server";
import type { SavedSearch } from "@/lib/types";
import { deleteSavedSearch, getSavedSearches, upsertSavedSearch } from "@/lib/saved-searches";

export const dynamic = "force-dynamic";

type SavedBody = { token?: string; search?: SavedSearch; id?: string };

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get("token") || "").trim();
  if (token.length < 8) return NextResponse.json({ cloud: false, tableReady: false, items: [] }, { status: 400 });
  const result = await getSavedSearches(token);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as SavedBody | null;
  if (!body?.token || body.token.length < 8 || !body.search?.id) return NextResponse.json({ cloud: false, tableReady: false }, { status: 400 });
  const result = await upsertSavedSearch(body.token, body.search);
  return NextResponse.json(result, { status: result.tableReady === false ? 503 : 200 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as SavedBody | null;
  if (!body?.token || body.token.length < 8 || !body.id) return NextResponse.json({ cloud: false, tableReady: false }, { status: 400 });
  const result = await deleteSavedSearch(body.token, body.id);
  return NextResponse.json(result, { status: result.tableReady === false ? 503 : 200 });
}
