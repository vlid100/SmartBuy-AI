import { NextRequest, NextResponse } from "next/server";
import { buildDiagnostics } from "@/lib/diagnostics";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, "diagnostics", 30, 60_000); if (limited) return limited;
  const data = await buildDiagnostics(false);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, "diagnostics-deep", 8, 60_000); if (limited) return limited;
  const body = await request.json().catch(() => ({})) as { deep?: boolean };
  const data = await buildDiagnostics(Boolean(body.deep));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
