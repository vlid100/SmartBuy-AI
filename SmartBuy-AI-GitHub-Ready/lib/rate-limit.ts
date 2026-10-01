import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "anonymous";
}

export function applyRateLimit(request: NextRequest, namespace: string, limit = 60, windowMs = 60_000) {
  if (process.env.SMARTBUY_RATE_LIMIT_ENABLED === "false") return null;
  const now = Date.now(); const key = `${namespace}:${clientKey(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1; buckets.set(key, bucket);
  if (buckets.size > 3000) for (const [k, value] of buckets) if (value.resetAt <= now) buckets.delete(k);
  const remaining = Math.max(0, limit - bucket.count);
  if (bucket.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json({ error: "rate_limited", message: "Забагато запитів. Спробуй ще раз трохи пізніше." }, {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}
