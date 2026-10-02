import * as cheerio from "cheerio";
import type { ListingCondition, Offer, Product, SourceCapabilities, SourceSearchStatus } from "@/lib/types";
import { liveSourceIds, probeSourceIds } from "@/lib/source-registry";
import { sourceConnectorProfile, type ConnectorAdapterKind } from "@/lib/source-capabilities";
import { evaluateTitleMatch, productIdentityKey, productIdentityMeta, productVariantSignals } from "@/lib/matching";
import { expandSearchQuery } from "@/lib/query-expansion";
import { decorateRouterStatus, isCoolingDown, rankSources, recordAndDecorateRouterStatus, routerCooldownMessage, type RouterPhase } from "@/lib/source-router";

export type LiveSource = {
  id: string;
  name: string;
  sellerType: "store" | "private";
  trusted: boolean;
  tier: "stable" | "probe";
  buildUrl: (query: string) => string;
  buildUrls?: (query: string) => string[];
  selectors?: {
    card: string;
    title: string;
    price: string;
    link: string;
    image?: string;
    meta?: string;
  };
  connectorAdapter?: ConnectorAdapterKind;
  capabilities?: SourceCapabilities;
};

type SourceResult = { offers: Offer[]; status: SourceSearchStatus };
type LiveMode = "stores" | "private" | "all";
export type LiveSearchOptions = { deadlineAt?: number };
type CacheEntry = { expiresAt: number; value: SourceResult };

const enc = (value: string) => encodeURIComponent(value.trim());
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/^-|-$/g, "");
const tierFor = (id: string): "stable" | "probe" => liveSourceIds.has(id) ? "stable" : "probe";

