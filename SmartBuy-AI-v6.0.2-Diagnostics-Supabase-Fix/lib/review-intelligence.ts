import type { Offer, Product, ReviewIntelligence, ReviewTheme } from "@/lib/types";

type ThemeDef = { id: string; label: string; keywords: RegExp };

const THEMES: ThemeDef[] = [
  { id: "battery", label: "Автономність / батарея", keywords: /батар|акум|автоном|заряд|battery|charge|charging/i },
  { id: "display", label: "Екран", keywords: /екран|диспле|oled|amoled|screen|display|герц|hz/i },
  { id: "camera", label: "Камера", keywords: /камер|фото|відео|camera|photo|video/i },
  { id: "performance", label: "Швидкодія", keywords: /швидк|продуктив|процесор|gpu|fps|лаг|гальм|performance|processor|graphics/i },
  { id: "build", label: "Якість / збірка", keywords: /якіст|збірк|корпус|матеріал|build|quality|case|body/i },
  { id: "software", label: "ПЗ / додаток", keywords: /прошив|софт|додат|програм|firmware|software|app\b/i },
  { id: "noise", label: "Шум", keywords: /шум|гучн|тих|noise|loud|quiet/i },
  { id: "cleaning", label: "Прибирання / потужність", keywords: /прибир|всмокт|пилосос|щітк|suction|vacuum|clean/i },
  { id: "navigation", label: "Навігація", keywords: /lidar|навігац|карта|мап|об'їждж|navigation|mapping|obstacle/i },
  { id: "heat", label: "Нагрів", keywords: /нагрів|гріє|перегрів|гаряч|heat|hot|overheat/i },
  { id: "weight", label: "Вага / зручність", keywords: /ваг|важк|легк|зручн|ергоном|weight|heavy|light|comfortable/i },
  { id: "reliability", label: "Надійність", keywords: /надійн|полом|дефект|брак|ремонт|reliab|defect|broken|failure|issue/i },
];

const POSITIVE = /добре|гарн|відмін|супер|класн|задоволен|подоба|швидк|зручн|тих|якісн|great|good|excellent|perfect|love|fast|comfortable|quiet|solid/i;
const NEGATIVE = /поган|мінус|проблем|дефект|брак|лама|гальм|лаг|шумн|гучн|слабк|розряд|перегр|не працю|bad|poor|problem|issue|defect|broken|slow|noisy|weak|drain|overheat/i;

function cleanSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 420);
}

function uniqueSnippets(offers: Offer[]) {
  const seen = new Set<string>();
  const out: { text: string; source: string }[] = [];
  for (const offer of offers) {
    for (const raw of offer.reviewSnippets || []) {
      const text = cleanSnippet(raw);
      if (text.length < 12) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, source: offer.marketplace });
      if (out.length >= 24) return out;
    }
  }
  return out;
}

function themesFromSnippets(snippets: { text: string; source: string }[], sentiment: "positive" | "negative") {
  const counts = new Map<string, { def: ThemeDef; mentions: number; sources: Set<string> }>();
  for (const snippet of snippets) {
    const hasPositive = POSITIVE.test(snippet.text);
    const hasNegative = NEGATIVE.test(snippet.text);
    const matchesSentiment = sentiment === "positive" ? hasPositive && !hasNegative : hasNegative;
    if (!matchesSentiment) continue;
    for (const def of THEMES) {
      if (!def.keywords.test(snippet.text)) continue;
      const current = counts.get(def.id) || { def, mentions: 0, sources: new Set<string>() };
      current.mentions += 1;
      current.sources.add(snippet.source);
      counts.set(def.id, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.mentions - a.mentions || b.sources.size - a.sources.size)
    .slice(0, 4)
    .map(({ def, mentions, sources }) => ({ id: def.id, label: def.label, mentions, sourceCount: sources.size } satisfies ReviewTheme));
}

function reviewSourceCount(product: Product) {
  const sources = new Set<string>();
  for (const offer of product.offers) {
    if ((offer.productRating || 0) > 0 || (offer.productReviewCount || 0) > 0 || (offer.reviewSnippets?.length || 0) > 0) sources.add(offer.marketplace);
  }
  if (!sources.size && ((product.rating || 0) > 0 || (product.reviewCount || 0) > 0)) return 1;
  return sources.size;
}

function confidenceScore(reviewCount: number, snippetCount: number, sourceCount: number) {
  let score = 0;
  score += Math.min(40, sourceCount * 15);
  if (reviewCount >= 1000) score += 32;
  else if (reviewCount >= 250) score += 27;
  else if (reviewCount >= 50) score += 22;
  else if (reviewCount >= 10) score += 15;
  else if (reviewCount > 0) score += 8;
  score += Math.min(30, snippetCount * 5);
  if (sourceCount <= 1) score -= 8;
  return Math.max(8, Math.min(100, Math.round(score)));
}

export function buildReviewIntelligence(product: Product): ReviewIntelligence | undefined {
  const snippets = uniqueSnippets(product.offers);
  const reviewCount = Math.max(0, Number(product.reviewCount || 0));
  const rating = Number(product.rating || 0) > 0 ? Number(product.rating) : undefined;
  const sourceCount = reviewSourceCount(product);
  if (!rating && reviewCount <= 0 && snippets.length === 0) return undefined;

  const positives = themesFromSnippets(snippets, "positive");
  const concerns = themesFromSnippets(snippets, "negative");
  const confidence = confidenceScore(reviewCount, snippets.length, sourceCount);
  const label = confidence >= 80 ? "Висока надійність" : confidence >= 60 ? "Добра надійність" : confidence >= 40 ? "Середня надійність" : "Попередній сигнал";
  const caveats: string[] = [];
  if (sourceCount <= 1) caveats.push("Дані про відгуки поки походять лише з одного джерела або одного агрегованого рейтингу.");
  if (snippets.length === 0) caveats.push("Текстових відгуків недостатньо, тому SmartBuy не робить висновків про конкретні плюси чи проблеми.");
  else if (snippets.length < 4) caveats.push("Текстових відгуків мало — теми нижче варто сприймати як ранній сигнал.");
  if (reviewCount > 0 && reviewCount < 10) caveats.push("Загальна кількість оцінок ще мала для стійкого висновку.");

  let summary = "";
  if (rating && reviewCount > 0) summary = `Агрегований рейтинг ${rating.toFixed(1)}/5 на основі ${reviewCount.toLocaleString("uk-UA")} оцінок.`;
  else if (rating) summary = `Агрегований рейтинг ${rating.toFixed(1)}/5.`;
  else if (reviewCount > 0) summary = `SmartBuy бачить ${reviewCount.toLocaleString("uk-UA")} оцінок, але без надійно витягнутого середнього рейтингу.`;
  else summary = `SmartBuy знайшов ${snippets.length} текстов${snippets.length === 1 ? "ий фрагмент" : "их фрагментів"} відгуків.`;
  if (snippets.length > 0) summary += ` Проаналізовано ${snippets.length} унікальн${snippets.length === 1 ? "ий текстовий фрагмент" : "их текстових фрагментів"} із ${Math.max(1, sourceCount)} джер.`;

  return {
    rating,
    reviewCount,
    sourceCount,
    snippetCount: snippets.length,
    confidence,
    label,
    summary,
    positives,
    concerns,
    caveats,
  };
}

export function enrichProductReviews(product: Product): Product {
  return { ...product, reviewInsights: buildReviewIntelligence(product) };
}
