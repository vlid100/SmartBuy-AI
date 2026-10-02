import { NextRequest, NextResponse } from "next/server";
import { deletePushSubscription, pushConfigured, pushPublicKey, savePushSubscription, sendPushForSyncKey, type PushSubscriptionInput } from "@/lib/push";
import { applyRateLimit } from "@/lib/rate-limit";
import { serverLog } from "@/lib/server-log";

export const dynamic = "force-dynamic";

type Body = { token?: string; subscription?: PushSubscriptionInput; endpoint?: string; test?: boolean };

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, "push-read", 40, 60_000); if (limited) return limited;
  return NextResponse.json({ supported: pushConfigured(), publicKey: pushConfigured() ? pushPublicKey() : "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, "push-write", 12, 60_000); if (limited) return limited;
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8) return NextResponse.json({ ok: false }, { status: 400 });
  if (body.test) {
    const result = await sendPushForSyncKey(body.token, { title: "SmartBuy Web Push працює", body: "Це тестове повідомлення. Тепер push може приходити навіть коли SmartBuy закритий.", url: "/?tab=notifications", tag: "smartbuy-push-test", kind: "info" });
    return NextResponse.json({ ok: true, ...result });
  }
  if (!body.subscription?.endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await savePushSubscription(body.token, body.subscription, request.headers.get("user-agent") || undefined);
  await serverLog("push_subscribe", result.tableReady ? "info" : "warn", { cloud: result.cloud, tableReady: result.tableReady });
  return NextResponse.json({ ok: Boolean(result.tableReady), ...result });
}

export async function DELETE(request: NextRequest) {
  const limited = applyRateLimit(request, "push-delete", 12, 60_000); if (limited) return limited;
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.token || body.token.length < 8 || !body.endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json(await deletePushSubscription(body.token, body.endpoint));
}