const rawLiveSources: LiveSource[] = [
  {
    id: "olx", name: "OLX", sellerType: "private", trusted: false, tier: tierFor("olx"),
    buildUrl: q => `https://www.olx.ua/uk/list/q-${slug(q)}/`,
    buildUrls: q => [`https://www.olx.ua/uk/list/q-${slug(q)}/`, `https://www.olx.ua/uk/list/?q=${enc(q)}`],
    selectors: { card: '[data-cy="l-card"], [data-testid="l-card"], article', title: 'h4, h6, [data-cy="ad-card-title"], [data-testid="ad-title"]', price: '[data-testid="ad-price"], p:contains("грн")', link: 'a[href]', image: 'img', meta: '[data-testid="location-date"]' }
  },
  {
    id: "rozetka", name: "Rozetka", sellerType: "store", trusted: true, tier: tierFor("rozetka"),
    buildUrl: q => `https://rozetka.com.ua/ua/search/?text=${enc(q)}`,
    buildUrls: q => [`https://rozetka.com.ua/ua/search/?text=${enc(q)}`, `https://rozetka.com.ua/ua/search/?text=${enc(q)}&page=1`],
    selectors: { card: 'rz-catalog-tile, .goods-tile, [class*="catalog-grid"] li', title: '.goods-tile__title, .goods-tile__heading, [class*="title"]', price: '.goods-tile__price-value, .goods-tile__price, [class*="price"]', link: 'a.goods-tile__heading, a[href]', image: 'img' }
  },
  {
    id: "prom", name: "Prom.ua", sellerType: "store", trusted: true, tier: tierFor("prom"),
    buildUrl: q => `https://prom.ua/ua/search?search_term=${enc(q)}`,
    selectors: { card: '[data-qaid="product_block"], [data-testid*="product"], article', title: '[data-qaid="product_name"], [data-testid="product-name"], h2, h3', price: '[data-qaid="product_price"], [data-testid="product-price"], [class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "bigl", name: "Bigl.ua", sellerType: "store", trusted: true, tier: tierFor("bigl"),
    buildUrl: q => `https://bigl.ua/ua/search?search_term=${enc(q)}`,
    selectors: { card: '[data-qaid="product_block"], [data-testid*="product"], article', title: '[data-qaid="product_name"], [data-testid="product-name"], h2, h3', price: '[data-qaid="product_price"], [data-testid="product-price"], [class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "moyo", name: "MOYO", sellerType: "store", trusted: true, tier: tierFor("moyo"),
    buildUrl: q => `https://www.moyo.ua/ua/search/new/?q=${enc(q)}`,
    selectors: { card: '[class*="product-item"], [class*="product-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "hotline", name: "Hotline", sellerType: "store", trusted: true, tier: tierFor("hotline"),
    buildUrl: q => `https://hotline.ua/ua/sr/?q=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="list-item"], article', title: 'a[class*="title"], [class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "ekatalog", name: "E-Katalog", sellerType: "store", trusted: true, tier: tierFor("ekatalog"),
    buildUrl: q => `https://ek.ua/ua/ek-list.php?search_=${enc(q)}`,
    selectors: { card: '[class*="model-short"], [class*="model"], [class*="product"], article', title: '[class*="model-short-title"], [class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "comfy", name: "COMFY", sellerType: "store", trusted: true, tier: tierFor("comfy"),
    buildUrl: q => `https://comfy.ua/ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="product-card__name"], [class*="product-item__name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "foxtrot", name: "Foxtrot", sellerType: "store", trusted: true, tier: tierFor("foxtrot"),
    buildUrl: q => `https://www.foxtrot.com.ua/uk/search?query=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "allo", name: "ALLO", sellerType: "store", trusted: true, tier: tierFor("allo"),
    buildUrl: q => `https://allo.ua/ua/catalogsearch/result/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="product-item"], article', title: '[class*="product-name"], [class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "epicentr", name: "Епіцентр", sellerType: "store", trusted: true, tier: tierFor("epicentr"),
    buildUrl: q => `https://epicentrk.ua/ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="card-product"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "ktc", name: "KTC", sellerType: "store", trusted: true, tier: tierFor("ktc"),
    buildUrl: q => `https://ktc.ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="catalog-item"], article', title: '[class*="title"], [class*="name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "citrus", name: "Цитрус", sellerType: "store", trusted: true, tier: tierFor("citrus"),
    buildUrl: q => `https://www.ctrs.com.ua/search/?q=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="item-card"], article', title: '[class*="title"], [class*="name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "stylus", name: "STYLUS", sellerType: "store", trusted: true, tier: tierFor("stylus"),
    buildUrl: q => `https://stylus.ua/uk/search?q=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="item"], article', title: '[class*="title"], [class*="name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "mta", name: "MTA", sellerType: "store", trusted: true, tier: tierFor("mta"),
    buildUrl: q => `https://mta.ua/search?search=${enc(q)}`,
    selectors: { card: '[class*="product"], [class*="item"], article', title: '[class*="title"], [class*="name"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "telemart", name: "TELEMART", sellerType: "store", trusted: true, tier: tierFor("telemart"),
    buildUrl: q => `https://telemart.ua/ua/search/?search=${enc(q)}`,
    selectors: { card: '[class*="product-item"], [class*="product-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "brain", name: "BRAIN", sellerType: "store", trusted: true, tier: tierFor("brain"),
    buildUrl: q => `https://brain.com.ua/ukr/search/?Search=${enc(q)}`,
    selectors: { card: '[class*="product"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
  {
    id: "shafa", name: "Shafa", sellerType: "private", trusted: false, tier: tierFor("shafa"),
    buildUrl: q => `https://shafa.ua/uk/search?search_text=${enc(q)}`,
    selectors: { card: '[class*="product-card"], [class*="item-card"], article', title: '[class*="title"], h2, h3', price: '[class*="price"]', link: 'a[href]', image: 'img' }
  },
];

export const liveSources: LiveSource[] = rawLiveSources.map(source => {
  const connector = sourceConnectorProfile(source.id, source.tier === "stable" ? "live" : "probe", source.sellerType);
  return { ...source, connectorAdapter: connector.adapter, capabilities: connector.capabilities };
});

export const stableLiveSources = liveSources.filter(source => liveSourceIds.has(source.id));
export const probeLiveSources = liveSources.filter(source => probeSourceIds.has(source.id));
export const automaticLiveSources = [...stableLiveSources, ...probeLiveSources];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 SmartBuyAI/5.0";
const PRICE_RE = /(?:₴|грн\.?|uah)?\s*([0-9][0-9\s\u00a0.,]{1,14})\s*(?:₴|грн\.?|uah)?/i;
const BLOCK_PATTERNS = /captcha|cf-chl-|attention required[^<]{0,80}cloudflare|access denied|verify you are human|перевірте, що ви людина|доступ заборонено|unusual traffic|robot check/i;
const STOP = new Set(["купити","ціна","ціни","новий","нова","нове","бв","б/в","бу","україна","україні","доставка","товар","смартфон","ноутбук","телефон","оригінал"]);
const sourceCache = new Map<string, CacheEntry>();

function cleanText(value?: string | null) { return (value || "").replace(/\s+/g, " ").trim(); }
function parsePrice(value?: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  const text = cleanText(String(value || ""));
  const match = text.match(PRICE_RE);
  if (!match) return null;
  const digits = match[1].replace(/[\s\u00a0]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const number = Number(digits);
  return Number.isFinite(number) && number >= 10 && number <= 20_000_000 ? Math.round(number) : null;
}
function parseRating(value: unknown): number | undefined {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 5 ? Math.round(n * 10) / 10 : undefined;
}
function parseCount(value: unknown): number | undefined {
  const n = Number(String(value ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 10_000_000) : undefined;
}
function aggregateRatingFrom(obj: Record<string, unknown>) {
  const aggregate = obj.aggregateRating;
  const source = aggregate && typeof aggregate === "object" && !Array.isArray(aggregate) ? aggregate as Record<string, unknown> : obj;
  return {
    rating: parseRating(valueAt(source, ["ratingValue", "rating", "value"])),
    count: parseCount(valueAt(source, ["reviewCount", "ratingCount", "count"])),
  };
}
function reviewSnippetsFrom(obj: Record<string, unknown>) {
  const raw = obj.review ?? obj.reviews;
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const review = item as Record<string, unknown>;
    const text = cleanText(String(valueAt(review, ["reviewBody", "description", "text", "name"]) || ""));
    if (text.length < 12) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(text.slice(0, 420));
    if (out.length >= 6) break;
  }
  return out;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function availabilityLabel(value: unknown) {
  const raw = cleanText(String(value || ""));
  if (!raw) return undefined;
  if (/instock|in stock|наяв|в наличии/i.test(raw)) return "є в наявності";
  if (/outofstock|out of stock|немає|нет в наличии/i.test(raw)) return "немає в наявності";
  if (/preorder|pre-order|передзамов/i.test(raw)) return "передзамовлення";
  return raw.replace(/^https?:\/\/schema\.org\//i, "").slice(0, 100);
}
function returnPolicyLabel(value: unknown) {
  const obj = objectValue(value);
  if (!obj) return cleanText(String(value || "")).slice(0, 140) || undefined;
  const days = parseCount(valueAt(obj, ["merchantReturnDays", "returnDays"]));
  const category = cleanText(String(valueAt(obj, ["returnPolicyCategory", "returnMethod"]) || "")).replace(/^https?:\/\/schema\.org\//i, "");
  return [days ? `${days} дн.` : "", category].filter(Boolean).join(" · ") || undefined;
}
function shippingLabel(value: unknown) {
  const obj = objectValue(Array.isArray(value) ? value[0] : value);
  if (!obj) return undefined;
  const rate = objectValue(obj.shippingRate) || {};
  const amount = valueAt(rate, ["value", "price", "amount"]);
  const currency = cleanText(String(valueAt(rate, ["currency", "priceCurrency"]) || ""));
  const destination = objectValue(obj.shippingDestination) || {};
  const country = cleanText(String(valueAt(destination, ["addressCountry", "name"]) || ""));
  const pieces = [amount != null ? `${amount}${currency ? ` ${currency}` : ""}` : "", country ? `до ${country}` : ""].filter(Boolean);
  return pieces.length ? `доставка ${pieces.join(" · ")}` : undefined;
}

function absoluteUrl(url: string | undefined, base: string) {
  if (!url) return undefined;
  try { return new URL(url, base).toString(); } catch { return undefined; }
}
function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  if (value && typeof value === "object") {
    const x = value as Record<string, unknown>;
    return imageFrom(x.url || x.contentUrl || x.src);
  }
  return undefined;
}
function conditionFrom(title: string, source: LiveSource): ListingCondition {
  const t = title.toLowerCase();
  if (/віднов|refurb|renewed/.test(t)) return "refurbished";
  if (/\bнов(ий|а|е|і)\b|new\b|запакован/.test(t)) return "new";
  return source.sellerType === "private" ? "used" : "new";
}
function titleTokens(value: string) {
  return value.toLowerCase().replace(/[^a-zа-яіїєґ0-9+.-]+/gi, " ").split(/\s+/).filter(x => x.length > 1 && !STOP.has(x));
}
function similarity(a: string, b: string) {
  const A = new Set(titleTokens(a)); const B = new Set(titleTokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
}
function usefulTitle(title: string, query: string) {
  const t = cleanText(title);
  if (t.length < 3 || t.length > 220) return false;
  const q = cleanText(query);
  if (q.length < 3) return true;
  const match = evaluateTitleMatch(q, t);
  const qTokens = titleTokens(q);
  if (qTokens.some(token => /\d/.test(token)) || /\b(pro|max|ultra|plus|mini|air|lite|fe|se)\b/i.test(q)) return match.reliable;
  return match.reliable || similarity(t, q) >= 0.36;
}

function offerFrom(source: LiveSource, baseUrl: string, input: { title?: string; price?: unknown; url?: string; image?: unknown; meta?: string; externalId?: string; productRating?: unknown; reviewCount?: unknown; reviewSnippets?: string[]; sellerName?: unknown; sellerRating?: unknown; sellerReviewCount?: unknown; sellerSince?: unknown; returnPolicy?: unknown; availability?: unknown; delivery?: unknown; warranty?: unknown; verifiedSeller?: unknown; sku?: unknown; color?: unknown; regionVersion?: unknown }): Offer | null {
  const title = cleanText(input.title);
  const price = parsePrice(input.price as string | number | null);
  const url = absoluteUrl(input.url, baseUrl);
  if (!title || !price || !url) return null;
  return {
    id: `${source.id}-${input.externalId || Math.abs(hash(`${title}|${price}|${url}`))}`,
    externalId: input.externalId,
    title,
    store: source.name,
    marketplace: source.name,
    sellerName: cleanText(String(input.sellerName || "")) || (source.sellerType === "private" ? "продавець" : source.name),
    sellerType: source.sellerType,
    condition: conditionFrom(title, source),
    price,
    currency: "UAH",
    delivery: cleanText(String(input.delivery || "")) || (source.sellerType === "private" ? "уточнити в оголошенні" : "дивись на сайті"),
    warranty: cleanText(String(input.warranty || "")) || (source.sellerType === "private" ? "уточнити" : "дивись на сайті"),
    trusted: source.trusted,
    verifiedSeller: Boolean(input.verifiedSeller),
    city: source.sellerType === "private" ? cleanText(input.meta) || undefined : undefined,
    url,
    imageUrl: absoluteUrl(imageFrom(input.image), baseUrl),
    source: source.id,
    productRating: parseRating(input.productRating),
    productReviewCount: parseCount(input.reviewCount),
    reviewSnippets: input.reviewSnippets?.filter(Boolean).slice(0, 6),
    sellerRating: parseRating(input.sellerRating),
    sellerReviewCount: parseCount(input.sellerReviewCount),
    sellerSince: cleanText(String(input.sellerSince || "")) || undefined,
    returnPolicy: cleanText(String(input.returnPolicy || "")) || undefined,
    availability: cleanText(String(input.availability || "")) || undefined,
    sku: cleanText(String(input.sku || "")) || productVariantSignals(title).skus[0],
    color: cleanText(String(input.color || "")) || productVariantSignals(title).colors[0],
    regionVersion: cleanText(String(input.regionVersion || "")) || productVariantSignals(title).regions[0],
  };
}

function hash(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0; return h; }

function parseCards(html: string, source: LiveSource, baseUrl: string): Offer[] {
  if (!source.selectors) return [];
  const $ = cheerio.load(html);
  const result: Offer[] = [];
  $(source.selectors.card).slice(0, 50).each((_, element) => {
    const card = $(element);
    const titleEl = card.find(source.selectors!.title).first();
    const linkEl = card.find(source.selectors!.link).first();
    const priceEl = card.find(source.selectors!.price).first();
    const imageEl = source.selectors!.image ? card.find(source.selectors!.image).first() : null;
    const metaEl = source.selectors!.meta ? card.find(source.selectors!.meta).first() : null;
    const offer = offerFrom(source, baseUrl, {
      title: titleEl.attr("title") || titleEl.text() || linkEl.attr("title") || linkEl.text(),
      price: priceEl.attr("content") || priceEl.attr("data-price") || priceEl.text(),
      url: linkEl.attr("href"),
      image: imageEl?.attr("src") || imageEl?.attr("data-src") || imageEl?.attr("data-lazy-src") || imageEl?.attr("srcset")?.split(" ")[0],
      meta: metaEl?.text(),
      externalId: card.attr("data-id") || card.attr("data-product-id") || undefined,
    });
    if (offer) result.push(offer);
  });
  return result;
}

function valueAt(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}
function shallowPrice(obj: Record<string, unknown>): unknown {
  const direct = valueAt(obj, ["price", "currentPrice", "finalPrice", "priceValue", "lowPrice", "amount", "value"]);
  if (direct !== undefined) return direct;
  const offers = obj.offers;
  if (offers && typeof offers === "object" && !Array.isArray(offers)) return shallowPrice(offers as Record<string, unknown>);
  const ps = obj.priceSpecification;
  if (ps && typeof ps === "object" && !Array.isArray(ps)) return shallowPrice(ps as Record<string, unknown>);
  return undefined;
}
function shallowUrl(obj: Record<string, unknown>): string | undefined {
  const value = valueAt(obj, ["url", "href", "link", "canonicalUrl", "productUrl"]);
  if (typeof value === "string") return value;
  const offers = obj.offers;
  if (offers && typeof offers === "object" && !Array.isArray(offers)) return shallowUrl(offers as Record<string, unknown>);
  return undefined;
}
function parseJsonCandidates(html: string, source: LiveSource, baseUrl: string): Offer[] {
  const $ = cheerio.load(html);
  const results: Offer[] = [];
  const scripts = $('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]').toArray().slice(0, 40);
  let visited = 0;
  const seenObjects = new Set<object>();
  function visit(node: unknown, depth = 0) {
    if (visited++ > 22000 || depth > 14 || node === null || node === undefined) return;
    if (Array.isArray(node)) { for (const item of node.slice(0, 300)) visit(item, depth + 1); return; }
    if (typeof node !== "object") return;
    if (seenObjects.has(node as object)) return; seenObjects.add(node as object);
    const obj = node as Record<string, unknown>;
    const name = valueAt(obj, ["name", "title", "productName", "displayName"]);
    const price = shallowPrice(obj);
    const url = shallowUrl(obj);
    if (typeof name === "string" && price !== undefined && url) {
      const aggregate = aggregateRatingFrom(obj);
      const offersObj = objectValue(obj.offers) || obj;
      const seller = objectValue(offersObj.seller) || objectValue(obj.seller) || {};
      const sellerAggregate = aggregateRatingFrom(seller);
      const offer = offerFrom(source, baseUrl, {
        title: name, price, url,
        image: valueAt(obj, ["image", "imageUrl", "photo", "thumbnail", "picture"]),
        externalId: String(valueAt(obj, ["sku", "id", "productId", "externalId"]) || "") || undefined,
        productRating: aggregate.rating,
        reviewCount: aggregate.count,
        reviewSnippets: reviewSnippetsFrom(obj),
        sellerName: valueAt(seller, ["name", "sellerName", "storeName"]),
        sellerRating: sellerAggregate.rating,
        sellerReviewCount: sellerAggregate.count,
        sellerSince: valueAt(seller, ["foundingDate", "memberSince", "createdAt"]),
        verifiedSeller: valueAt(seller, ["verified", "isVerified", "verifiedSeller"]),
        availability: availabilityLabel(valueAt(offersObj, ["availability", "stockStatus"])),
        delivery: shippingLabel(valueAt(offersObj, ["shippingDetails", "shipping"])),
        returnPolicy: returnPolicyLabel(valueAt(offersObj, ["hasMerchantReturnPolicy", "merchantReturnPolicy"])),
        sku: valueAt(obj, ["sku", "mpn", "model", "productId"]),
        color: valueAt(obj, ["color"]),
        regionVersion: valueAt(obj, ["region", "countryOfOrigin"]),
      });
      if (offer) results.push(offer);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (["breadcrumbs","analytics","tracking","translations","description","html"].includes(key)) continue;
      if (typeof value === "object" && value !== null) visit(value, depth + 1);
    }
  }
  for (const el of scripts) {
    const text = $(el).html() || "";
    if (!text || text.length > 7_000_000) continue;
    try { visit(JSON.parse(text)); } catch {}
  }
  return results;
}

// Fallback parser for stores whose class names change frequently. It never trusts the result by itself:
// every candidate still has to pass evaluateTitleMatch() before it reaches the user.
function parseGenericAnchors(html: string, source: LiveSource, baseUrl: string): Offer[] {
  const $ = cheerio.load(html);
  const results: Offer[] = [];
  $('a[href]').slice(0, 700).each((_, element) => {
    const link = $(element);
    const title = cleanText(link.attr("title") || link.text());
    if (title.length < 4 || title.length > 220) return;
    const container = link.closest('article, li, [class*="product"], [class*="card"], [class*="item"]').first();
    const context = cleanText((container.length ? container : link.parent()).text()).slice(0, 900);
    const price = parsePrice(context);
    if (!price) return;
    const image = (container.length ? container : link.parent()).find('img').first();
    const offer = offerFrom(source, baseUrl, {
      title,
      price,
      url: link.attr("href"),
      image: image.attr("src") || image.attr("data-src") || image.attr("data-lazy-src"),
    });
    if (offer) results.push(offer);
  });
  return results;
}

function dedupeOffers(offers: Offer[], query: string, max = 10) {
  const out: Offer[] = []; const keys = new Set<string>();
  for (const offer of offers) {
    if (!offer.title || !usefulTitle(offer.title, query)) continue;
    const match = evaluateTitleMatch(query, offer.title);
    if (!match.reliable) continue;
    const normalizedUrl = (offer.url || "").replace(/[?#].*$/, "");
    const normalizedTitle = titleTokens(offer.title).slice(0, 16).join(" ");
    const key = `${offer.marketplace}|${normalizedUrl || normalizedTitle}|${offer.price}`;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ ...offer, matchConfidence: Math.round(match.score * 100), matchConflicts: match.conflicts });
  }
  return out
    .sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0) || a.price - b.price)
    .slice(0, max);
}

type TimedPage = { response: Response; body: string };

// Keep the AbortController alive until the response body is consumed.
// In v5.0.1 the timer was cleared as soon as headers arrived, so response.text()
// could still hang long enough to exhaust the whole /api/search request.
async function fetchPageWithTimeout(url: string, timeoutMs: number): Promise<TimedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "uk-UA,uk;q=0.9,en;q=0.6",
        "pragma": "no-cache",
        "cache-control": "no-cache",
      },
    });
    const body = response.ok ? await response.text() : "";
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(source: LiveSource, query: string) { return `${source.id}::${query.trim().toLowerCase()}`; }
function readCache(source: LiveSource, query: string, phase: RouterPhase): SourceResult | null {
  const key = cacheKey(source, query);
  const item = sourceCache.get(key);
  if (!item || item.expiresAt < Date.now()) { if (item) sourceCache.delete(key); return null; }
  return {
    offers: item.value.offers,
    status: decorateRouterStatus(source, {
      ...item.value.status,
      durationMs: 0,
      cached: true,
      message: item.value.status.message || "кеш останньої перевірки",
    }, phase),
  };
}
function writeCache(source: LiveSource, query: string, value: SourceResult, phase: RouterPhase) {
  value.status = recordAndDecorateRouterStatus(source, value.status, phase);
  // Successful cards can be reused for a few minutes, but a transient timeout must
  // never poison the next user search for the same product.
  const configuredOkTtl = Math.max(30_000, Math.min(Number(process.env.SMARTBUY_SOURCE_CACHE_MS || 240_000), 900_000));
  const ttlMs = value.status.state === "ok"
    ? configuredOkTtl
    : value.status.state === "empty"
      ? Math.min(configuredOkTtl, 75_000)
      : value.status.state === "blocked"
        ? 45_000
        : value.status.state === "timeout" || value.status.state === "error"
          ? 12_000
          : 5_000;
  sourceCache.set(cacheKey(source, query), { expiresAt: Date.now() + ttlMs, value });
  if (sourceCache.size > 160) {
    const first = sourceCache.keys().next().value as string | undefined;
    if (first) sourceCache.delete(first);
  }
}

async function enrichPriorityOffer(source: LiveSource, offer: Offer, timeoutOverrideMs?: number): Promise<Offer> {
  if (!offer.url || process.env.SMARTBUY_SELLER_ENRICH_ENABLED === "false") return offer;
  try {
    const configured = Math.max(700, Math.min(Number(process.env.SMARTBUY_SELLER_ENRICH_TIMEOUT_MS || 1800), 3500));
    const effectiveTimeout = Math.max(500, Math.min(timeoutOverrideMs ?? configured, configured));
    const { response, body: html } = await fetchPageWithTimeout(offer.url, effectiveTimeout);
    if (!response.ok) return offer;
    if (BLOCK_PATTERNS.test(html.slice(0, 160_000))) return offer;
    const structured = parseJsonCandidates(html, source, response.url || offer.url)
      .filter(item => item.title && evaluateTitleMatch(offer.title || "", item.title).score >= 0.72)
      .sort((a, b) => (b.sellerReviewCount || 0) - (a.sellerReviewCount || 0) || (b.productReviewCount || 0) - (a.productReviewCount || 0));
    let enriched = structured[0] ? mergeDuplicateOffer(offer, structured[0]) : offer;
    const $ = cheerio.load(html);
    const body = cleanText($("body").text()).slice(0, 80_000);
    const sellerSince = body.match(/(?:на olx з|на сайті з|продавець з|member since|seller since)\s*([^|•·]{3,50})/i)?.[1];
    const sellerRating = body.match(/(?:рейтинг продавця|seller rating)\s*[:—-]?\s*([0-5](?:[.,]\d)?)/i)?.[1];
    const sellerReviews = body.match(/(?:відгук(?:ів|и)? про продавця|seller reviews?)\s*[:—-]?\s*([0-9\s]+)/i)?.[1];
    const returnMatch = body.match(/(?:повернення|return(?:s)?)(?: товару)?\s*[:—-]?\s*([^|•·]{3,100})/i)?.[1];
    const deliveryMatch = body.match(/(OLX Доставка|Нова Пошта|Укрпошта|самовивіз|післяплата|оплата при отриманні)/i)?.[1];
    return {
      ...enriched,
      sellerSince: enriched.sellerSince || cleanText(sellerSince),
      sellerRating: enriched.sellerRating || parseRating(sellerRating),
      sellerReviewCount: enriched.sellerReviewCount || parseCount(sellerReviews),
      returnPolicy: enriched.returnPolicy || cleanText(returnMatch),
      delivery: enriched.delivery && !/(уточн|дивись)/i.test(enriched.delivery) ? enriched.delivery : (deliveryMatch || enriched.delivery),
    };
  } catch { return offer; }
}

async function enrichPriorityOffers(source: LiveSource, offers: Offer[], budgetMs?: number) {
  // Deeper page enrichment is intentionally small: it improves seller signals for the most
  // useful OLX/Rozetka results without multiplying Vercel latency for every marketplace card.
  if (!/^(olx|rozetka)$/i.test(source.id)) return offers;
  const limit = Math.max(0, Math.min(Number(process.env.SMARTBUY_SELLER_ENRICH_LIMIT || 2), 4, offers.length));
  const perOfferTimeout = budgetMs ? Math.max(500, Math.min(budgetMs, 1800)) : undefined;
  const head = await Promise.all(offers.slice(0, limit).map(offer => enrichPriorityOffer(source, offer, perOfferTimeout)));
  return [...head, ...offers.slice(limit)];
}

export async function searchSource(source: LiveSource, query: string, phase: RouterPhase = "primary", options: LiveSearchOptions = {}): Promise<SourceResult> {
  const cached = readCache(source, query, phase);
  if (cached) return cached;

  const started = Date.now();
  const stableTimeout = Math.max(1600, Math.min(Number(process.env.SMARTBUY_SOURCE_TIMEOUT_MS || 3600), 7000));
  const probeTimeout = Math.max(1000, Math.min(Number(process.env.SMARTBUY_PROBE_TIMEOUT_MS || 2200), 4500));
  const timeoutMs = source.tier === "stable" ? stableTimeout : probeTimeout;
  const prioritySource = /^(olx|rozetka)$/i.test(source.id);
  const configuredBudget = prioritySource
    ? Number(process.env.SMARTBUY_PRIORITY_SOURCE_TOTAL_TIMEOUT_MS || 6200)
    : source.tier === "stable"
      ? Number(process.env.SMARTBUY_SOURCE_TOTAL_TIMEOUT_MS || 5600)
      : Number(process.env.SMARTBUY_PROBE_TOTAL_TIMEOUT_MS || 3600);
  const phaseFactor = phase === "expanded" ? 0.82 : 1;
  const outerRemaining = options.deadlineAt ? Math.max(0, options.deadlineAt - started) : Number.POSITIVE_INFINITY;
  if (outerRemaining <= 450) {
    return { offers: [], status: decorateRouterStatus(source, {
      id: source.id, name: source.name, state: "not-run", offerCount: 0, durationMs: 0,
      message: "загальний бюджет пошуку вичерпано; повернено вже знайдені результати", tier: source.tier,
    }, phase) };
  }
  const sourceBudgetMs = Math.max(450, Math.min(Math.round(configuredBudget * phaseFactor), 8000, Number.isFinite(outerRemaining) ? Math.max(450, outerRemaining - 120) : 8000));
  const deadline = Math.min(started + sourceBudgetMs, options.deadlineAt || Number.POSITIVE_INFINITY);
  const remainingBudget = () => Math.max(0, deadline - Date.now());
  const maxAttempts = source.tier === "stable" || prioritySource ? 2 : 1;
  const variants = expandSearchQuery(query, source.id);
  const variantLimit = Math.max(1, Math.min(Number(process.env.SMARTBUY_MAX_QUERY_VARIANTS_PER_SOURCE || (prioritySource ? 3 : 2)), 4));
  const planned = (variants.length ? variants : [{ query, kind: "exact" as const, reason: "точний запит" }]).slice(0, variantLimit);
  let lastMessage = "невідома помилка";
  let lastState: SourceSearchStatus["state"] = "empty";
  let networkAttempts = 0;
  let variantsTried = 0;

  variantLoop: for (let variantIndex = 0; variantIndex < planned.length; variantIndex++) {
    if (remainingBudget() < 500) { lastState = "timeout"; lastMessage = `ліміт джерела ${sourceBudgetMs} мс`; break; }
    const variant = planned[variantIndex];
    variantsTried += 1;
    const urls = [...new Set((source.buildUrls ? source.buildUrls(variant.query) : [source.buildUrl(variant.query)]).filter(Boolean))];

    for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
      if (remainingBudget() < 500) { lastState = "timeout"; lastMessage = `ліміт джерела ${sourceBudgetMs} мс`; break variantLoop; }
      const url = urls[urlIndex];
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (remainingBudget() < 500) { lastState = "timeout"; lastMessage = `ліміт джерела ${sourceBudgetMs} мс`; break variantLoop; }
        networkAttempts += 1;
        try {
          const requestTimeout = Math.max(350, Math.min(timeoutMs, remainingBudget()));
          const { response, body: html } = await fetchPageWithTimeout(url, requestTimeout);
          const durationMs = Date.now() - started;
          if (response.status === 403 || response.status === 401 || response.status === 429) {
            lastState = "blocked"; lastMessage = `HTTP ${response.status}`;
            // OLX/Rozetka expose more than one public search URL; try the alternative before reporting blocked.
            break;
          }
          if (!response.ok) {
            lastState = "error"; lastMessage = `HTTP ${response.status}`;
            if (response.status >= 500 && attempt < maxAttempts) continue;
            break;
          }
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("json")) {
            lastState = "empty"; lastMessage = "не HTML/JSON"; break;
          }
          if (BLOCK_PATTERNS.test(html.slice(0, 180_000))) {
            lastState = "blocked"; lastMessage = "антибот / captcha"; break;
          }
          const parsed = [
            ...parseCards(html, source, response.url || url),
            ...parseJsonCandidates(html, source, response.url || url),
            ...parseGenericAnchors(html, source, response.url || url),
          ];
          let offers = dedupeOffers(parsed, query, Number(process.env.SMARTBUY_MAX_PER_SOURCE || 12));
          if (offers.length) {
            const enrichBudget = Math.max(0, remainingBudget() - 200);
            if (enrichBudget >= 650) offers = await enrichPriorityOffers(source, offers, enrichBudget);
            const expanded = variantIndex > 0;
            const result: SourceResult = {
              offers,
              status: {
                id: source.id, name: source.name, state: "ok", offerCount: offers.length, durationMs: Date.now() - started,
                message: [expanded ? `знайдено через варіант запиту: ${variant.query}` : "", urlIndex > 0 ? "резервний public URL" : ""].filter(Boolean).join(" · ") || undefined,
                tier: source.tier, attempts: networkAttempts,
                queryUsed: variant.query, queryVariantsTried: variantsTried, queryExpanded: expanded,
              }
            };
            writeCache(source, query, result, phase); return result;
          }
          lastState = "empty"; lastMessage = "сторінка відповіла, але релевантні картки не розпізнані";
          break;
        } catch (error) {
          lastMessage = error instanceof Error ? error.message : "невідома помилка";
          lastState = /abort|timeout/i.test(lastMessage) ? "timeout" : "error";
          if (attempt < maxAttempts) continue;
          break;
        }
      }
    }
  }

  const durationMs = Date.now() - started;
  const result: SourceResult = { offers: [], status: {
    id: source.id, name: source.name, state: lastState, offerCount: 0, durationMs,
    message: variantsTried > 1 && lastState === "empty" ? `перевірено ${variantsTried} точні варіанти запиту · карток не знайдено` : lastMessage,
    tier: source.tier, attempts: networkAttempts,
    queryUsed: planned[Math.max(0, variantsTried - 1)]?.query || query,
    queryVariantsTried: variantsTried,
    queryExpanded: variantsTried > 1,
  } };
  writeCache(source, query, result, phase);
  return result;
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>, deadlineAt?: number): Promise<R[]> {
  const results = new Array<R | undefined>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (true) {
      if (deadlineAt && Date.now() >= deadlineAt - 300) return;
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]);
      } catch {
        // One connector must never reject the whole market wave. searchSource normally
        // returns an error status itself; this guard handles unexpected parser/runtime faults.
      }
    }
  });
  await Promise.all(runners);
  return results.filter((item): item is R => item !== undefined);
}

