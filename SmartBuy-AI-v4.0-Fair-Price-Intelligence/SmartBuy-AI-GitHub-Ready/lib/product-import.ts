import * as cheerio from "cheerio";
import type { ListingCondition, Offer, Product, SellerType } from "./types";
import { enrichProductSpecs } from "./specs";
import { enrichProductReviews } from "./review-intelligence";
import { identifySourceUrl } from "./source-registry";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 SmartBuyAI/4.0";
const SUPPORTED_FX = new Set(["USD", "EUR", "PLN", "GBP"]);

type ImportExtraction = "automatic" | "partial" | "manual";

export type ImportedProductResult = {
  ok: boolean;
  sourceId?: string;
  sourceName?: string;
  sourceKind?: SellerType | "aggregator";
  url?: string;
  finalUrl?: string;
  extraction: ImportExtraction;
  blocked?: boolean;
  message: string;
  fields?: {
    title?: string;
    price?: number;
    currency?: string;
    priceUah?: number;
    imageUrl?: string;
    sellerName?: string;
    condition?: ListingCondition;
    rating?: number;
    reviewCount?: number;
  };
  product?: Product;
};

type ParsedProduct = {
  title?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  sellerName?: string;
  condition?: ListingCondition;
  rating?: number;
  reviewCount?: number;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value: unknown): number | undefined {
  const raw = clean(value).replace(/\u00a0/g, " ");
  if (!raw) return undefined;
  const match = raw.match(/([0-9][0-9\s.,]{0,18})/);
  if (!match) return undefined;
  let valueText = match[1].replace(/\s/g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(valueText)) valueText = valueText.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(valueText)) valueText = valueText.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(valueText)) valueText = valueText.replace(",", ".");
  const parsed = Number(valueText);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 100_000_000 ? parsed : undefined;
}

