import { products as previewProducts } from "@/lib/mock-data";
import { getSourceLinks } from "@/lib/source-registry";
import { groupLiveOffers, searchUkraineLive } from "@/lib/live-market";
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
  const sourceNames = [...new Set(sorted.map(o => o.marketplace))];
  return { ...product, offers: sorted, bestPrice: sorted[0]?.price ?? product.bestPrice, source: sourceNames.slice(0, 3).join(" · ") + (sourceNames.length > 3 ? ` +${sourceNames.length - 3}` : ""), productUrl: sorted[0]?.url };
}

function scoreTextMatch(product: Product, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = `${product.title} ${product.category} ${product.subtitle} ${product.highlights.join(" ")} ${product.aiSummary}`.toLowerCase();
  return tokens.filter(t => haystack.includes(t)).length / tokens.length;
}

function filterProducts(items: Product[], query: string, category: string, maxPrice: number | undefined, marketFilter: MarketFilter, requireTextMatch = false) {
  return items.map(product => normalizeProduct(product, product.offers.filter(o => offerMatchesFilter(o, marketFilter))))
    .filter(product => product.offers.length > 0)
    .filter(product => !category || product.category.toLowerCase() === category.toLowerCase())
    .filter(product => !maxPrice || product.bestPrice <= maxPrice)
    .map(product => ({ product, textScore: scoreTextMatch(product, query) }))
    .filter(x => !requireTextMatch || !query.trim() || x.textScore >= 0.20)
    .sort((a, b) => b.product.offers.length - a.product.offers.length || b.textScore - a.textScore || a.product.bestPrice - b.product.bestPrice)
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

export async function searchProducts(query: string, category = "", maxPrice?: number, marketFilter: MarketFilter = "all"): Promise<SearchApiResponse> {
  const sourceScope = marketFilter === "international" ? "international" : "ukraine";
  const sourceLinks = getSourceLinks(query, sourceScope);

  if (marketFilter === "international") {
    return {
      query, count: 0, results: [], mode: "live", provider: "AliExpress · Temu · Amazon",
      warning: "Автоматичне міжнародне збирання ще не ввімкнене. Кнопки нижче відкривають реальний пошук на AliExpress, Temu та Amazon.",
      coverage: makeCoverage([]), sourceLinks,
    };
  }

  if (query.trim()) {
    const live = await searchUkraineLive(query.trim());
    const grouped = groupLiveOffers(live.offers, query.trim());
    const results = filterProducts(grouped, query, category, maxPrice, marketFilter, false);
    const ok = live.statuses.filter(s => s.state === "ok").length;
    const blocked = live.statuses.filter(s => s.state === "blocked").length;
    const reachable = live.statuses.filter(s => s.state === "ok" || s.state === "empty").length;
    let warning: string | undefined;
    if (!results.length) warning = "Автоматичний збір цього разу не повернув розпізнаних товарів. Частина сайтів може рендерити картки JavaScript-ом або блокувати серверні запити. Нижче залишені прямі кнопки пошуку — фальшиві ціни не підставляються.";
    else if (blocked) warning = `Реальні картки зібрані автоматично. ${blocked} джерел заблокували серверний запит, тому їхні результати можна відкрити прямою кнопкою.`;
    return {
      query, count: results.length, results, mode: "live",
      provider: `Live Market: ${ok}/${live.statuses.length} джерел дали картки · ${reachable}/${live.statuses.length} відповіли`,
      warning, coverage: makeCoverage(results), sourceLinks, sourceStatuses: live.statuses,
    };
  }

  const preview = filterProducts(previewProducts, query, category, maxPrice, marketFilter, true);
  return {
    query, count: preview.length, results: preview, mode: "market-preview",
    provider: "Україна: магазини + приватні оголошення",
    warning: "Введи конкретний товар у пошуку — тоді v0.4 запустить автоматичний live-збір. Без запиту показуються лише приклади структури.",
    coverage: makeCoverage(preview), sourceLinks,
  };
}
