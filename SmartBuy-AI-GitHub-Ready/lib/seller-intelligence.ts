import type { Offer } from "./types";

export type SellerTrustLevel = "strong" | "good" | "check" | "caution";
export type SignalTone = "good" | "neutral" | "warn" | "bad";

export type SellerSignal = {
  label: string;
  detail: string;
  tone: SignalTone;
};

export type SellerTrustProfile = {
  score: number;
  level: SellerTrustLevel;
  label: string;
  summary: string;
  warrantyLabel: string;
  warrantyScore: number;
  deliveryLabel: string;
  deliveryScore: number;
  paymentLabel: string;
  paymentScore: number;
  strengths: SellerSignal[];
  checks: SellerSignal[];
};

function clean(value?: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function warrantyProfile(offer: Offer) {
  const text = clean(offer.warranty);
  if (!text || /(уточн|дивись|залежить|невідом|не вказ)/.test(text)) {
    return { score: offer.sellerType === "store" ? 46 : 30, label: "Гарантію треба уточнити", tone: "warn" as const };
  }
  if (/(без гаран|немає гаран|безгаран)/.test(text)) {
    return { score: offer.condition === "new" ? 18 : 32, label: "Без підтвердженої гарантії", tone: "bad" as const };
  }
  const months = text.match(/(\d{1,3})\s*(міс|місяц|month)/);
  const years = text.match(/(\d{1,2})\s*(рік|рок|year)/);
  const duration = years ? Number(years[1]) * 12 : months ? Number(months[1]) : 0;
  if (duration >= 24) return { score: 96, label: `Гарантія ${duration} міс.`, tone: "good" as const };
  if (duration >= 12) return { score: 88, label: `Гарантія ${duration} міс.`, tone: "good" as const };
  if (duration > 0) return { score: 72, label: `Гарантія ${duration} міс.`, tone: "neutral" as const };
  if (/(офіційн|виробник|manufacturer)/.test(text)) return { score: 94, label: "Офіційна гарантія вказана", tone: "good" as const };
  if (/(залишк|можлив)/.test(text)) return { score: 58, label: "Можлива залишкова гарантія", tone: "neutral" as const };
  return { score: 65, label: offer.warranty, tone: "neutral" as const };
}

function deliveryProfile(offer: Offer) {
  const text = clean(offer.delivery);
  if (!text || /(уточн|дивись|невідом|не вказ)/.test(text)) {
    return { score: 38, label: "Доставку треба уточнити", tone: "warn" as const };
  }
  if (/(olx достав|безпечн.*достав|післяплат|накладен|оплата при отрим)/.test(text)) {
    return { score: 90, label: "Є захищений/післяплатний сценарій", tone: "good" as const };
  }
  if (/(самовивіз|зустріч)/.test(text)) {
    return { score: offer.sellerType === "private" ? 82 : 78, label: "Можлива особиста перевірка", tone: "good" as const };
  }
  if (/(1.?3 дні|доставка по украї|доставка)/.test(text)) {
    return { score: 72, label: "Умови доставки вказані", tone: "neutral" as const };
  }
  return { score: 60, label: offer.delivery, tone: "neutral" as const };
}

function paymentProfile(offer: Offer) {
  const delivery = clean(offer.delivery);
  if (offer.sellerType === "private") {
    if (/(olx достав|післяплат|накладен|зустріч|самовивіз)/.test(delivery)) {
      return { score: 82, label: "Можна уникнути повної передоплати", tone: "good" as const };
    }
    return { score: 34, label: "Не роби повну передоплату без перевірки", tone: "warn" as const };
  }
  if (offer.verifiedSeller || offer.trusted) {
    return { score: 86, label: "Купуй через офіційний checkout майданчика", tone: "good" as const };
  }
  return { score: 58, label: "Перевір спосіб оплати на сайті продавця", tone: "neutral" as const };
}

export function sellerTrustProfile(offer: Offer, median: number | null): SellerTrustProfile {
  const warranty = warrantyProfile(offer);
  const delivery = deliveryProfile(offer);
  const payment = paymentProfile(offer);
  const match = Math.max(0, Math.min(100, Number(offer.matchConfidence || 0)));

  let score = 44;
  const strengths: SellerSignal[] = [];
  const checks: SellerSignal[] = [];

  if (offer.verifiedSeller) {
    score += 19;
    strengths.push({ label: "Перевірений продавець", detail: "SmartBuy має позитивний сигнал перевіреності для цієї пропозиції.", tone: "good" });
  } else if (offer.trusted) {
    score += 12;
    strengths.push({ label: "Є сигнал довіри", detail: "Джерело або продавець позначений як довірений у доступних даних.", tone: "good" });
  } else {
    checks.push({ label: "Продавця треба перевірити", detail: "Переглянь рейтинг, відгуки, контакти, реквізити та історію продажів на самому майданчику.", tone: "warn" });
  }

  if (offer.sellerType === "store") score += 6;
  if (offer.sellerType === "private") {
    score -= 8;
    checks.push({ label: "Приватна угода", detail: "Для приватних оголошень SmartBuy радить перевірку товару до повної оплати.", tone: "neutral" });
  }

  if (match >= 98) {
    score += 8;
    strengths.push({ label: "Точний збіг моделі", detail: `Збіг пропозиції з потрібною моделлю ${match}%.`, tone: "good" });
  } else if (match > 0 && match < 90) {
    score -= 14;
    checks.push({ label: "Звір модифікацію", detail: `Точність збігу лише ${match}%. Перевір пам’ять, версію, комплект і артикул.`, tone: "warn" });
  }

  score += Math.round((warranty.score - 50) * 0.16);
  score += Math.round((delivery.score - 50) * 0.10);
  score += Math.round((payment.score - 50) * 0.12);

  if (warranty.score >= 80) strengths.push({ label: warranty.label, detail: offer.warranty || "Гарантія вказана", tone: "good" });
  else if (warranty.score < 50) checks.push({ label: warranty.label, detail: "Уточни строк, хто саме надає гарантію і як працює повернення.", tone: warranty.score < 30 ? "bad" : "warn" });

  if (delivery.score >= 80) strengths.push({ label: delivery.label, detail: offer.delivery || "Умови доставки вказані", tone: "good" });
  else if (delivery.score < 50) checks.push({ label: delivery.label, detail: "Перед оплатою підтвердь доставку, огляд і момент списання грошей.", tone: "warn" });

  if (offer.priceAnomaly) {
    score -= 28;
    checks.push({ label: "Цінова аномалія", detail: "Ціна сильно відрізняється від інших пропозицій. Перевір комплектацію та умови продажу.", tone: "bad" });
  }
  if (median && offer.price < median * 0.72) {
    score -= 16;
    checks.push({ label: "Дуже низька ціна", detail: "Ціна значно нижча за медіану ринку — це потребує додаткової перевірки.", tone: "warn" });
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  const level: SellerTrustLevel = score >= 84 ? "strong" : score >= 68 ? "good" : score >= 48 ? "check" : "caution";
  const label = level === "strong" ? "Сильні сигнали довіри" : level === "good" ? "Добрі сигнали, перевір деталі" : level === "check" ? "Потрібна перевірка продавця" : "Підвищена обережність";
  const summary = level === "strong"
    ? "За доступними даними пропозиція має сильні сигнали довіри. Перед оплатою все одно звір умови гарантії, повернення і комплектацію."
    : level === "good"
      ? "Пропозиція виглядає нормально, але частину умов варто підтвердити безпосередньо на сторінці продавця."
      : level === "check"
        ? "SmartBuy бачить недостатньо підтверджених сигналів. Перевір продавця, оплату, гарантію і точну модифікацію до покупки."
        : "Є кілька факторів, через які не варто поспішати з оплатою без додаткової перевірки.";

  return {
    score, level, label, summary,
    warrantyLabel: warranty.label, warrantyScore: warranty.score,
    deliveryLabel: delivery.label, deliveryScore: delivery.score,
    paymentLabel: payment.label, paymentScore: payment.score,
    strengths: strengths.slice(0, 4), checks: checks.slice(0, 5),
  };
}
