import { NextRequest, NextResponse } from "next/server";
import { buildManualImportedProduct, importProductFromUrl } from "@/lib/product-import";
import { identifySourceUrl } from "@/lib/source-registry";
import type { ListingCondition } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { url?: string; manual?: { title?: string; priceUah?: number; imageUrl?: string; condition?: ListingCondition } };
    const url = String(body.url || "").trim();
    if (!url) return NextResponse.json({ ok: false, extraction: "manual", message: "Встав посилання на конкретний товар." }, { status: 400 });

    if (body.manual?.title && Number(body.manual.priceUah) > 0) {
      const source = identifySourceUrl(url);
      if (!source) return NextResponse.json({ ok: false, extraction: "manual", message: "Це джерело поки не підтримується для імпорту." }, { status: 400 });
      const product = buildManualImportedProduct({
        url, title: String(body.manual.title).trim(), priceUah: Number(body.manual.priceUah), sourceId: source.id,
        sourceName: source.name, sourceKind: source.kind, imageUrl: body.manual.imageUrl, condition: body.manual.condition,
      });
      return NextResponse.json({ ok: true, sourceId: source.id, sourceName: source.name, sourceKind: source.kind, url, finalUrl: url, extraction: "manual", message: "Дані підтверджено вручну й додано в SmartBuy.", product });
    }

    const result = await importProductFromUrl(url);
    return NextResponse.json(result, { status: result.ok ? 200 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, extraction: "manual", message: "Не вдалося обробити імпорт. Перевір посилання й спробуй ще раз." }, { status: 400 });
  }
}