function routerStatus(source: LiveSource, phase: RouterPhase, message: string): SourceSearchStatus {
  return decorateRouterStatus(source, {
    id: source.id,
    name: source.name,
    state: "not-run",
    offerCount: 0,
    durationMs: 0,
    message,
    tier: source.tier,
  }, phase);
}

function policyDisabledSourceIds() {
  return new Set(String(process.env.SMARTBUY_DISABLED_SOURCES || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean));
}

export async function searchUkraineLive(query: string, mode: LiveMode = "stores", options: LiveSearchOptions = {}) {
  const allRelevant = automaticLiveSources.filter(source => mode === "all" || (mode === "private" ? source.sellerType === "private" : source.sellerType === "store"));
  const disabledIds = policyDisabledSourceIds();
  const relevant = allRelevant.filter(source => !disabledIds.has(source.id.toLowerCase()));
  const started = Date.now();
  const defaultBudget = mode === "private" ? 9_000 : mode === "all" ? 18_000 : 16_000;
  const configuredBudget = Math.max(5_000, Math.min(Number(process.env.SMARTBUY_UKRAINE_TOTAL_TIMEOUT_MS || defaultBudget), 22_000));
  const globalDeadline = Math.min(started + configuredBudget, options.deadlineAt || Number.POSITIVE_INFINITY);
  const remainingGlobal = () => Math.max(0, globalDeadline - Date.now());
  if (process.env.SMARTBUY_LIVE_FETCH_ENABLED === "false") {
    return {
      offers: [] as Offer[],
      statuses: allRelevant.map(source => routerStatus(source, "not-selected", disabledIds.has(source.id.toLowerCase()) ? "вимкнено політикою джерел" : "live fetch вимкнено")),
      partial: false,
    };
  }

  const stable = rankSources(relevant.filter(source => source.tier === "stable"), query);
  const allProbes = rankSources(relevant.filter(source => source.tier === "probe"), query);
  const probesEnabled = process.env.SMARTBUY_EXPERIMENTAL_SOURCES !== "false";
  const defaultProbeLimit = mode === "private" ? 2 : mode === "all" ? 10 : 9;
  const probeLimit = Math.max(0, Math.min(Number(process.env.SMARTBUY_MAX_PROBE_SOURCES || defaultProbeLimit), allProbes.length));
  const coolingProbes = probesEnabled ? allProbes.filter(source => isCoolingDown(source)) : [];
  const eligibleProbes = probesEnabled ? allProbes.filter(source => !isCoolingDown(source)) : [];

  const configuredPrimary = Number(process.env.SMARTBUY_ROUTER_PRIMARY_PROBES || (mode === "private" ? 2 : mode === "all" ? 4 : 3));
  const primaryProbeBudget = Math.max(0, Math.min(configuredPrimary, probeLimit));

  let primaryProbes: LiveSource[] = [];
  if (mode === "private") {
    primaryProbes = eligibleProbes.slice(0, primaryProbeBudget);
  } else if (mode === "all") {
    const privateFirst = eligibleProbes.filter(source => source.sellerType === "private").slice(0, 2);
    const stores = eligibleProbes.filter(source => source.sellerType === "store");
    const remainingSlots = Math.max(0, primaryProbeBudget - privateFirst.length);
    primaryProbes = [...privateFirst, ...stores.slice(0, remainingSlots)];
  } else {
    primaryProbes = eligibleProbes.filter(source => source.sellerType === "store").slice(0, primaryProbeBudget);
  }

  const primarySources = [...stable, ...primaryProbes];
  const concurrency = Math.max(1, Math.min(Number(process.env.SMARTBUY_SOURCE_CONCURRENCY || 4), 6));
  const primaryResults = await runPool<LiveSource, SourceResult>(primarySources, concurrency, source => searchSource(source, query, "primary", { deadlineAt: globalDeadline }), globalDeadline);
  const primaryOfferCount = primaryResults.reduce((sum, item) => sum + item.offers.length, 0);

  const defaultTarget = mode === "private" ? 4 : 8;
  const targetOffers = Math.max(1, Math.min(Number(process.env.SMARTBUY_ROUTER_TARGET_OFFERS || defaultTarget), 30));
  const remainingProbeBudget = Math.max(0, probeLimit - primaryProbes.length);
  const usedProbeIds = new Set(primaryProbes.map(source => source.id));
  const expansionCandidates = eligibleProbes.filter(source => !usedProbeIds.has(source.id));
  const shouldExpand = probesEnabled && primaryOfferCount < targetOffers && remainingProbeBudget > 0 && remainingGlobal() > 1_400;
  // Do not start a second wave that cannot finish inside the request budget. One batch
  // is enough near the deadline; extra connectors remain available as direct links.
  const maxExpansionByTime = remainingGlobal() > 6_500 ? remainingProbeBudget : Math.min(remainingProbeBudget, concurrency);
  const expansionSources = shouldExpand ? expansionCandidates.slice(0, maxExpansionByTime) : [];
  const expandedResults = expansionSources.length
    ? await runPool<LiveSource, SourceResult>(expansionSources, concurrency, source => searchSource(source, query, "expanded", { deadlineAt: globalDeadline }), globalDeadline)
    : [];

  const settled = [...primaryResults, ...expandedResults];
  const byId = new Map(settled.map(item => [item.status.id, item]));
  const coolingIds = new Set(coolingProbes.map(source => source.id));
  const eligibleIds = new Set(eligibleProbes.map(source => source.id));
  const enoughAfterPrimary = primaryOfferCount >= targetOffers;
  const finalOfferCount = settled.reduce((sum, item) => sum + item.offers.length, 0);
  const attemptedIds = new Set(settled.map(item => item.status.id));
  const unrunEligible = eligibleProbes.some(source => !attemptedIds.has(source.id));
  const budgetExhausted = remainingGlobal() <= 700 && unrunEligible && finalOfferCount < targetOffers;

  const statuses: SourceSearchStatus[] = allRelevant.map(source => {
    if (disabledIds.has(source.id.toLowerCase())) return routerStatus(source, "not-selected", "вимкнено політикою джерел");
    const found = byId.get(source.id);
    if (found) return found.status;
    if (!probesEnabled && source.tier === "probe") return routerStatus(source, "not-selected", "пробні джерела вимкнені");
    if (coolingIds.has(source.id)) return routerStatus(source, "cooldown", routerCooldownMessage(source) || "адаптивна пауза після нестабільних відповідей");
    if (source.tier === "probe" && eligibleIds.has(source.id)) {
      if (budgetExhausted) return routerStatus(source, "not-selected", "загальний бюджет пошуку завершився; часткові результати вже повернено");
      if (enoughAfterPrimary) return routerStatus(source, "not-selected", `адаптивний роутер: уже є ${primaryOfferCount} релевантних пропозицій`);
      if (probeLimit <= primaryProbes.length + expansionSources.length) return routerStatus(source, "not-selected", "не потрапило в ліміт пробної хвилі");
      return routerStatus(source, "not-selected", "не знадобилось у цій хвилі");
    }
    return routerStatus(source, "not-selected", "не запускалось");
  });

  return { offers: settled.flatMap(item => item.offers), statuses, partial: budgetExhausted };
}


function normalizedOfferUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value.split(/[?#]/)[0].replace(/\/$/, "").toLowerCase();
  }
}

function offerFingerprint(offer: Offer) {
  const source = (offer.marketplace || offer.source || offer.store || "source").toLowerCase().trim();
  const title = normalizedTitle(offer.title || "");
  // Keep strong model identity in the fingerprint so a store page that reuses one URL
  // for multiple memory/variant options does not collapse those options into one offer.
  const identity = productIdentityKey(offer.title || "") || title;
  if (offer.externalId) return `${source}|id:${String(offer.externalId).trim().toLowerCase()}|${identity}`;
  const url = normalizedOfferUrl(offer.url);
  if (url) return `${source}|url:${url}|${identity}`;
  const seller = (offer.sellerName || offer.store || "seller").toLowerCase().replace(/\s+/g, " ").trim();
  return `${source}|fallback:${seller}|${identity}|${Math.round(offer.price)}|${offer.condition}`;
}

function mergeDuplicateOffer(base: Offer, next: Offer): Offer {
  const preferred = (next.matchConfidence || 0) > (base.matchConfidence || 0) ? next : base;
  const secondary = preferred === next ? base : next;
  const reviewSnippets = [...new Set([...(preferred.reviewSnippets || []), ...(secondary.reviewSnippets || [])])].slice(0, 8);
  return {
    ...secondary,
    ...preferred,
    price: Math.min(base.price, next.price),
    title: preferred.title || secondary.title,
    url: preferred.url || secondary.url,
    imageUrl: preferred.imageUrl || secondary.imageUrl,
    productRating: preferred.productRating || secondary.productRating,
    productReviewCount: Math.max(preferred.productReviewCount || 0, secondary.productReviewCount || 0) || undefined,
    reviewSnippets: reviewSnippets.length ? reviewSnippets : undefined,
    sellerName: preferred.sellerName || secondary.sellerName,
    sellerRating: preferred.sellerRating || secondary.sellerRating,
    sellerReviewCount: Math.max(preferred.sellerReviewCount || 0, secondary.sellerReviewCount || 0) || undefined,
    sellerSince: preferred.sellerSince || secondary.sellerSince,
    returnPolicy: preferred.returnPolicy || secondary.returnPolicy,
    availability: preferred.availability || secondary.availability,
    shippingCost: preferred.shippingCost ?? secondary.shippingCost,
    sku: preferred.sku || secondary.sku,
    color: preferred.color || secondary.color,
    regionVersion: preferred.regionVersion || secondary.regionVersion,
    originalPrice: preferred.originalPrice ?? secondary.originalPrice,
    originalCurrency: preferred.originalCurrency || secondary.originalCurrency,
    trusted: Boolean(base.trusted || next.trusted),
    verifiedSeller: Boolean(base.verifiedSeller || next.verifiedSeller),
    matchConfidence: Math.max(base.matchConfidence || 0, next.matchConfidence || 0) || undefined,
    matchConflicts: [...new Set([...(base.matchConflicts || []), ...(next.matchConflicts || [])])],
  };
}

