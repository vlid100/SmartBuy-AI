import { products as previewProducts } from "@/lib/mock-data";
import { getSourceLinks } from "@/lib/source-registry";
import type { MarketCoverage, MarketFilter, Offer, Product, SearchApiResponse } from "@/lib/types";

function offerMatchesFilter(offer: Offer, filter: MarketFilter) {
  switch (filter) {
    case "new": return offer.condition === "new";
    case "used": return offer.condition === "used" || offer.condition === "refurbished";
    case "stores": return offer.sellerType === "store";
    case "private": return offer.sellerType === "private";
    case "international": return offer.sellerType === "international";
    default: return true;
  }
}

function normalizeProduct(product: Product, offers: Offer[]): Product {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const bestPrice = sorted[0]?.price ?? product.bestPrice;
  const sourceNames = [...new Set(sorted.map(o => o.marketplace))];
  return {
    ...product,
    offers: sorted,
    bestPrice,
    source: sourceNames.slice(0, 3).join(" · ") + (sourceNames.length > 3 ? ` +${sourceNames.length - 3}` : ""),
    productUrl: sorted[0]?.url,
  };
}

function scoreTextMatch(product: Product, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = `${product.title} ${product.category} ${product.subtitle} ${product.highlights.join(" ")} ${product.aiSummary}`.toLowerCase();
  const hits = tokens.filter(t => haystack.includes(t)).length;
  return hits / tokens.length;
}

function filterProducts(items: Product[], query: string, category: string, maxPrice: number | undefined, marketFilter: MarketFilter) {
  return items
    .map(product => {
      const offers = product.offers.filter(o => offerMatchesFilter(o, marketFilter));
      return normalizeProduct(product, offers);
    })
    .filter(product => product.offers.length > 0)
    .filter(product => !category || product.category.toLowerCase() === category.toLowerCase())
    .filter(product => !maxPrice || product.bestPrice <= maxPrice)
    .map(product => ({ product, textScore: scoreTextMatch(product, query) }))
    .filter(x => !query.trim() || x.textScore >= 0.34)
    .sort((a, b) => b.textScore - a.textScore || b.product.score - a.product.score || a.product.bestPrice - b.product.bestPrice)
    .map(x => x.product);
}

function makeCoverage(products: Product[]): MarketCoverage {
  const offers = products.flatMap(p => p.offers);
  return {
    totalOffers: offers.length,
    storeOffers: offers.filter(o => o.sellerType === "store").length,
    privateOffers: offers.filter(o => o.sellerType === "private").length,
    newOffers: offers.filter(o => o.condition === "new").length,
    usedOffers: offers.filter(o => o.condition !== "new").length,
    sourceCount: new Set(offers.map(o => o.marketplace)).size,
  };
}

export async function searchProducts(
  query: string,
  category = "",
  maxPrice?: number,
  marketFilter: MarketFilter = "all"
): Promise<SearchApiResponse> {
  const results = filterProducts(previewProducts, query, category, maxPrice, marketFilter);
  const sourceScope = marketFilter === "international" ? "international" : "ukraine";
  return {
    query,
    count: results.length,
    results,
    mode: "market-preview",
    provider: "Україна: магазини + приватні оголошення",
    warning: "v0.3 вже шукає одним запитом по джерелах через прямі посилання. Об'єднані картки нижче поки демонструють структуру ринку; автоматичний імпорт цін підключатимемо джерело за джерелом без крихких скраперів.",
    coverage: makeCoverage(results),
    sourceLinks: getSourceLinks(query, sourceScope),
  };
}
