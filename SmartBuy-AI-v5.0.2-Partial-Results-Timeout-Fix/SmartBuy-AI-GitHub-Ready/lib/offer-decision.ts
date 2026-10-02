import type { Offer } from "./types";
import { sellerTrustProfile } from "./seller-intelligence";

export type OfferDecisionLevel = "strong" | "good" | "check" | "caution";

export type OfferDecision = {
  offer: Offer;
  score: number;
  level: OfferDecisionLevel;
  label: string;
  effectivePrice: number;
  listedPrice: number;
  finalCost?: number;
  finalCostUsed: boolean;
  priceScore: number;
  trustScore: number;
  termsScore: number;
  matchScore: number;
  reasons: string[];
  warnings: string[];
};

export type OfferDecisionRanking = {
  ranked: OfferDecision[];
  recommended: OfferDecision | null;
  cheapest: OfferDecision | null;
  safest: OfferDecision | null;
  finalCostCoverage: number;
  usesFinalCostRanking: boolean;
  summary: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  const safe = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return null;
  const middle = Math.floor(safe.length / 2);
  return safe.length % 2 ? safe[middle] : (safe[middle - 1] + safe[middle]) / 2;
}

function priceScore(price: number, marketMedian: number | null, anomaly: boolean) {
  if (!marketMedian || marketMedian <= 0 || !Number.isFinite(price) || price <= 0) return anomaly ? 35 : 68;
  const ratio = price / marketMedian;
  let score = ratio < 0.72 ? 44
    : ratio < 0.82 ? 72
      : ratio <= 0.94 ? 96
        : ratio <= 1.02 ? 90
          : ratio <= 1.10 ? 76
            : ratio <= 1.20 ? 58
              : 38;
  if (anomaly) score -= 28;
  return clamp(score);
}

function matchScore(offer: Offer) {
  const confidence = Number(offer.matchConfidence || 0);
  if (confidence >= 98) return 100;
  if (confidence >= 95) return 94;
  if (confidence >= 90) return 86;
  if (confidence > 0) return clamp(confidence - 12);
  return 66;
}

function decisionLevel(score: number): { level: OfferDecisionLevel; label: string } {
  if (score >= 84) return { level: "strong", label: "Сильна пропозиція" };
  if (score >= 72) return { level: "good", label: "Добрий баланс" };
  if (score >= 56) return { level: "check", label: "Варто перевірити" };
  return { level: "caution", label: "Підвищена обережність" };
}

