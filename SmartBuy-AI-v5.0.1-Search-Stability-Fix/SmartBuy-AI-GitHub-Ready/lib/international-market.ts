import * as cheerio from "cheerio";
import type { Offer, SourceSearchStatus } from "@/lib/types";
import { evaluateTitleMatch, productVariantSignals } from "@/lib/matching";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 SmartBuyAI/5.0";
const BLOCK_PATTERNS = /captcha|cf-chl-|verify you are human|robot check|unusual traffic|access denied|automated access|sorry, we just need to make sure/i;

type IntlSource = {
  id: "amazon" | "aliexpress" | "temu";
  name: string;
  buildUrl: (query: string) => string;
  selectors: { card: string; title: string; price: string; link: string; image?: string; delivery?: string };
};

type IntlSourceResult = { offers: Offer[]; status: SourceSearchStatus };
type FxCache = { expiresAt: number; values: Record<string, number> };
let fxCache: FxCache | null = null;

const enc = (value: string) => encodeURIComponent(value.trim());

const sources: IntlSource[] = [
  {
    id: "amazon", name: "Amazon", buildUrl: q => `https://www.amazon.com/s?k=${enc(q)}`,
    selectors: {
      card: '[data-component-type="s-search-result"]',
      title: 'h2 span, h2 a, [data-cy="title-recipe"]',
      price: '.a-price .a-offscreen, [data-cy="price-recipe"] .a-offscreen, .a-price-whole',
      link: 'h2 a[href], a.a-link-normal[href*="/dp/"], a[href*="/gp/"]',
      image: 'img.s-image, img[data-image-latency]',
      delivery: '[data-cy="delivery-recipe"], [data-cy="delivery-block"], .a-color-base.a-text-bold',
    },
  },
  {
    id: "aliexpress", name: "AliExpress", buildUrl: q => `https://www.aliexpress.com/wholesale?SearchText=${enc(q)}`,
    selectors: {
      card: 'a[href*="/item/"], [class*="search-item-card-wrapper"], [class*="card"]',
      title: '[class*="title"], h1, h2, h3',
      price: '[class*="price"], [class*="salePrice"], [class*="multi--price"]',
      link: 'a[href*="/item/"]',
      image: 'img',
      delivery: '[class*="shipping"], [class*="delivery"]',
    },
  },
  {
    id: "temu", name: "Temu", buildUrl: q => `https://www.temu.com/search_result.html?search_key=${enc(q)}`,
    selectors: {
      card: 'a[href*="-g-"], a[href*="goods.html"], [class*="product"]',
      title: '[class*="title"], [class*="goods-name"], h2, h3',
      price: '[class*="price"], [data-type="price"]',
      link: 'a[href*="-g-"], a[href*="goods.html"]',
      image: 'img',
      delivery: '[class*="shipping"], [class*="delivery"]',
    },
  },
];

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function absoluteUrl(value: unknown, base: string) {
  const raw = clean(value); if (!raw) return undefined;
  try { const url = new URL(raw, base); return /^https?:$/.test(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}
function parseCount(value: unknown) {
  const raw = clean(value).toLowerCase(); if (!raw) return undefined;
  const multiplier = /k\b/.test(raw) ? 1_000 : /m\b/.test(raw) ? 1_000_000 : 1;
  const num = Number((raw.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0] || "").replace(",", "."));
  return Number.isFinite(num) && num > 0 ? Math.round(num * multiplier) : undefined;
}
function parseRating(value: unknown) {
  const num = Number((clean(value).match(/[0-5](?:[.,][0-9])?/)?.[0] || "").replace(",", "."));
  return Number.isFinite(num) && num > 0 && num <= 5 ? Math.round(num * 10) / 10 : undefined;
}
function detectCurrency(text: string) {
  const t = text.toUpperCase();
  if (/\bUAH\b|₴|ГРН/.test(t)) return "UAH";
  if (/\bEUR\b|€/.test(t)) return "EUR";
  if (/\bGBP\b|£/.test(t)) return "GBP";
  if (/\bPLN\b|ZŁ|PLN/.test(t)) return "PLN";
  if (/\bUSD\b|US\s*\$|\$/.test(t)) return "USD";
  return "USD";
}
function parseMoney(value: unknown, currencyHint?: string): { amount: number; currency: string } | null {
  const text = clean(value).replace(/\u00a0/g, " "); if (!text) return null;
  const currency = (currencyHint || detectCurrency(text)).toUpperCase();
  const matches = [...text.matchAll(/(?:US\s*\$|[$€£₴]|UAH|USD|EUR|GBP|PLN|грн|zł)?\s*([0-9][0-9\s.,]{0,16})/gi)];
  for (const match of matches) {
    let raw = match[1].trim().replace(/\s/g, "");
    if (!raw) continue;
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "");
    else if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\d+,\d{1,2}$/.test(raw)) raw = raw.replace(",", ".");
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount > 0 && amount < 5_000_000) return { amount, currency };
  }
  return null;
}

