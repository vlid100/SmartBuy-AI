import type { PricePoint } from "@/lib/types";

export type BuyTimingLevel = "strong" | "good" | "watch" | "wait" | "insufficient";

export type BuyTimingInsight = {
  score: number;
  confidence: number;
  level: BuyTimingLevel;
  label: string;
  summary: string;
  reasons: string[];
  caveats: string[];
  sampleCount: number;
  daysCovered: number;
  minPrice: number | null;
  averagePrice: number | null;
  maxPrice: number | null;
  currentVsMinPct: number | null;
  currentVsAveragePct: number | null;
  recentTrendPct: number | null;
  volatilityPct: number | null;
  dropEvents: number;
  suggestedTarget: number | null;
};

type CleanPoint = { time: number; price: number; sourceCount: number; offerCount: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function cleanPoints(points: PricePoint[], currentPrice: number): CleanPoint[] {
  const map = new Map<number, CleanPoint>();
  for (const point of points || []) {
    const time = new Date(point.date).getTime();
    const price = Number(point.price);
    if (!Number.isFinite(time) || !Number.isFinite(price) || price <= 0) continue;
    const day = Math.floor(time / 86_400_000);
    const existing = map.get(day);
    const next = {
      time,
      price,
      sourceCount: Number(point.sourceCount || 0),
      offerCount: Number(point.offerCount || 0),
    };
    if (!existing || time > existing.time) map.set(day, next);
  }
  const sorted = [...map.values()].sort((a, b) => a.time - b.time);
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    const now = Date.now();
    const today = Math.floor(now / 86_400_000);
    const existing = map.get(today);
    if (!existing) sorted.push({ time: now, price: currentPrice, sourceCount: 0, offerCount: 0 });
    else if (Math.abs(existing.price - currentPrice) > 0.01) {
      const index = sorted.findIndex(item => Math.floor(item.time / 86_400_000) === today);
      if (index >= 0) sorted[index] = { ...sorted[index], time: now, price: currentPrice };
    }
  }
  return sorted.sort((a, b) => a.time - b.time);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function recentTrend(points: CleanPoint[]) {
  if (points.length < 4) return null;
  const windowSize = Math.max(2, Math.min(5, Math.floor(points.length / 2)));
  const recent = points.slice(-windowSize);
  const prior = points.slice(Math.max(0, points.length - windowSize * 2), -windowSize);
  if (!prior.length) return null;
  const priorAvg = average(prior.map(item => item.price));
  const recentAvg = average(recent.map(item => item.price));
  return priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : null;
}

function countDrops(points: CleanPoint[]) {
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].price < points[index - 1].price * 0.995) count += 1;
  }
  return count;
}

function targetFromHistory(current: number, min: number, avg: number, level: BuyTimingLevel) {
  if (level === "strong" || level === "good") return null;
  const historyAnchor = Math.max(min, avg * 0.95);
  const modestDrop = current * 0.96;
  const target = Math.min(modestDrop, historyAnchor);
  if (!Number.isFinite(target) || target <= 0 || target >= current * 0.995) return null;
  return Math.round(target / 100) * 100;
}

