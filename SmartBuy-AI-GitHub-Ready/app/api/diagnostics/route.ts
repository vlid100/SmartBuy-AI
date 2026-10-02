import { NextRequest, NextResponse } from "next/server";
import { buildDiagnostics } from "@/lib/diagnostics";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function safeMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "unknown_error");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9._-]+/gi, "sb_[redacted]")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[token redacted]")
    .slice(0, 220);
}

async function respond(deep: boolean) {
  try {
    const data = await buildDiagnostics(deep);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Diagnostics must diagnose problems, not become another opaque HTTP 500.
    return NextResponse.json({
      ok: false,
      deep,
      version: "6.0.2",
      checkedAt: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
      cloudConfigured: false,
      checks: [{
        id: "diagnostics-runtime",
        label: "Diagnostics runtime",
        status: "error",
        summary: "Серверна перевірка завершилась помилкою",
        detail: safeMessage(error),
      }],
      sourceStatuses: [],
      summary: { ok: 0, warn: 0, error: 1, info: 0 },
      secretsExposed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, "diagnostics", 30, 60_000); if (limited) return limited;
  return respond(false);
}

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, "diagnostics-deep", 8, 60_000); if (limited) return limited;
  const body = await request.json().catch(() => ({})) as { deep?: boolean };
  return respond(Boolean(body.deep));
}
