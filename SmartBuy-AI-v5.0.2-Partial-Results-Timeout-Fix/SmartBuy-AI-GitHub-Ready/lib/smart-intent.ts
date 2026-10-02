import type { Product, SmartSearchMeta } from "@/lib/types";
import { specsAsText } from "@/lib/specs";

const BRAND_WORDS = [
  "apple", "iphone", "samsung", "xiaomi", "redmi", "poco", "google", "pixel", "oneplus",
  "lenovo", "asus", "acer", "hp", "dell", "msi", "macbook", "huawei",
  "sony", "lg", "hisense", "tcl", "roborock", "dreame", "xiaomi", "dyson",
  "makita", "bosch", "dewalt", "milwaukee", "metabo",
];

const VARIANT_WORDS = new Set(["pro", "max", "ultra", "plus", "mini", "air", "lite", "fe", "se"]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

function parseBudget(text: string) {
  const normalized = normalize(text).replace(/\u00a0/g, " ");
  const match = normalized.match(/(?:до|max(?:imum)?|бюджет(?:ом)?\s*(?:до)?|не\s*більше\s*ніж)\s*([0-9][0-9\s.,]{0,10})\s*(тис(?:яч(?:і|у|)?|\.)?|к|грн|₴)?/i);
  if (!match) return undefined;
  let raw = match[1].replace(/[\s,.]/g, "");
  let amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = (match[2] || "").toLowerCase();
  if (/тис|^к$/.test(suffix) || (amount < 1000 && /тисяч/.test(normalized))) amount *= 1000;
  return Math.round(amount);
}

function inferCategory(text: string) {
  const t = normalize(text);
  if (/ноут|laptop|macbook|ультрабук|комп'ютер/.test(t)) return "Ноутбуки";
  if (/телевіз|tv\b|oled|qled|mini\s*led|ps5|xbox/.test(t)) return "Телевізори";
  if (/пилосос|робот[-\s]?пилосос|vacuum|пральн|холодиль|кавомаш|фен|очищувач повітря/.test(t)) return "Для дому";
  if (/шурупов|дриль|перфорат|болгарк|makita|bosch|dewalt|milwaukee|інструмент/.test(t)) return "Інструменти";
  if (/телефон|смартфон|iphone|samsung|pixel|xiaomi|redmi|poco/.test(t)) return "Смартфони";
  return undefined;
}

function inferCondition(text: string): SmartSearchMeta["condition"] {
  const t = normalize(text);
  if (/\bб\/?у\b|\bбу\b|вживан|second\s*hand|used/.test(t)) return "used";
  if (/тільки\s*нов|новий|нова|нове|запакован/.test(t)) return "new";
  return "all";
}

function inferScope(text: string): SmartSearchMeta["marketScope"] {
  const t = normalize(text);
  if (/olx|shafa|від\s*людей|приватн/.test(t)) return "private";
  if (/aliexpress|аліекспрес|temu|тему|amazon|амазон|закордон/.test(t)) return "international";
  if (/в\s*україн|українськ|магазин/.test(t)) return "ukraine";
  return "all";
}

function prioritiesFrom(text: string) {
  const t = normalize(text);
  const priorities: Array<{ id: string; label: string; terms: string[] }> = [];
  const add = (id: string, label: string, terms: string[]) => { if (!priorities.some(x => x.id === id)) priorities.push({ id, label, terms }); };
  if (/іг|gaming|гейм|fps|steam/.test(t)) add("gaming", "Ігри", ["rtx", "gtx", "gaming", "ігров"]);
  if (/\bробот(?:а|и|у|ою)\b|офіс|навчан|програмув|монтаж|photoshop|дизайн/.test(t)) add("work", "Робота / навчання", ["16gb", "32gb", "ryzen", "core", "ssd"]);
  if (/батар|автоном|довго\s*працю|заряд/.test(t)) add("battery", "Хороша автономність", ["battery", "mah", "автоном", "ultra", "air"]);
  if (/камер|фото|відео|зйом/.test(t)) add("camera", "Камера", ["camera", "камера", "pro", "ultra", "ois"]);
  if (/шерст|тварин|кіт|собак/.test(t)) add("pets", "Шерсть тварин", ["lidar", "turbo", "max", "self", "station"]);
  if (/тих|шум/.test(t)) add("quiet", "Тиха робота", ["quiet", "silent"]);
  if (/легк|компакт|тонк/.test(t)) add("portable", "Компактність", ["air", "slim", "14", "13"]);
  if (/120\s*гц|120\s*hz|ps5|hdmi\s*2\.1/.test(t)) add("console", "PS5 / 120 Гц", ["120hz", "120", "hdmi 2.1", "oled"]);
  if (/самоочищ|станц/.test(t)) add("dock", "Станція самоочищення", ["station", "plus", "+", "dock"]);
  if (/гарант/.test(t)) add("warranty", "Гарантія", ["warranty", "гарант"]);
  return priorities;
}

function specificModelQuery(text: string) {
  const t = normalize(text).replace(/(?:до|max(?:imum)?|бюджет(?:ом)?\s*(?:до)?|не\s*більше\s*ніж)\s*[0-9][0-9\s.,]{0,10}\s*(?:тис(?:яч(?:і|у|)?|\.)?|к|грн|₴)?/gi, " ");
  const tokens = t.replace(/[^a-zа-яіїєґ0-9+.-]+/gi, " ").split(/\s+/).filter(Boolean);
  const hasBrand = BRAND_WORDS.some(brand => tokens.includes(brand));
  const modelTokens = tokens.filter(token => BRAND_WORDS.includes(token) || VARIANT_WORDS.has(token) || /\d/.test(token) || /^[a-z]{2,}\d{2,}[a-z0-9-]*$/i.test(token));
  if (!hasBrand || modelTokens.length < 2) return undefined;
  return Array.from(new Set(modelTokens)).slice(0, 7).join(" ");
}

function deriveSearchQuery(text: string, category: string | undefined, budget: number | undefined, priorities: ReturnType<typeof prioritiesFrom>) {
  const specific = specificModelQuery(text);
  if (specific) return specific;
  const ids = new Set(priorities.map(item => item.id));
  if (category === "Ноутбуки") {
    if (ids.has("gaming")) {
      if ((budget || 0) >= 55000) return "ноутбук RTX 4070 16GB";
      if ((budget || 0) >= 42000) return "ноутбук RTX 4060 16GB";
      if ((budget || 0) >= 32000) return "ноутбук RTX 4050 16GB";
      return "ноутбук RTX 3050 16GB";
    }
    if (ids.has("battery") || ids.has("portable")) return "ноутбук Ryzen 7 16GB SSD";
    return "ноутбук 16GB SSD Ryzen 7";
  }
  if (category === "Смартфони") {
    const storage = normalize(text).match(/\b(128|256|512|1024)\s*(?:gb|гб)\b/)?.[1] || "256";
    if (ids.has("camera")) return `смартфон ${storage}GB камера OIS`;
    if (ids.has("battery")) return `смартфон ${storage}GB 5000mAh`;
    return `смартфон ${storage}GB`;
  }
  if (category === "Телевізори") {
    const inches = normalize(text).match(/\b(43|50|55|58|65|75|77|83|85)\s*(?:дюйм|[\"”])?/)?.[1] || "55";
    if (ids.has("console")) return `телевізор ${inches} 120Hz HDMI 2.1`;
    return `телевізор ${inches} 4K`;
  }
  if (category === "Для дому") {
    if (/робот[-\s]?пилосос|пилосос/.test(normalize(text))) {
      if (ids.has("dock")) return "робот пилосос LiDAR станція самоочищення";
      if (ids.has("pets")) return "робот пилосос LiDAR для шерсті";
      return "робот пилосос LiDAR";
    }
  }
  if (category === "Інструменти") {
    if (/шурупов|дриль/.test(normalize(text))) return "шуруповерт 18V безщітковий";
    return "акумуляторний інструмент 18V";
  }
  const cleaned = normalize(text)
    .replace(/(?:до|max(?:imum)?|бюджет(?:ом)?\s*(?:до)?)\s*[0-9][0-9\s.,]{0,10}\s*(?:тис(?:яч(?:і|у|)?|\.)?|к|грн|₴)?/gi, " ")
    .replace(/\b(хочу|потрібен|потрібна|потрібно|знайди|підбери|будь ласка|бажано|щоб|добрий|хороший|гарний)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  return cleaned || text.trim();
}

export function parseSmartIntent(query: string): SmartSearchMeta {
  const category = inferCategory(query);
  const budget = parseBudget(query);
  const priorities = prioritiesFrom(query);
  const condition = inferCondition(query);
  const marketScope = inferScope(query);
  const derivedQuery = deriveSearchQuery(query, category, budget, priorities);
  const understood: string[] = [];
  if (category) understood.push(category);
  if (budget) understood.push(`до ${budget.toLocaleString("uk-UA")} ₴`);
  understood.push(...priorities.map(item => item.label));
  if (condition === "used") understood.push("б/в");
  if (condition === "new") understood.push("нове");
  const confidence = Math.min(98, 58 + (category ? 12 : 0) + (budget ? 10 : 0) + Math.min(18, priorities.length * 6));
  return {
    enabled: true,
    originalQuery: query,
    derivedQuery,
    category,
    budget,
    priorities: priorities.map(item => item.label),
    priorityIds: priorities.map(item => item.id),
    condition,
    marketScope,
    confidence,
    explanation: understood.length
      ? `SmartBuy зрозумів: ${understood.join(" · ")}. Для пошуку використано коротший технічний запит, щоб магазини повертали релевантні моделі.`
      : "SmartBuy скоротив запит до ключових слів і ранжує результати за ціною, релевантністю та кількістю підтверджених пропозицій.",
  };
}

export function rankProductsForIntent(products: Product[], intent: SmartSearchMeta) {
  const ids = new Set(intent.priorityIds || []);
  return products.map(product => {
    const haystack = `${product.title} ${product.subtitle} ${product.highlights.join(" ")} ${specsAsText(product)} ${product.aiSummary}`.toLowerCase();
    let score = 48;
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (intent.category && product.category === intent.category) { score += 12; reasons.push(intent.category); }
    if (intent.budget) {
      const ratio = product.bestPrice / intent.budget;
      if (ratio <= 0.90) { score += 22; reasons.push(`у бюджеті із запасом ${Math.max(0, Math.round((1 - ratio) * 100))}%`); }
      else if (ratio <= 1) { score += 18; reasons.push("вкладається в бюджет"); }
      else if (ratio <= 1.08) { score -= 8; warnings.push("трохи вище бюджету"); }
      else { score -= 25; warnings.push("вище бюджету"); }
    }

    const sourceCount = new Set(product.offers.map(offer => offer.marketplace)).size;
    if (sourceCount >= 2) { score += 8; reasons.push(`${sourceCount} джерела`); }
    else warnings.push("поки одне автоматичне джерело");

    const checks: Array<[string, RegExp, string]> = [
      ["gaming", /rtx|gtx|gaming|ігров/i, "ігрова графіка"],
      ["work", /16\s*gb|32\s*gb|ryzen|core|ssd/i, "підходить для роботи"],
      ["battery", /5000\s*mah|air|ultra|battery|автоном/i, "акцент на автономності"],
      ["camera", /camera|камера|ois|pro|ultra/i, "акцент на камері"],
      ["pets", /lidar|max|station|turbo/i, "підходить для прибирання шерсті"],
      ["console", /120\s*(?:hz|гц)|hdmi\s*2\.1|oled/i, "підходить для консолі"],
      ["dock", /station|станц|plus|\+/i, "станція / самоочищення"],
      ["portable", /air|slim|13|14/i, "компактний формат"],
    ];
    for (const [id, regex, label] of checks) {
      if (!ids.has(id)) continue;
      if (regex.test(haystack)) { score += 6; reasons.push(label); }
      else { score -= 3; warnings.push(`не підтверджено: ${label}`); }
    }

    score += Math.round((product.score - 70) * 0.25);
    const fitScore = Math.max(1, Math.min(99, Math.round(score)));
    const fitReasons = Array.from(new Set(reasons)).slice(0, 4);
    const fitWarnings = Array.from(new Set(warnings)).slice(0, 3);
    const smartPrefix = fitReasons.length ? `Для твого запиту: ${fitReasons.join(", ")}. ` : "";
    return {
      ...product,
      fitScore,
      fitReasons,
      fitWarnings,
      aiSummary: `${smartPrefix}${product.aiSummary}`,
    };
  }).sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0) || b.offers.length - a.offers.length || a.bestPrice - b.bestPrice);
}
