import type { Offer, PricePoint, Product } from "./types";

export type FairPriceLevel = "great" | "fair" | "high" | "caution" | "unknown";

export type FairPricePosition = {
  level: FairPriceLevel;
  label: string;
  deltaPct: number | null;
  detail: string;
};

export type FairPriceInsight = {
  confidence: number;
  confidenceLabel: string;
  sampleCount: number;
  sourceCount: number;
  conditionScoped: boolean;
  conditionLabel: string;
  fairLow: number | null;
  fairMid: number | null;
  fairHigh: number | null;
  marketMin: number | null;
  marketMax: number | null;
  spreadPct: number | null;
  focusPrice: number | null;
  position: FairPricePosition;
  historyLow: number | null;
  historyMedian: number | null;
  historySamples: number;
  reasons: string[];
  caveats: string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values: number[], p: number) {
  const safe = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return null;
  if (safe.length === 1) return safe[0];
  const index = (safe.length - 1) * clamp(p, 0, 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return safe[lower];
  const weight = index - lower;
  return safe[lower] * (1 - weight) + safe[upper] * weight;
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function safeOffers(product: Product) {
  const candidates = product.offers.filter(offer => Number.isFinite(offer.price) && offer.price > 0 && !offer.priceAnomaly);
  const strongMatches = candidates.filter(offer => !offer.matchConfidence || offer.matchConfidence >= 88);
  return strongMatches.length >= 2 ? strongMatches : candidates;
}

function conditionName(condition?: Offer["condition"]) {
  if (condition === "new") return "нових";
  if (condition === "refurbished") return "відновлених";
  if (condition === "used") return "б/в";
  return "усіх";
}

function classifyPrice(price: number | null, low: number | null, mid: number | null, high: number | null, anomaly = false): FairPricePosition {
  if (!price || !low || !mid || !high) {
    return { level: "unknown", label: "Замало даних", deltaPct: null, detail: "Потрібно більше підтверджених цін для надійної оцінки." };
  }
  const deltaPct = Math.round(((price - mid) / mid) * 100);
  if (anomaly || price < low * 0.78) {
    return { level: "caution", label: "Підозріло низька", deltaPct, detail: "Ціна суттєво нижча за типовий діапазон — перевір модель, продавця, стан і комплектацію." };
  }
  if (price <= low) {
    return { level: "great", label: "Вигідніше ринку", deltaPct, detail: "Ціна на нижній межі або нижче типового ринкового діапазону." };
  }
  if (price <= high) {
    return { level: "fair", label: "У межах ринку", deltaPct, detail: "Ціна знаходиться всередині типового діапазону підтверджених пропозицій." };
  }
  if (price <= high * 1.08) {
    return { level: "high", label: "Трохи вище ринку", deltaPct, detail: "Ціна дещо вища за типовий діапазон; це може компенсуватися гарантією, доставкою або сервісом." };
  }
  return { level: "high", label: "Вище ринку", deltaPct, detail: "Ціна помітно вища за типовий діапазон для доступних підтверджених пропозицій." };
}


export function positionAgainstFairPrice(price: number, insight: FairPriceInsight, anomaly = false) {
  return classifyPrice(price, insight.fairLow, insight.fairMid, insight.fairHigh, anomaly);
}

export function buildFairPriceInsight(
  product: Product,
  focusOffer?: Offer | null,
  history: PricePoint[] = [],
): FairPriceInsight {
  const allSafe = safeOffers(product);
  const sameCondition = focusOffer ? allSafe.filter(offer => offer.condition === focusOffer.condition) : [];
  const scoped = sameCondition.length >= 2 ? sameCondition : allSafe;
  const conditionScoped = Boolean(focusOffer && sameCondition.length >= 2);
  const prices = scoped.map(offer => offer.price).filter(price => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  const sources = new Set(scoped.map(offer => offer.marketplace || offer.store).filter(Boolean));

  const fairMid = median(prices);
  let fairLow = percentile(prices, prices.length >= 4 ? 0.25 : 0.2);
  let fairHigh = percentile(prices, prices.length >= 4 ? 0.75 : 0.8);

  // A very tight sample can produce a visually meaningless interval. Keep a small
  // neutral band around the robust median without pretending we have extra data.
  if (fairMid && fairLow && fairHigh) {
    if (fairLow > fairMid * 0.97) fairLow = fairMid * 0.97;
    if (fairHigh < fairMid * 1.03) fairHigh = fairMid * 1.03;
  }

  const marketMin = prices[0] || null;
  const marketMax = prices.length ? prices[prices.length - 1] : null;
  const spreadPct = fairMid && marketMin && marketMax ? Math.round(((marketMax - marketMin) / fairMid) * 100) : null;
  const avgMatch = scoped.length
    ? Math.round(scoped.reduce((sum, offer) => sum + (offer.matchConfidence || 88), 0) / scoped.length)
    : 0;
  const trusted = scoped.filter(offer => offer.verifiedSeller || offer.trusted).length;

  let confidence = 18;
  confidence += Math.min(30, prices.length * 6);
  confidence += Math.min(22, sources.size * 6);
  confidence += Math.round(Math.max(0, avgMatch - 75) * 0.55);
  if (prices.length) confidence += Math.round((trusted / prices.length) * 8);
  if (prices.length < 2) confidence -= 20;
  if (sources.size <= 1) confidence -= 12;
  if ((spreadPct || 0) > 55) confidence -= 14;
  else if ((spreadPct || 0) > 35) confidence -= 7;
  confidence = clamp(Math.round(confidence), 8, 100);

  const confidenceLabel = confidence >= 82 ? "Висока"
    : confidence >= 65 ? "Добра"
      : confidence >= 45 ? "Середня"
        : "Попередня";

  const focusPrice = focusOffer?.price || product.bestPrice || marketMin;
  const position = classifyPrice(focusPrice || null, fairLow, fairMid, fairHigh, Boolean(focusOffer?.priceAnomaly));

  const historyPrices = history
    .map(point => Number(point.price))
    .filter(price => Number.isFinite(price) && price > 0)
    .slice(-120);
  const historyLow = historyPrices.length ? Math.min(...historyPrices) : null;
  const historyMedian = median(historyPrices);

  const reasons: string[] = [];
  const caveats: string[] = [];
  if (conditionScoped && focusOffer) reasons.push(`окремо проаналізовано ринок ${conditionName(focusOffer.condition)} товарів`);
  if (sources.size >= 2) reasons.push(`${sources.size} незалежні джерела цін`);
  if (avgMatch >= 95) reasons.push("висока точність збігу модифікацій");
  if (trusted >= Math.max(1, Math.ceil(prices.length / 2))) reasons.push("більшість цін від продавців із сигналами довіри");
  if (historyPrices.length >= 4 && historyMedian && focusPrice) {
    const historicalDelta = Math.round(((focusPrice - historyMedian) / historyMedian) * 100);
    reasons.push(`поточна ціна ${Math.abs(historicalDelta) <= 2 ? "біля" : historicalDelta < 0 ? `${Math.abs(historicalDelta)}% нижче` : `${historicalDelta}% вище`} медіани історії`);
  }

  if (prices.length < 3) caveats.push("Мало підтверджених пропозицій — діапазон попередній.");
  if (sources.size <= 1) caveats.push("Ціни походять переважно з одного джерела.");
  if (!conditionScoped && focusOffer && allSafe.some(offer => offer.condition !== focusOffer.condition)) caveats.push("Недостатньо пропозицій одного стану, тому частково використано ширший ринок.");
  if ((spreadPct || 0) > 45) caveats.push("Розкид цін великий — перевір комплектацію та точну модифікацію.");
  if (!historyPrices.length) caveats.push("Історія цін поки не впливає на цей діапазон.");

  return {
    confidence,
    confidenceLabel,
    sampleCount: prices.length,
    sourceCount: sources.size,
    conditionScoped,
    conditionLabel: conditionName(focusOffer?.condition),
    fairLow: fairLow ? Math.round(fairLow) : null,
    fairMid: fairMid ? Math.round(fairMid) : null,
    fairHigh: fairHigh ? Math.round(fairHigh) : null,
    marketMin,
    marketMax,
    spreadPct,
    focusPrice: focusPrice || null,
    position,
    historyLow,
    historyMedian: historyMedian ? Math.round(historyMedian) : null,
    historySamples: historyPrices.length,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    caveats: Array.from(new Set(caveats)).slice(0, 4),
  };
}
