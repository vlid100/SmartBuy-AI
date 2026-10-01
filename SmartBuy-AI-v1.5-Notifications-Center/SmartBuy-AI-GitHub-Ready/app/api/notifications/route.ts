import { NextRequest, NextResponse } from "next/server";
import { createNotificationForSyncKey, deleteNotification, getNotifications, markNotificationsRead } from "@/lib/notifications";
import type { SmartNotificationKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  id?: string;
  all?: boolean;
  event?: {
    dedupeKey?: string;
    kind?: SmartNotificationKind;
    title?: string;
    body?: string;
    entityType?: "product" | "saved_search";
    entityId?: string;
    price?: number;
    previousPrice?: number;
    url?: string;
  };
};

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get("token") || "").trim();
  if (token.length < 8) return NextResponse.json({ cloud: false, tableReady: false, items: [] }, { status: 400 });
  const result = await getNotifications(token);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8 || !body.event?.dedupeKey || !body.event.title) return NextResponse.json({ cloud: false }, { status: 400 });
  const result = await createNotificationForSyncKey(body.token, {
    dedupeKey: body.event.dedupeKey,
    kind: body.event.kind || "info",
    title: body.event.title,
    body: body.event.body || "",
    entityType: body.event.entityType,
    entityId: body.event.entityId,
    price: body.event.price,
    previousPrice: body.event.previousPrice,
    url: body.event.url,
  });
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8) return NextResponse.json({ cloud: false }, { status: 400 });
  return NextResponse.json(await markNotificationsRead(body.token, body.all ? undefined : body.id));
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8 || !body.id) return NextResponse.json({ cloud: false }, { status: 400 });
  return NextResponse.json(await deleteNotification(body.token, body.id));
}