async function fxRates() {
  if (fxCache && fxCache.expiresAt > Date.now()) return fxCache.values;
  const values: Record<string, number> = { UAH: 1 };
  try {
    const response = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", { cache: "no-store", signal: AbortSignal.timeout(3500) });
    if (response.ok) {
      const data = await response.json() as Array<{ cc?: string; rate?: number }>;
      for (const row of data) if (row.cc && row.rate) values[String(row.cc).toUpperCase()] = Number(row.rate);
    }
  } catch {}
  // Conservative fallback only keeps the feature usable if NBU is temporarily unavailable.
  values.USD ||= Number(process.env.SMARTBUY_FX_USD || 42);
  values.EUR ||= Number(process.env.SMARTBUY_FX_EUR || 49);
  values.GBP ||= Number(process.env.SMARTBUY_FX_GBP || 56);
  values.PLN ||= Number(process.env.SMARTBUY_FX_PLN || 11.5);
  fxCache = { expiresAt: Date.now() + 30 * 60_000, values };
  return values;
}

function valueAt(obj: Record<string, unknown>, keys: string[]) { for (const key of keys) if (obj[key] != null) return obj[key]; return undefined; }
function asObject(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  const obj = asObject(value); return obj ? imageFrom(obj.url || obj.contentUrl || obj.src) : undefined;
}
function availabilityText(value: unknown) {
  const raw = clean(value); if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (/instock|in stock|available|наяв|в наличии/.test(lower)) return "є в наявності";
  if (/outofstock|out of stock|unavailable|немає|нет в наличии/.test(lower)) return "немає в наявності";
  if (/preorder|pre-order|передзамов/.test(lower)) return "передзамовлення";
  return raw.replace(/^https?:\/\/schema\.org\//i, "").slice(0, 80);
}
function returnPolicyText(value: unknown) {
  if (!value) return undefined;
  const obj = asObject(value); if (!obj) return clean(value).slice(0, 120) || undefined;
  const days = parseCount(valueAt(obj, ["merchantReturnDays", "returnDays"]));
  const category = clean(valueAt(obj, ["returnPolicyCategory", "returnMethod"])).replace(/^https?:\/\/schema\.org\//i, "");
  return [days ? `${days} дн.` : "", category].filter(Boolean).join(" · ") || undefined;
}
function shippingInfo(value: unknown) {
  const obj = asObject(value); if (!obj) return { text: undefined as string | undefined, amount: undefined as number | undefined, currency: undefined as string | undefined };
  const rate = asObject(obj.shippingRate) || asObject(obj.shippingRateSettings) || {};
  const money = parseMoney(valueAt(rate, ["value", "price", "shippingRate"]), clean(valueAt(rate, ["currency", "priceCurrency"])) || undefined);
  const destination = asObject(obj.shippingDestination) || {};
  const country = clean(valueAt(destination, ["addressCountry", "name"]));
  const handling = asObject(obj.handlingTime) || {};
  const transit = asObject(obj.transitTime) || {};
  const minDays = parseCount(valueAt(transit, ["minValue"]) ?? valueAt(handling, ["minValue"]));
  const maxDays = parseCount(valueAt(transit, ["maxValue"]) ?? valueAt(handling, ["maxValue"]));
  const parts = [money ? `${money.amount} ${money.currency}` : "", country ? `до ${country}` : "", maxDays ? `${minDays || 0}–${maxDays} дн.` : ""].filter(Boolean);
  return { text: parts.join(" · ") || undefined, amount: money?.amount, currency: money?.currency };
}

async function offerFrom(source: IntlSource, baseUrl: string, input: Record<string, unknown>): Promise<Offer | null> {
  const title = clean(input.title); const url = absoluteUrl(input.url, baseUrl);
  const money = parseMoney(input.price, clean(input.currency) || undefined);
  if (!title || !url || !money) return null;
  const rates = await fxRates(); const rate = rates[money.currency] || 0;
  if (!rate) return null;
  const shipping = parseMoney(input.shippingCost, clean(input.shippingCurrency) || money.currency);
  const shippingUah = shipping && rates[shipping.currency] ? Math.round(shipping.amount * rates[shipping.currency]) : undefined;
  const signals = productVariantSignals(`${title} ${clean(input.sku)} ${clean(input.color)} ${clean(input.regionVersion)}`);
  const availability = availabilityText(input.availability);
  const delivery = clean(input.delivery) || (shipping ? `доставка ${shipping.amount} ${shipping.currency}` : availability || "доставка: уточнити на сторінці");
  return {
    id: `${source.id}-${clean(input.externalId) || Math.abs(hash(`${title}|${url}`))}`,
    externalId: clean(input.externalId) || undefined,
    title, store: source.name, marketplace: source.name,
    sellerName: clean(input.sellerName) || source.name, sellerType: "international", condition: "new",
    price: Math.round(money.amount * rate), currency: "UAH",
    originalPrice: money.amount, originalCurrency: money.currency,
    delivery, shippingCost: shippingUah, availability,
    warranty: clean(input.warranty) || "гарантія: уточнити на сторінці",
    returnPolicy: clean(input.returnPolicy) || undefined,
    trusted: false, verifiedSeller: Boolean(input.verifiedSeller),
    url, imageUrl: absoluteUrl(imageFrom(input.image), baseUrl), source: source.id,
    productRating: parseRating(input.productRating), productReviewCount: parseCount(input.productReviewCount),
    sellerRating: parseRating(input.sellerRating), sellerReviewCount: parseCount(input.sellerReviewCount),
    sellerSince: clean(input.sellerSince) || undefined,
    sku: clean(input.sku) || signals.skus[0], color: clean(input.color) || signals.colors[0], regionVersion: clean(input.regionVersion) || signals.regions[0],
  };
}
function hash(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0; return h; }

async function parseStructured(html: string, source: IntlSource, baseUrl: string) {
  const $ = cheerio.load(html); const results: Offer[] = []; const scripts = $('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]').toArray().slice(0, 60);
  const seen = new Set<object>(); let visited = 0;
  async function visit(node: unknown, depth = 0): Promise<void> {
    if (visited++ > 28000 || depth > 15 || !node) return;
    if (Array.isArray(node)) { for (const child of node.slice(0, 350)) await visit(child, depth + 1); return; }
    if (typeof node !== "object") return; if (seen.has(node as object)) return; seen.add(node as object);
    const obj = node as Record<string, unknown>; const offersObj = asObject(obj.offers) || obj; const seller = asObject(offersObj.seller) || asObject(obj.seller) || {};
    const sellerRating = asObject(seller.aggregateRating) || asObject(seller.rating) || {};
    const productRating = asObject(obj.aggregateRating) || {};
    const shipping = Array.isArray(offersObj.shippingDetails) ? offersObj.shippingDetails[0] : offersObj.shippingDetails;
    const shippingParsed = shippingInfo(shipping);
    const name = valueAt(obj, ["name", "title", "productTitle", "displayName", "subject"]);
    const price = valueAt(offersObj, ["price", "lowPrice", "salePrice", "priceValue", "amount"]) ?? valueAt(obj, ["price", "salePrice", "minPrice"]);
    const url = valueAt(obj, ["url", "productUrl", "productDetailUrl", "productDetailUrlFormatted"]) ?? valueAt(offersObj, ["url"]);
    if (typeof name === "string" && price != null && typeof url === "string") {
      const offer = await offerFrom(source, baseUrl, {
        title: name, price, currency: valueAt(offersObj, ["priceCurrency", "currency"]) ?? valueAt(obj, ["currency", "priceCurrency"]), url,
        image: valueAt(obj, ["image", "imageUrl", "thumbnailUrl", "imagePath"]), externalId: valueAt(obj, ["sku", "productId", "itemId", "asin", "id"]),
        sellerName: valueAt(seller, ["name", "sellerName", "storeName"]), verifiedSeller: valueAt(seller, ["verified", "isVerified"]),
        sellerRating: valueAt(sellerRating, ["ratingValue", "rating"]), sellerReviewCount: valueAt(sellerRating, ["reviewCount", "ratingCount"]), sellerSince: valueAt(seller, ["foundingDate", "memberSince", "createdAt", "sellerSince"]),
        productRating: valueAt(productRating, ["ratingValue", "rating"]), productReviewCount: valueAt(productRating, ["reviewCount", "ratingCount"]),
        availability: valueAt(offersObj, ["availability", "stockStatus"]), delivery: shippingParsed.text,
        shippingCost: shippingParsed.amount, shippingCurrency: shippingParsed.currency,
        returnPolicy: returnPolicyText(valueAt(offersObj, ["hasMerchantReturnPolicy", "merchantReturnPolicy"])),
        sku: valueAt(obj, ["sku", "mpn", "model", "productId"]), color: valueAt(obj, ["color"]), regionVersion: valueAt(obj, ["region", "countryOfOrigin"]),
      });
      if (offer) results.push(offer);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (["description", "html", "tracking", "analytics", "translations"].includes(key)) continue;
      if (value && typeof value === "object") await visit(value, depth + 1);
    }
  }
  for (const el of scripts) {
    const raw = $(el).html() || ""; if (!raw || raw.length > 8_000_000) continue;
    try { await visit(JSON.parse(raw)); } catch {}
  }
  return results;
}

async function parseCards(html: string, source: IntlSource, baseUrl: string) {
  const $ = cheerio.load(html); const out: Offer[] = [];
  $(source.selectors.card).slice(0, 80).each((_, el) => { $(el).attr("data-smartbuy-candidate", "1"); });
  const nodes = $('[data-smartbuy-candidate="1"]').toArray();
  for (const el of nodes) {
    const card = $(el); const link = card.is("a") ? card : card.find(source.selectors.link).first();
    const titleNode = card.find(source.selectors.title).first();
    const priceNode = card.find(source.selectors.price).first(); const context = clean(card.text()).slice(0, 1800);
    const title = clean(titleNode.attr("title") || titleNode.text() || link.attr("title") || link.text());
    const priceText = clean(priceNode.attr("aria-label") || priceNode.text()) || context;
    const image = source.selectors.image ? card.find(source.selectors.image).first() : null;
    const delivery = source.selectors.delivery ? clean(card.find(source.selectors.delivery).first().text()) : "";
    const offer = await offerFrom(source, baseUrl, { title, price: priceText, url: link.attr("href"), image: image?.attr("src") || image?.attr("data-src"), delivery,
      productRating: context.match(/([0-5](?:[.,]\d)?)\s*(?:out of 5|stars?|зір)/i)?.[1], productReviewCount: context.match(/\(([0-9,.kKmM]+)\)/)?.[1], availability: context });
    if (offer) out.push(offer);
  }
  return out;
}

function mergeInternationalOffer(base: Offer, extra: Offer): Offer {
  return {
    ...base,
    sellerName: extra.sellerName || base.sellerName,
    sellerRating: extra.sellerRating ?? base.sellerRating,
    sellerReviewCount: extra.sellerReviewCount ?? base.sellerReviewCount,
    sellerSince: extra.sellerSince || base.sellerSince,
    productRating: extra.productRating ?? base.productRating,
    productReviewCount: extra.productReviewCount ?? base.productReviewCount,
    availability: extra.availability || base.availability,
    delivery: extra.delivery && !/уточнити/i.test(extra.delivery) ? extra.delivery : base.delivery,
    shippingCost: extra.shippingCost ?? base.shippingCost,
    returnPolicy: extra.returnPolicy || base.returnPolicy,
    warranty: extra.warranty && !/уточнити/i.test(extra.warranty) ? extra.warranty : base.warranty,
    verifiedSeller: extra.verifiedSeller || base.verifiedSeller,
    sku: extra.sku || base.sku,
    color: extra.color || base.color,
    regionVersion: extra.regionVersion || base.regionVersion,
    imageUrl: extra.imageUrl || base.imageUrl,
  };
}

async function enrichInternationalOffer(source: IntlSource, offer: Offer, timeoutOverrideMs?: number): Promise<Offer> {
  if (!offer.url || process.env.SMARTBUY_INTERNATIONAL_ENRICH_ENABLED === "false") return offer;
  const controller = new AbortController();
  const configured = Math.max(700, Math.min(Number(process.env.SMARTBUY_INTERNATIONAL_ENRICH_TIMEOUT_MS || 1800), 3500));
  const effectiveTimeout = Math.max(500, Math.min(timeoutOverrideMs ?? configured, configured));
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    const response = await fetch(offer.url, { signal: controller.signal, redirect: "follow", cache: "no-store", headers: {
      "user-agent": UA, "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9,uk;q=0.7", "cache-control": "no-cache",
    }});
    if (!response.ok) return offer;
    const html = await response.text();
    if (BLOCK_PATTERNS.test(html.slice(0, 220_000))) return offer;
    const structured = (await parseStructured(html, source, response.url || offer.url))
      .filter(item => evaluateTitleMatch(offer.title || "", item.title || "").score >= 0.72)
      .sort((a, b) => (b.sellerReviewCount || 0) - (a.sellerReviewCount || 0) || (b.productReviewCount || 0) - (a.productReviewCount || 0));
    let enriched = structured[0] ? mergeInternationalOffer(offer, structured[0]) : offer;
    const $ = cheerio.load(html);
    const body = clean($("body").text()).slice(0, 120_000);
    const availability = /(?:in stock|available now|є в наявності|в наявності)/i.test(body) ? "є в наявності" : /(?:out of stock|currently unavailable|немає в наявності)/i.test(body) ? "немає в наявності" : undefined;
    const returns = body.match(/(?:free returns?|returns? accepted|return within|повернення)[^.|•]{0,110}/i)?.[0];
    const delivery = body.match(/(?:free shipping|free delivery|delivery[^.|•]{0,90}|shipping[^.|•]{0,90})/i)?.[0];
    enriched = {
      ...enriched,
      availability: enriched.availability || availability,
      returnPolicy: enriched.returnPolicy || clean(returns) || undefined,
      delivery: enriched.delivery && !/уточнити/i.test(enriched.delivery) ? enriched.delivery : (clean(delivery) || enriched.delivery),
    };
    return enriched;
  } catch { return offer; } finally { clearTimeout(timeout); }
}

async function enrichInternationalOffers(source: IntlSource, offers: Offer[], budgetMs?: number) {
  const limit = Math.max(0, Math.min(Number(process.env.SMARTBUY_INTERNATIONAL_ENRICH_LIMIT || 1), 3, offers.length));
  if (!limit) return offers;
  const perOfferTimeout = budgetMs ? Math.max(500, Math.min(budgetMs, 1800)) : undefined;
  const head = await Promise.all(offers.slice(0, limit).map(offer => enrichInternationalOffer(source, offer, perOfferTimeout)));
  return [...head, ...offers.slice(limit)];
}

function dedupe(items: Offer[], query: string) {
  const map = new Map<string, Offer>();
  for (const offer of items) {
    if (!offer.title) continue; const match = evaluateTitleMatch(query, offer.title); if (!match.reliable) continue;
    const key = `${offer.source}|${(offer.externalId || offer.url || offer.title).toLowerCase().replace(/[?#].*$/, "")}`;
    const current = map.get(key); const enriched = { ...offer, matchConfidence: Math.round(match.score * 100), matchConflicts: match.conflicts };
    if (!current || (enriched.sellerReviewCount || 0) + (enriched.productReviewCount || 0) > (current.sellerReviewCount || 0) + (current.productReviewCount || 0)) map.set(key, enriched);
  }
  return [...map.values()].sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0) || a.price - b.price).slice(0, 12);
}