export function dedupeLiveOffers(offers: Offer[]) {
  const map = new Map<string, Offer>();
  for (const offer of offers) {
    const key = offerFingerprint(offer);
    const current = map.get(key);
    map.set(key, current ? mergeDuplicateOffer(current, offer) : offer);
  }
  return { offers: [...map.values()], removed: Math.max(0, offers.length - map.size) };
}

function normalizedTitle(title: string) { return titleTokens(title).slice(0, 14).join(" "); }
function groupSimilarity(a: string, b: string) {
  const ab = evaluateTitleMatch(normalizedTitle(a), normalizedTitle(b));
  const ba = evaluateTitleMatch(normalizedTitle(b), normalizedTitle(a));
  return { score: Math.min(ab.score, ba.score), reliable: ab.reliable && ba.reliable };
}
function productEmoji(category: string) {
  if (category === "Смартфони") return "📱";
  if (category === "Ноутбуки") return "💻";
  if (category === "Телевізори") return "📺";
  if (category === "Інструменти") return "🛠️";
  if (category === "Для дому") return "🏠";
  return "🛍️";
}
function guessCategory(text: string) {
  const t = text.toLowerCase();
  if (/iphone|samsung galaxy|pixel|смартф|телефон/.test(t)) return "Смартфони";
  if (/ноутбук|laptop|macbook|lenovo loq|asus tuf|acer nitro/.test(t)) return "Ноутбуки";
  if (/телевіз|tv\b|bravia|oled|qled/.test(t)) return "Телевізори";
  if (/дриль|шуруп|makita|bosch|dewalt|інструмент/.test(t)) return "Інструменти";
  if (/пилосос|roborock|xiaomi vacuum|пральн|холодиль|кавовар/.test(t)) return "Для дому";
  return "Інше";
}
function median(values: number[]) { const v = [...values].sort((a,b)=>a-b); const m=Math.floor(v.length/2); return v.length%2?v[m]:Math.round((v[m-1]+v[m])/2); }
function canonicalTitle(offers: Offer[], query = "") {
  const titles = offers.map(o => o.title || "").filter(Boolean);
  if (!titles.length) return "Товар";
  if (!query) return [...titles].sort((a,b)=>a.length-b.length)[0];
  return [...titles].sort((a, b) => {
    const am = evaluateTitleMatch(query, a);
    const bm = evaluateTitleMatch(query, b);
    return bm.score - am.score || a.length - b.length;
  })[0];
}
function makeId(title: string) { return `${slug(title).slice(0,60) || "product"}-${Math.abs(hash(title)).toString(36)}`; }