export function buildBuyTimingInsight(points: PricePoint[], currentPrice: number): BuyTimingInsight {
  const clean = cleanPoints(points, currentPrice);
  const prices = clean.map(point => point.price);
  const sampleCount = clean.length;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const daysCovered = first && last ? Math.max(0, Math.round((last.time - first.time) / 86_400_000)) : 0;

  if (sampleCount < 3 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      score: 50,
      confidence: clamp(sampleCount * 12, 8, 35),
      level: "insufficient",
      label: "Ще рано оцінювати момент покупки",
      summary: "SmartBuy накопичує історію. Для корисної оцінки потрібні щонайменше кілька незалежних замірів ціни в різні дні.",
      reasons: sampleCount ? [`є лише ${sampleCount} ${sampleCount === 1 ? "запис" : "записи"} ціни`] : ["історії ціни ще немає"],
      caveats: ["це не прогноз майбутньої ціни", "оцінка стане надійнішою після нових перевірок"],
      sampleCount,
      daysCovered,
      minPrice: prices.length ? Math.min(...prices) : null,
      averagePrice: prices.length ? average(prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      currentVsMinPct: null,
      currentVsAveragePct: null,
      recentTrendPct: null,
      volatilityPct: null,
      dropEvents: countDrops(clean),
      suggestedTarget: null,
    };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = average(prices);
  const currentVsMinPct = minPrice > 0 ? ((currentPrice - minPrice) / minPrice) * 100 : 0;
  const currentVsAveragePct = averagePrice > 0 ? ((currentPrice - averagePrice) / averagePrice) * 100 : 0;
  const recentTrendPct = recentTrend(clean);
  const volatilityPct = averagePrice > 0 ? (standardDeviation(prices) / averagePrice) * 100 : 0;
  const dropEvents = countDrops(clean);
  const avgSourceCount = average(clean.map(point => point.sourceCount).filter(Boolean));
  const avgOfferCount = average(clean.map(point => point.offerCount).filter(Boolean));

  let score = 50;
  const reasons: string[] = [];
  const caveats: string[] = [];

  if (currentVsMinPct <= 2) {
    score += 27;
    reasons.push("поточна ціна майже на мінімумі історії");
  } else if (currentVsMinPct <= 5) {
    score += 18;
    reasons.push("ціна близька до історичного мінімуму");
  } else if (currentVsMinPct >= 15) {
    score -= 14;
    reasons.push("ціна помітно вище історичного мінімуму");
  }

  if (currentVsAveragePct <= -7) {
    score += 15;
    reasons.push("ціна суттєво нижча за історичну середню");
  } else if (currentVsAveragePct <= -3) {
    score += 8;
    reasons.push("ціна нижча за історичну середню");
  } else if (currentVsAveragePct >= 10) {
    score -= 16;
    reasons.push("ціна значно вища за історичну середню");
  } else if (currentVsAveragePct >= 5) {
    score -= 8;
    reasons.push("ціна вище історичної середньої");
  }

  if (recentTrendPct != null) {
    if (recentTrendPct <= -6 && currentVsMinPct > 3) {
      score -= 10;
      reasons.push("останні заміри ще рухаються вниз");
    } else if (recentTrendPct >= 6) {
      score += 5;
      reasons.push("останні заміри були вищими");
    } else if (Math.abs(recentTrendPct) <= 2) {
      reasons.push("останні ціни відносно стабільні");
    }
  }

  if (volatilityPct >= 12) {
    score -= 5;
    caveats.push("ціна сильно коливається — одна перевірка може бути нетиповою");
  } else if (volatilityPct <= 4) {
    score += 3;
  }

  if (dropEvents >= Math.max(2, Math.floor(sampleCount / 3)) && currentVsMinPct > 4) {
    score -= 4;
    caveats.push("в історії вже було кілька помітних знижень");
  }

  score = clamp(Math.round(score), 5, 95);

  let confidence = 20;
  confidence += Math.min(35, sampleCount * 5);
  confidence += Math.min(20, daysCovered * 0.75);
  if (avgSourceCount >= 2) confidence += 10;
  if (avgSourceCount >= 4) confidence += 5;
  if (avgOfferCount >= 3) confidence += 5;
  if (volatilityPct >= 15) confidence -= 8;
  confidence = clamp(Math.round(confidence), 15, 95);

  let level: BuyTimingLevel;
  let label: string;
  let summary: string;
  if (score >= 76) {
    level = "strong";
    label = "Сильний момент для покупки";
    summary = "Поточна ціна виглядає сильно відносно накопиченої історії. Якщо продавець і умови покупки підходять, причин чекати лише через ціну небагато.";
  } else if (score >= 62) {
    level = "good";
    label = "Хороший момент, якщо товар потрібен";
    summary = "Ціна виглядає нормально або вигідно за твоєю історією. Чекати можна, але явного сигналу, що поточна ціна невдала, немає.";
  } else if (score >= 45) {
    level = "watch";
    label = "Нейтрально — можна ще поспостерігати";
    summary = "Поточна ціна не виглядає ні особливо вигідною, ні явно завищеною. Якщо покупка не термінова, відстеження може дати кращу точку входу.";
  } else {
    level = "wait";
    label = "Є сенс почекати";
    summary = "За накопиченою історією ціна зараз не виглядає сильною. Якщо покупка не термінова, краще залишити товар у відстеженні й дочекатися кращої ціни.";
  }

  if (confidence < 55) caveats.push("надійність оцінки поки середня — історії або джерел ще небагато");
  caveats.push("SmartBuy не передбачає майбутнє: це оцінка поточного моменту за вже зафіксованою історією");

  return {
    score,
    confidence,
    level,
    label,
    summary,
    reasons: Array.from(new Set(reasons)).slice(0, 5),
    caveats: Array.from(new Set(caveats)).slice(0, 3),
    sampleCount,
    daysCovered,
    minPrice,
    averagePrice,
    maxPrice,
    currentVsMinPct: round1(currentVsMinPct),
    currentVsAveragePct: round1(currentVsAveragePct),
    recentTrendPct: recentTrendPct == null ? null : round1(recentTrendPct),
    volatilityPct: round1(volatilityPct),
    dropEvents,
    suggestedTarget: targetFromHistory(currentPrice, minPrice, averagePrice, level),
  };
}