async function searchSource(source: IntlSource, query: string): Promise<IntlSourceResult> {
  const started = Date.now();
  const totalBudgetMs = Math.max(2200, Math.min(Number(process.env.SMARTBUY_INTERNATIONAL_TOTAL_TIMEOUT_MS || 6000), 8000));
  const deadline = started + totalBudgetMs;
  const controller = new AbortController();
  const configuredFetch = Math.max(1400, Math.min(Number(process.env.SMARTBUY_INTERNATIONAL_TIMEOUT_MS || 4200), 6000));
  const fetchBudget = Math.max(1000, Math.min(configuredFetch, totalBudgetMs - 700));
  const timeout = setTimeout(() => controller.abort(), fetchBudget);
  try {
    const url = source.buildUrl(query);
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store", headers: {
      "user-agent": UA, "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9,uk;q=0.7", "cache-control": "no-cache",
    }});
    if ([401, 403, 429].includes(response.status)) return { offers: [], status: { id: source.id, name: source.name, state: "blocked", offerCount: 0, durationMs: Date.now() - started, message: `HTTP ${response.status} · direct link remains available`, tier: "probe" } };
    if (!response.ok) return { offers: [], status: { id: source.id, name: source.name, state: "error", offerCount: 0, durationMs: Date.now() - started, message: `HTTP ${response.status}`, tier: "probe" } };
    const html = await response.text();
    if (BLOCK_PATTERNS.test(html.slice(0, 220_000))) return { offers: [], status: { id: source.id, name: source.name, state: "blocked", offerCount: 0, durationMs: Date.now() - started, message: "anti-bot / captcha · direct link remains available", tier: "probe" } };
    const raw = [...await parseCards(html, source, response.url || url), ...await parseStructured(html, source, response.url || url)];
    const baseOffers = dedupe(raw, query);
    const enrichBudget = Math.max(0, deadline - Date.now() - 150);
    const offers = enrichBudget >= 600 ? await enrichInternationalOffers(source, baseOffers, enrichBudget) : baseOffers;
    return { offers, status: { id: source.id, name: source.name, state: offers.length ? "ok" : "empty", offerCount: offers.length, durationMs: Date.now() - started, message: offers.length ? "live best-effort" : "page responded, no strict matching cards", tier: "probe", attempts: 1, queryUsed: query, queryVariantsTried: 1 } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error"; const timed = /abort|timeout/i.test(message);
    return { offers: [], status: { id: source.id, name: source.name, state: timed ? "timeout" : "error", offerCount: 0, durationMs: Date.now() - started, message, tier: "probe" } };
  } finally { clearTimeout(timeout); }
}