export function groupLiveOffers(offers: Offer[], query: string, alreadyDeduped = false): Product[] {
  const unique = alreadyDeduped ? offers : dedupeLiveOffers(offers).offers;
  const groups: Offer[][] = [];
  const ordered = [...unique].sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0) || (a.title || "").localeCompare(b.title || ""));

  function compatibleWithGroup(title: string, group: Offer[]) {
    const representative = canonicalTitle(group, query);
    const candidateIdentity = productIdentityKey(title);
    const representativeIdentity = productIdentityKey(representative);
    if (candidateIdentity && representativeIdentity && candidateIdentity !== representativeIdentity) return { ok: false, score: 0 };
    if (candidateIdentity && representativeIdentity && candidateIdentity === representativeIdentity) {
      const strictVariant = evaluateTitleMatch(title, representative);
      if (strictVariant.conflicts.some(conflict => ["color", "sku", "region"].includes(conflict))) return { ok: false, score: 0 };
      return { ok: true, score: 1 };
    }

    const main = groupSimilarity(title, representative);
    if (!main.reliable) return { ok: false, score: main.score };

    // Guard against a vague representative accidentally bridging two different strong models.
    const sample = group.slice(0, 4);
    let score = main.score;
    for (const member of sample) {
      const memberTitle = member.title || "";
      const memberIdentity = productIdentityKey(memberTitle);
      if (candidateIdentity && memberIdentity && candidateIdentity !== memberIdentity) return { ok: false, score: 0 };
      const pair = evaluateTitleMatch(title, memberTitle);
      if (pair.conflicts.some(conflict => ["brand", "model", "storage", "ram", "variant", "generation", "color", "sku", "region", "accessory", "counterfeit"].includes(conflict))) {
        return { ok: false, score: 0 };
      }
      if (pair.reliable) score = Math.min(score, pair.score);
    }
    return { ok: score >= 0.72, score };
  }

  for (const offer of ordered) {
    const title = offer.title || "";
    let bestIndex = -1, bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
      const compatibility = compatibleWithGroup(title, groups[i]);
      if (compatibility.ok && compatibility.score > bestScore) {
        bestScore = compatibility.score;
        bestIndex = i;
        if (bestScore >= 0.999) break;
      }
    }
    if (bestIndex >= 0 && bestScore >= 0.72) groups[bestIndex].push(offer); else groups.push([offer]);
  }

  return groups.map(group => {
    const byPrice = [...group].sort((a, b) => a.price - b.price);
    const rawPrices = byPrice.map(o => o.price);
    const rawMedian = median(rawPrices);
    const canDetectOutlier = rawPrices.length >= 3 && rawMedian > 0;
    const flagged = byPrice.map(offer => ({
      ...offer,
      priceAnomaly: canDetectOutlier && (offer.price < rawMedian * 0.55 || offer.price > rawMedian * 2.25),
    }));
    const sane = flagged.filter(o => !o.priceAnomaly).sort((a, b) => a.price - b.price);
    const anomalies = flagged.filter(o => o.priceAnomaly).sort((a, b) => a.price - b.price);
    const sorted = [...sane, ...anomalies];
    const title = canonicalTitle(sane.length ? sane : flagged, query);
    const identity = productIdentityMeta(title);
    const prices = (sane.length ? sane : flagged).map(o => o.price);
    const sources = new Set(sorted.map(o => o.marketplace));
    const newOffers = sorted.filter(o => o.condition === "new" && !o.priceAnomaly);
    const usedOffers = sorted.filter(o => o.condition !== "new" && !o.priceAnomaly);
    const bestNew = newOffers[0]?.price;
    const bestUsed = usedOffers[0]?.price;
    const med = median(prices);
    const category = guessCategory(`${query} ${title}`);
    const saving = bestNew && bestUsed && bestUsed < bestNew ? Math.round((1 - bestUsed / bestNew) * 100) : 0;
    const match = evaluateTitleMatch(query, title);
    const anomalyCount = anomalies.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = prices.length > 1 && med > 0 ? Math.round(((maxPrice - minPrice) / med) * 100) : 0;
    const bestOffer = (sane.length ? sane : flagged)[0];
    const bestSource = bestOffer?.marketplace || "джерело";
    const averageConfidence = Math.round(sorted.reduce((sum, offer) => sum + (offer.matchConfidence || 0), 0) / Math.max(1, sorted.length));

    const uniqueTitles = [...new Set(sorted.map(item => (item.title || "").trim()).filter(Boolean))];
    const groupScores = uniqueTitles.map(candidate => evaluateTitleMatch(title, candidate).score).filter(Number.isFinite);
    let groupingConfidence = groupScores.length ? Math.round((groupScores.reduce((sum, score) => sum + score, 0) / groupScores.length) * 100) : 100;
    if (identity.key && uniqueTitles.every(candidate => productIdentityKey(candidate) === identity.key)) groupingConfidence = Math.max(groupingConfidence, 96);
    groupingConfidence = Math.max(0, Math.min(100, groupingConfidence));
    const mergeSignals = identity.signals.length ? identity.signals : ["назва"];

    const highlights = [
      `${sorted.length} проп. · ${sources.size} джерел`,
      `збіг моделі ${Math.max(averageConfidence, Math.round(match.score * 100))}%`,
      uniqueTitles.length > 1 ? `об’єднано ${uniqueTitles.length} назв · ${groupingConfidence}%` : `групування ${groupingConfidence}%`,
      prices.length > 1 ? `діапазон ${minPrice.toLocaleString("uk-UA")}–${maxPrice.toLocaleString("uk-UA")} ₴` : `${prices[0].toLocaleString("uk-UA")} ₴`,
    ];

    let summary = saving
      ? `Найнижча підтверджена ціна — ${bestOffer.price.toLocaleString("uk-UA")} ₴ у ${bestSource}. Б/в стартує приблизно на ${saving}% дешевше за найнижчу нову пропозицію. Медіанна ціна — ${med.toLocaleString("uk-UA")} ₴.`
      : `Найнижча підтверджена ціна — ${bestOffer.price.toLocaleString("uk-UA")} ₴ у ${bestSource}. Медіанна ціна серед ${prices.length} релевантних пропозицій — ${med.toLocaleString("uk-UA")} ₴.`;
    if (uniqueTitles.length > 1) summary += ` SmartBuy об’єднав ${uniqueTitles.length} варіанти назви за сигналами: ${mergeSignals.join(", ")}.`;
    if (sources.size === 1) summary += " Поки є лише одне автоматичне джерело, тому висновок попередній.";
    else if (spread >= 20) summary += ` Розкид цін ${spread}%, тому варто звірити комплектацію та умови продавця.`;
    if (anomalyCount) summary += ` SmartBuy відсунув ${anomalyCount} підозріло дешев${anomalyCount === 1 ? "у/дорогу пропозицію" : "і/дорогі пропозиції"} з розрахунку найкращої ціни.`;

    const ratingBySource = new Map<string, { rating: number; count: number }>();
    for (const offer of sorted) {
      if (!offer.productRating) continue;
      const count = offer.productReviewCount || 0;
      const current = ratingBySource.get(offer.marketplace);
      if (!current || count > current.count) ratingBySource.set(offer.marketplace, { rating: offer.productRating, count });
    }
    const ratingEntries = [...ratingBySource.values()];
    const totalReviewCount = ratingEntries.reduce((sum, item) => sum + item.count, 0);
    const aggregateRating = ratingEntries.length
      ? Math.round((ratingEntries.reduce((sum, item) => sum + item.rating * (item.count || 1), 0) / ratingEntries.reduce((sum, item) => sum + (item.count || 1), 0)) * 10) / 10
      : 0;

    const cautions: string[] = [];
    if (usedOffers.length) cautions.push("Для приватних оголошень перевіряй стан товару, продавця та умови безпечної оплати.");
    if (anomalyCount) cautions.push(`${anomalyCount} цінов${anomalyCount === 1 ? "а аномалія" : "і аномалії"} не впливають на рекомендовану найнижчу ціну.`);
    if (groupingConfidence < 78) cautions.push("Групування назв має середню впевненість — перед покупкою звір точну модифікацію в кожній пропозиції.");

    return {
      id: makeId(identity.key || title), title, category,
      subtitle: `${sources.size} джерел · ${sorted.length} пропозицій`,
      rating: aggregateRating, reviewCount: totalReviewCount,
      image: productEmoji(category), imageUrl: sorted.find(o => o.imageUrl)?.imageUrl,
      bestPrice: bestOffer.price,
      score: Math.min(99, 70 + Math.min(sources.size, 5) * 4 + Math.round(match.score * 12) + Math.min(sorted.filter(o => o.trusted).length, 3) * 2),
      highlights,
      caution: cautions.length ? cautions.join(" ") : undefined,
      aiSummary: summary,
      offers: sorted,
      source: [...sources].slice(0, 3).join(" · ") + (sources.size > 3 ? ` +${sources.size - 3}` : ""),
      productUrl: bestOffer?.url,
      grouping: {
        identityKey: identity.key || undefined,
        canonicalLabel: identity.label,
        confidence: groupingConfidence,
        mergeSignals,
        uniqueTitleCount: uniqueTitles.length,
      },
    } satisfies Product;
  }).sort((a, b) => b.offers.length - a.offers.length || a.bestPrice - b.bestPrice);
}