export function buildOfferDecision(
  offer: Offer,
  marketMedian: number | null,
  finalCost?: number,
  useFinalCostRanking = false,
): OfferDecision {
  const trust = sellerTrustProfile(offer, marketMedian);
  const safeFinalCost = Number.isFinite(finalCost) && Number(finalCost) > 0 ? Number(finalCost) : undefined;
  const effectivePrice = useFinalCostRanking && safeFinalCost ? safeFinalCost : offer.price;
  const pricing = priceScore(effectivePrice, marketMedian, Boolean(offer.priceAnomaly));
  const match = matchScore(offer);
  const terms = Math.round((trust.warrantyScore + trust.deliveryScore + trust.paymentScore) / 3);

  let score = Math.round(trust.score * 0.34 + match * 0.26 + pricing * 0.25 + terms * 0.15);
  if (offer.verifiedSeller) score += 3;
  if (offer.priceAnomaly) score -= 12;
  if (safeFinalCost && useFinalCostRanking) score += 2;
  if (useFinalCostRanking && !safeFinalCost) score -= 5;
  score = clamp(score, 5, 100);

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (offer.verifiedSeller) reasons.push("перевірений продавець");
  else if (offer.trusted) reasons.push("є сигнал довіри до продавця");
  if ((offer.matchConfidence || 0) >= 95) reasons.push("високий збіг моделі");
  if (marketMedian && effectivePrice <= marketMedian) reasons.push(useFinalCostRanking && safeFinalCost ? "кінцева ціна не вища за медіану" : "ціна не вища за медіану");
  if (trust.warrantyScore >= 80) reasons.push("сильні умови гарантії");
  if (trust.deliveryScore >= 80) reasons.push("зручна доставка / огляд");
  if (safeFinalCost && useFinalCostRanking) reasons.push("врахована збережена кінцева ціна");

  if (offer.priceAnomaly) warnings.push("цінова аномалія");
  if ((offer.matchConfidence || 0) > 0 && (offer.matchConfidence || 0) < 90) warnings.push("треба звірити точну модифікацію");
  if (!offer.verifiedSeller && !offer.trusted) warnings.push("продавець не підтверджений SmartBuy");
  if (trust.warrantyScore < 50) warnings.push("гарантію треба уточнити");
  if (trust.deliveryScore < 50) warnings.push("умови доставки треба уточнити");
  if (safeFinalCost && !useFinalCostRanking) warnings.push("кінцева ціна є лише для частини продавців");
  if (useFinalCostRanking && !safeFinalCost) warnings.push("кінцева ціна для цього продавця ще не порахована");

  const verdict = decisionLevel(score);
  return {
    offer,
    score,
    level: verdict.level,
    label: verdict.label,
    effectivePrice,
    listedPrice: offer.price,
    finalCost: safeFinalCost,
    finalCostUsed: Boolean(safeFinalCost && useFinalCostRanking),
    priceScore: pricing,
    trustScore: trust.score,
    termsScore: terms,
    matchScore: match,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    warnings: Array.from(new Set(warnings)).slice(0, 4),
  };
}

export function rankOfferDecisions(
  offers: Offer[],
  getFinalCost?: (offer: Offer) => number | undefined,
): OfferDecisionRanking {
  const valid = offers.filter(offer => Number.isFinite(offer.price) && offer.price > 0);
  if (!valid.length) {
    return { ranked: [], recommended: null, cheapest: null, safest: null, finalCostCoverage: 0, usesFinalCostRanking: false, summary: "Немає пропозицій для оцінки." };
  }

  const listedMedian = median(valid.filter(offer => !offer.priceAnomaly).map(offer => offer.price)) ?? median(valid.map(offer => offer.price));
  const finalCosts = new Map<Offer, number>();
  for (const offer of valid) {
    const value = Number(getFinalCost?.(offer));
    if (Number.isFinite(value) && value > 0) finalCosts.set(offer, value);
  }
  const finalCostCoverage = finalCosts.size;
  const usesFinalCostRanking = finalCostCoverage >= 2;
  const finalCostMedian = usesFinalCostRanking
    ? median(valid.map(offer => finalCosts.get(offer)).filter((value): value is number => Boolean(value && value > 0)))
    : null;

  const ranked = valid
    .map(offer => buildOfferDecision(offer, usesFinalCostRanking && finalCosts.has(offer) ? (finalCostMedian ?? listedMedian) : listedMedian, finalCosts.get(offer), usesFinalCostRanking))
    .sort((a, b) => b.score - a.score || a.effectivePrice - b.effectivePrice || a.offer.price - b.offer.price);

  const recommended = ranked[0] || null;
  const cheapest = [...ranked].sort((a, b) => a.offer.price - b.offer.price || b.score - a.score)[0] || null;
  const safest = [...ranked].sort((a, b) => b.trustScore - a.trustScore || b.score - a.score || a.offer.price - b.offer.price)[0] || null;
  const summary = recommended
    ? usesFinalCostRanking
      ? `SmartBuy порівняв ціну, довіру, збіг моделі, умови покупки та збережені кінцеві витрати для ${finalCostCoverage} продавців.`
      : `SmartBuy порівняв ціну, довіру до продавця, збіг моделі, гарантію та доставку. Кінцеві витрати вплинуть на рейтинг, коли будуть пораховані щонайменше для 2 продавців.`
    : "Немає достатніх даних для ранжування.";

  return { ranked, recommended, cheapest, safest, finalCostCoverage, usesFinalCostRanking, summary };
}
