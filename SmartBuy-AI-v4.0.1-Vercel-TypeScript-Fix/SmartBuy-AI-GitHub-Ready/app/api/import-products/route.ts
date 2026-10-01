import { NextRequest, NextResponse } from "next/server";
import { importProductFromUrl } from "@/lib/product-import";
import type { ProductImportResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_URLS = 5;

function normalizedUrls(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const unique = new Set<string>();
  for (const raw of value) {
    const url = String(raw || "").trim();
    if (!url || unique.has(url)) continue;
    unique.add(url);
    if (unique.size >= MAX_URLS) break;
  }
  return [...unique];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { urls?: unknown };
    const urls = normalizedUrls(body.urls);
    if (!urls.length) {
      return NextResponse.json({
        ok: false,
        requestedCount: 0,
        successCount: 0,
        manualCount: 0,
        message: "Додай від 1 до 5 посилань — по одному в кожному рядку.",
        results: [],
      }, { status: 400 });
    }

    const settled = await Promise.allSettled(urls.map(url => importProductFromUrl(url)));
    const results: ProductImportResponse[] = settled.map((item, index) => {
      if (item.status === "fulfilled") return item.value;
      return {
        ok: false,
        url: urls[index],
        finalUrl: urls[index],
        extraction: "manual",
        message: "Не вдалося автоматично прочитати сторінку. Відкрий цей URL в одиночному імпорті та підтвердь дані вручну.",
      };
    });
    const successCount = results.filter(item => item.ok && item.product).length;
    const manualCount = results.length - successCount;

    return NextResponse.json({
      ok: successCount > 0,
      requestedCount: urls.length,
      successCount,
      manualCount,
      message: successCount === urls.length
        ? `Усі ${urls.length} товарів імпортовано.`
        : `Автоматично імпортовано ${successCount} з ${urls.length}. Решту можна підтвердити вручну.`,
      results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      requestedCount: 0,
      successCount: 0,
      manualCount: 0,
      message: "Не вдалося обробити список посилань.",
      results: [],
    }, { status: 400 });
  }
}