export async function searchInternationalLive(query: string): Promise<{ offers: Offer[]; statuses: SourceSearchStatus[] }> {
  const disabled = new Set(String(process.env.SMARTBUY_DISABLED_SOURCES || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean));
  const enabled = sources.filter(source => !disabled.has(source.id));
  if (!query.trim() || process.env.SMARTBUY_INTERNATIONAL_FETCH_ENABLED === "false") return { offers: [] as Offer[], statuses: sources.map<SourceSearchStatus>(source => ({ id: source.id, name: source.name, state: "not-run", offerCount: 0, durationMs: 0, message: disabled.has(source.id) ? "disabled by source policy" : "international live fetch disabled", tier: "probe" })) };
  const results = await Promise.all(enabled.map(source => searchSource(source, query)));
  const byId = new Map(results.map(item => [item.status.id, item]));
  return {
    offers: results.flatMap(item => item.offers),
    statuses: sources.map<SourceSearchStatus>(source => disabled.has(source.id)
      ? { id: source.id, name: source.name, state: "not-run", offerCount: 0, durationMs: 0, message: "disabled by source policy", tier: "probe" }
      : byId.get(source.id)?.status || { id: source.id, name: source.name, state: "not-run", offerCount: 0, durationMs: 0, message: "not run", tier: "probe" }),
  };
}