function rating(value: unknown): number | undefined {
  const parsed = Number(clean(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 5 ? Math.round(parsed * 10) / 10 : undefined;
}

function count(value: unknown): number | undefined {
  const parsed = Number(clean(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000_000) : undefined;
}

function absoluteUrl(value: unknown, base: string) {
  const raw = clean(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return url.toString();
  } catch { return undefined; }
}

function conditionFrom(text: string, sellerType: SellerType): ListingCondition {
  const value = text.toLowerCase();
  if (/refurb|renewed|відновлен|відновлене|відновлений/.test(value)) return "refurbished";
  if (/\bused\b|б\/в|\bбу\b|вживан|вживаний|вживана/.test(value)) return "used";
  return sellerType === "private" ? "used" : "new";
}

function guessCategory(title: string) {
  const t = title.toLowerCase();
  if (/iphone|smartphone|смартфон|galaxy s|pixel \d|xiaomi|redmi|poco/.test(t)) return "Смартфони";
  if (/notebook|laptop|ноутбук|macbook|lenovo loq|asus tuf|victus|ideapad/.test(t)) return "Ноутбуки";
  if (/телевізор|television|\btv\b|oled tv|qled/.test(t)) return "Телевізори";
  if (/makita|dewalt|bosch|milwaukee|шуруповерт|дриль|перфоратор|болгарк/.test(t)) return "Інструменти";
  if (/пилосос|vacuum|roborock|dreame|robot vacuum|робот-пилосос/.test(t)) return "Для дому";
  return "Усі";
}

function valueAt(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(x => x && typeof x === "object") as Record<string, unknown>[];
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function productObjectsFromJson(root: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let visited = 0;
  const seen = new Set<object>();
  function visit(node: unknown, depth = 0) {
    if (visited++ > 12000 || depth > 12 || !node) return;
    if (Array.isArray(node)) { for (const child of node.slice(0, 300)) visit(child, depth + 1); return; }
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const obj = node as Record<string, unknown>;
    const type = clean(obj["@type"]).toLowerCase();
    if (type === "product" || (obj.name && (obj.offers || obj.price || obj.priceSpecification))) out.push(obj);
    for (const value of Object.values(obj)) visit(value, depth + 1);
  }
  visit(root);
  return out;
}

function parseStructuredProduct(html: string, baseUrl: string, sellerType: SellerType): ParsedProduct {
  const $ = cheerio.load(html);
  const candidates: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]').slice(0, 50).each((_, el) => {
    const raw = $(el).html();
    if (!raw || raw.length > 4_000_000) return;
    try { candidates.push(...productObjectsFromJson(JSON.parse(raw))); } catch {}
  });

  let best: ParsedProduct = {};
  for (const obj of candidates.slice(0, 80)) {
    const offers = objectArray(obj.offers)[0] || {};
    const aggregate = objectArray(obj.aggregateRating)[0] || {};
    const brandObj = objectArray(obj.brand)[0] || {};
    const title = clean(valueAt(obj, ["name", "title", "productName"]));
    const price = number(valueAt(offers, ["price", "lowPrice", "highPrice"]) ?? valueAt(obj, ["price", "lowPrice"]));
    const currency = clean(valueAt(offers, ["priceCurrency", "currency"]) ?? valueAt(obj, ["priceCurrency", "currency"])).toUpperCase();
    const imageRaw = valueAt(obj, ["image", "imageUrl", "thumbnailUrl"]);
    const imageCandidate = Array.isArray(imageRaw) ? imageRaw[0] : imageRaw;
    const seller = objectArray(offers.seller)[0] || {};
    const sellerName = clean(valueAt(seller, ["name"]) || valueAt(brandObj, ["name"]));
    const candidate: ParsedProduct = {
      title: title || undefined,
      price,
      currency: currency || undefined,
      imageUrl: absoluteUrl(typeof imageCandidate === "object" && imageCandidate ? valueAt(imageCandidate as Record<string, unknown>, ["url", "contentUrl"]) : imageCandidate, baseUrl),
      sellerName: sellerName || undefined,
      condition: conditionFrom(`${title} ${clean(offers.itemCondition)}`, sellerType),
      rating: rating(valueAt(aggregate, ["ratingValue", "rating"])),
      reviewCount: count(valueAt(aggregate, ["reviewCount", "ratingCount"])),
    };
    const candidateScore = Number(Boolean(candidate.title)) * 4 + Number(Boolean(candidate.price)) * 5 + Number(Boolean(candidate.imageUrl)) * 2 + Number(Boolean(candidate.rating));
    const bestScore = Number(Boolean(best.title)) * 4 + Number(Boolean(best.price)) * 5 + Number(Boolean(best.imageUrl)) * 2 + Number(Boolean(best.rating));
    if (candidateScore > bestScore) best = candidate;
  }

  const meta = (selectors: string[]) => {
    for (const selector of selectors) {
      const value = $(selector).first().attr("content") || $(selector).first().attr("value") || $(selector).first().text();
      if (clean(value)) return clean(value);
    }
    return "";
  };
  best.title ||= meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) || clean($('h1').first().text()) || clean($('title').text()).replace(/\s*[|—-].*$/, "");
  best.imageUrl ||= absoluteUrl(meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']), baseUrl);
  best.price ||= number(meta(['meta[property="product:price:amount"]', 'meta[itemprop="price"]', 'meta[name="price"]'])) || number($('[itemprop="price"]').first().attr("content")) || number($('[data-price]').first().attr("data-price"));
  best.currency ||= (meta(['meta[property="product:price:currency"]', 'meta[itemprop="priceCurrency"]']).toUpperCase() || undefined);
  best.condition ||= conditionFrom(`${best.title || ""} ${html.slice(0, 12000)}`, sellerType);
  return best;
}

async function nbuRate(currency: string): Promise<number | undefined> {
  const code = currency.toUpperCase();
  if (code === "UAH") return 1;
  if (!SUPPORTED_FX.has(code)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${encodeURIComponent(code)}&json`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return undefined;
    const rows = await response.json() as { rate?: number }[];
    const rate = Number(rows?.[0]?.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timer); }
}

async function fetchKnownUrl(rawUrl: string, expectedSourceId: string) {
  let current = new URL(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.7",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { response, finalUrl: current.toString() };
        const next = new URL(location, current);
        const identified = identifySourceUrl(next.toString());
        if (!identified || identified.id !== expectedSourceId) throw new Error("unsafe_redirect");
        current = next;
        continue;
      }
      return { response, finalUrl: current.toString() };
    } finally { clearTimeout(timer); }
  }
  throw new Error("too_many_redirects");
}

function isBlocked(html: string, status: number) {
  if ([401, 403, 429, 503].includes(status)) return true;
  return /captcha|cf-chl-|verify you are human|access denied|robot check|unusual traffic|перевірте, що ви людина|доступ заборонено/i.test(html.slice(0, 150000));
}

function simpleHash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export async function importProductFromUrl(rawUrl: string): Promise<ImportedProductResult> {
  const identified = identifySourceUrl(rawUrl);
  if (!identified) {
    return { ok: false, extraction: "manual", message: "Це посилання поки не належить до підтримуваних джерел SmartBuy. Підтримуються українські джерела з матриці та Amazon / AliExpress / Temu." };
  }
  let parsedUrl: URL;
  try { parsedUrl = new URL(rawUrl); } catch { return { ok: false, extraction: "manual", message: "Некоректне посилання." }; }
  if (parsedUrl.protocol !== "https:") return { ok: false, extraction: "manual", message: "Для імпорту дозволені лише HTTPS-посилання." };

  try {
    const { response, finalUrl } = await fetchKnownUrl(parsedUrl.toString(), identified.id);
    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text") || contentType.includes("html") || contentType.includes("json") ? await response.text() : "";
    if (!response.ok || isBlocked(html, response.status)) {
      return {
        ok: false, sourceId: identified.id, sourceName: identified.name, sourceKind: identified.kind,
        url: parsedUrl.toString(), finalUrl, extraction: "manual", blocked: true,
        message: `${identified.name} не віддав сторінку серверу SmartBuy. Посилання розпізнане — введи назву й ціну вручну, а SmartBuy збереже джерело та URL.`,
      };
    }
    const parsed = parseStructuredProduct(html, finalUrl, identified.kind === "private" ? "private" : identified.kind === "international" ? "international" : "store");
    const currency = (parsed.currency || (identified.region === "ukraine" ? "UAH" : "")).toUpperCase();
    const rate = parsed.price && currency ? await nbuRate(currency) : undefined;
    const priceUah = parsed.price && rate ? Math.round(parsed.price * rate) : parsed.price && currency === "UAH" ? Math.round(parsed.price) : undefined;
    const fields = { ...parsed, currency: currency || undefined, priceUah };
    if (!parsed.title || !priceUah) {
      return {
        ok: false, sourceId: identified.id, sourceName: identified.name, sourceKind: identified.kind,
        url: parsedUrl.toString(), finalUrl, extraction: "partial", message: `SmartBuy відкрив ${identified.name}, але не зміг надійно підтвердити ${!parsed.title ? "назву" : "ціну в гривні"}. Перевір і доповни поля вручну.`, fields,
      };
    }
    const sellerType: SellerType = identified.kind === "private" ? "private" : identified.kind === "international" ? "international" : "store";
    const offer: Offer = {
      id: `import-offer-${identified.id}-${simpleHash(finalUrl)}`,
      title: parsed.title,
      store: identified.name,
      marketplace: identified.name,
      sellerName: parsed.sellerName || identified.name,
      sellerType,
      condition: parsed.condition || (sellerType === "private" ? "used" : "new"),
      price: priceUah,
      currency: "UAH",
      delivery: sellerType === "international" ? "уточнити на сторінці товару" : "дивись на сторінці товару",
      warranty: sellerType === "private" ? "уточнити" : "дивись на сторінці товару",
      trusted: false,
      url: finalUrl,
      imageUrl: parsed.imageUrl,
      source: identified.id,
      matchConfidence: 100,
      productRating: parsed.rating,
      productReviewCount: parsed.reviewCount,
    };
    const baseProduct: Product = {
      id: `import-${identified.id}-${simpleHash(finalUrl)}`,
      title: parsed.title,
      category: guessCategory(parsed.title),
      subtitle: `Імпортовано з ${identified.name}${currency && currency !== "UAH" && parsed.price ? ` · ${parsed.price} ${currency} ≈ ${priceUah.toLocaleString("uk-UA")} ₴` : ""}`,
      rating: parsed.rating || 0,
      reviewCount: parsed.reviewCount || 0,
      image: parsed.title.slice(0, 2).toUpperCase(),
      imageUrl: parsed.imageUrl,
      bestPrice: priceUah,
      score: 70,
      highlights: [`Імпортовано за прямим URL`, `Джерело: ${identified.name}`],
      aiSummary: `SmartBuy підтягнув доступні дані зі сторінки ${identified.name}. Перед оплатою звір комплектацію, продавця, гарантію та кінцеву суму на оригінальній сторінці.`,
      offers: [offer],
      source: identified.name,
      productUrl: finalUrl,
      grouping: { identityKey: `url:${identified.id}:${simpleHash(finalUrl)}`, canonicalLabel: parsed.title, confidence: 100, mergeSignals: ["direct URL import", identified.name], uniqueTitleCount: 1 },
    };
    const product = enrichProductReviews(enrichProductSpecs(baseProduct));
    return {
      ok: true, sourceId: identified.id, sourceName: identified.name, sourceKind: identified.kind,
      url: parsedUrl.toString(), finalUrl, extraction: "automatic",
      message: `Імпортовано з ${identified.name}. SmartBuy використовує лише ті поля, які вдалося підтвердити на сторінці.`, fields, product,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "import_failed";
    return {
      ok: false, sourceId: identified.id, sourceName: identified.name, sourceKind: identified.kind,
      url: parsedUrl.toString(), extraction: "manual",
      message: message.includes("abort") ? `${identified.name} не відповів вчасно. Можна заповнити назву й ціну вручну.` : `Не вдалося автоматично прочитати ${identified.name}. Посилання розпізнане — використай ручне підтвердження даних.`,
    };
  }
}

export function buildManualImportedProduct(input: { url: string; title: string; priceUah: number; sourceId: string; sourceName: string; sourceKind: SellerType | "aggregator"; imageUrl?: string; condition?: ListingCondition }): Product {
  const sellerType: SellerType = input.sourceKind === "private" ? "private" : input.sourceKind === "international" ? "international" : "store";
  const id = `import-${input.sourceId}-${simpleHash(input.url)}`;
  const offer: Offer = {
    id: `${id}-offer`, title: input.title, store: input.sourceName, marketplace: input.sourceName,
    sellerName: input.sourceName, sellerType, condition: input.condition || (sellerType === "private" ? "used" : "new"),
    price: Math.round(input.priceUah), currency: "UAH", delivery: "уточнити на сторінці товару", warranty: "уточнити",
    trusted: false, url: input.url, imageUrl: input.imageUrl, source: input.sourceId, matchConfidence: 100,
  };
  return enrichProductSpecs({
    id, title: input.title, category: guessCategory(input.title), subtitle: `Ручний імпорт з ${input.sourceName}`,
    rating: 0, reviewCount: 0, image: input.title.slice(0, 2).toUpperCase(), imageUrl: input.imageUrl,
    bestPrice: Math.round(input.priceUah), score: 60, highlights: ["Ручний імпорт", `Джерело: ${input.sourceName}`],
    caution: "Ціну й назву підтверджено вручну. Перед оплатою звір дані на оригінальній сторінці.",
    aiSummary: `SmartBuy зберіг посилання та вручну підтверджені дані з ${input.sourceName}.`, offers: [offer], source: input.sourceName, productUrl: input.url,
    grouping: { identityKey: `url:${input.sourceId}:${simpleHash(input.url)}`, canonicalLabel: input.title, confidence: 100, mergeSignals: ["manual direct URL import"], uniqueTitleCount: 1 },
  });
}
