import { NextResponse } from "next/server";
import { getSupabaseServerConfig } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getSupabaseServerConfig();
  return NextResponse.json({
    configured: config.configured,
    hasUrl: config.hasUrl,
    hasServerKey: config.hasServerKey,
    keySource: config.keySource,
    vercelEnvironment: process.env.VERCEL_ENV || "local",
  }, { headers: { "Cache-Control": "no-store" } });
}
