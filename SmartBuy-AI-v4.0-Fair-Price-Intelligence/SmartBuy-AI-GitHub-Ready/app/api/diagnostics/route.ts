import { NextRequest, NextResponse } from "next/server";
import { buildDiagnostics } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const data = await buildDiagnostics(false);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { deep?: boolean };
  const data = await buildDiagnostics(Boolean(body.deep));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
