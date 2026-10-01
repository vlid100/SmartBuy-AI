import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type NbuRate = { cc?: string; rate?: number; exchangedate?: string };

const wanted = new Set(["USD", "EUR", "PLN", "GBP"]);

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "SmartBuy-AI/2.3" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`nbu_${response.status}`);
    const rows = (await response.json()) as NbuRate[];
    const rates: Record<string, number> = { UAH: 1 };
    let updatedAt = "";
    for (const row of rows) {
      const code = String(row.cc || "").toUpperCase();
      const rate = Number(row.rate);
      if (wanted.has(code) && Number.isFinite(rate) && rate > 0) rates[code] = rate;
      if (!updatedAt && row.exchangedate) updatedAt = row.exchangedate;
    }
    return NextResponse.json({ ok: true, source: "NBU", rates, updatedAt }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "fx_unavailable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
