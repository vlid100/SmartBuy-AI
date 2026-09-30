import { NextRequest, NextResponse } from "next/server";
import { products } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").toLowerCase().trim();
  const category = (request.nextUrl.searchParams.get("category") || "").toLowerCase().trim();
  const maxPriceRaw = request.nextUrl.searchParams.get("maxPrice");
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  const tokens = q.split(/\s+/).filter(Boolean);
  const results = products
    .filter((p) => {
      const haystack = `${p.title} ${p.category} ${p.subtitle} ${p.highlights.join(" ")} ${p.aiSummary}`.toLowerCase();
      const textMatch = tokens.length === 0 || tokens.some((token) => haystack.includes(token));
      const categoryMatch = !category || p.category.toLowerCase() === category;
      const priceMatch = !maxPrice || p.bestPrice <= maxPrice;
      return textMatch && categoryMatch && priceMatch;
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ query: q, count: results.length, results });
}
