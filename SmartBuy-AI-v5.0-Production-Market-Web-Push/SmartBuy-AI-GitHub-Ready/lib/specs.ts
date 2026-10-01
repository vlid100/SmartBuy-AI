import type { Product, ProductSpec } from "@/lib/types";

type Candidate = { key: string; label: string; value: string; raw?: string };

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return clean(value.toLowerCase().replace(/[’`]/g, "'").replace(/,/g, "."));
}

function sourceTexts(product: Product) {
  const productText = clean(`${product.title} ${product.subtitle} ${product.highlights.join(" ")}`);
  const offerTexts = product.offers.map(o => clean(`${o.title || ""}`)).filter(Boolean);
  return { productText, offerTexts, all: clean([productText, ...offerTexts].join(" | ")) };
}

function add(list: Candidate[], key: string, label: string, value: string | undefined | null) {
  if (!value || list.some(item => item.key === key)) return;
  list.push({ key, label, value: clean(value) });
}

function matchOne(text: string, regex: RegExp, index = 1) {
  const match = text.match(regex);
  return match?.[index] ? clean(match[index]) : undefined;
}

function storage(text: string) {
  const values = [...text.matchAll(/\b(64|128|256|512|1024|2048|1|2|4)\s*(gb|гб|tb|тб)\b/gi)]
    .map(m => ({ n: Number(m[1]), unit: m[2].toLowerCase() }))
    .filter(x => /tb|тб/.test(x.unit) ? x.n >= 1 : x.n >= 64);
  if (!values.length) return undefined;
  const best = values[0];
  const n = /tb|тб/.test(best.unit) ? best.n : best.n >= 1024 ? best.n / 1024 : best.n;
  const unit = /tb|тб/.test(best.unit) || best.n >= 1024 ? "TB" : "GB";
  return `${n} ${unit}`;
}

function ram(text: string, allowLoose = true) {
  const explicit = text.match(/\b(4|6|8|12|16|24|32|48|64|96|128)\s*(?:gb|гб)\s*(?:ram|озп|оператив\w*)\b/i)
    || text.match(/\b(?:ram|озп|оператив\w*)\s*[:\-]?\s*(4|6|8|12|16|24|32|48|64|96|128)\s*(?:gb|гб)?\b/i);
  if (explicit?.[1]) return `${explicit[1]} GB`;
  if (!allowLoose) return undefined;
  const loose = text.match(/\b(8|12|16|24|32|48|64)\s*(?:gb|гб)\b/i);
  return loose?.[1] ? `${loose[1]} GB` : undefined;
}

function refreshRate(text: string) {
  const hz = matchOne(text, /\b(90|100|120|144|165|180|240|360)\s*(?:hz|гц)\b/i);
  return hz ? `${hz} Гц` : undefined;
}

function screenSize(text: string) {
  const val = matchOne(text, /\b(1[0-9]|[2-9][0-9])(?:[.,](\d))?\s*(?:"|″|дюйм)/i, 0);
  if (!val) return undefined;
  const num = val.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".");
  return num ? `${num}\"` : undefined;
}

function smartphoneSpecs(text: string, out: Candidate[]) {
  add(out, "storage", "Пам’ять", storage(text));
  add(out, "ram", "Оперативна пам’ять", ram(text, false));
  const phoneSize = matchOne(text, /\b(5\.[4-9]|6\.[0-9]|7\.[0-2])\s*(?:"|″|дюйм)/i);
  add(out, "screen", "Діагональ", phoneSize ? `${phoneSize}\"` : undefined);
  add(out, "display_hz", "Частота екрана", refreshRate(text));
  const battery = matchOne(text, /\b(3\d{3}|4\d{3}|5\d{3}|6\d{3}|7\d{3})\s*(?:mah|мАг|мач)\b/i);
  add(out, "battery", "Акумулятор", battery ? `${battery} мА·год` : undefined);
  const camera = matchOne(text, /\b(12|24|32|48|50|64|108|200)\s*(?:mp|мп)\b/i);
  add(out, "camera", "Основна камера", camera ? `${camera} МП` : undefined);
  const chip = matchOne(text, /\b((?:snapdragon|dimensity|exynos)\s*[a-z0-9+\- ]{2,18}|a1[4-9](?:\s*pro)?|tensor\s*g\d|apple\s*a1[4-9])\b/i);
  add(out, "chip", "Чип", chip);
  if (/\b5g\b/i.test(text)) add(out, "network", "Мережа", "5G");
  if (/oled|amoled/i.test(text)) add(out, "panel", "Екран", /amoled/i.test(text) ? "AMOLED" : "OLED");
}

function laptopSpecs(text: string, out: Candidate[]) {
  const gpu = matchOne(text, /\b((?:rtx|gtx)\s*\d{4}(?:\s*ti)?|radeon\s*(?:rx\s*)?\d{3,4}[a-z]{0,3})\b/i);
  add(out, "gpu", "Відеокарта", gpu?.toUpperCase());
  const cpu = matchOne(text, /\b((?:ryzen\s*[3579]\s*\d{4,5}[a-z]{0,3})|(?:core\s*ultra\s*[3579]\s*[- ]?\d{3,5}[a-z]{0,3})|(?:core\s*i[3579]\s*[- ]?\d{4,5}[a-z]{0,3})|(?:intel\s*core\s*i[3579]\s*[- ]?\d{4,5}[a-z]{0,3}))\b/i);
  add(out, "cpu", "Процесор", cpu);
  add(out, "ram", "Оперативна пам’ять", ram(text));
  const ssd = matchOne(text, /\b(256|512|1024|2048|1|2|4)\s*(gb|гб|tb|тб)\s*(?:ssd|nvme)\b/i, 0);
  if (ssd) {
    const m = ssd.match(/(\d+)\s*(gb|гб|tb|тб)/i);
    if (m) add(out, "ssd", "SSD", `${Number(m[1]) >= 1024 && /gb|гб/i.test(m[2]) ? Number(m[1]) / 1024 : m[1]} ${/tb|тб/i.test(m[2]) || (Number(m[1]) >= 1024 && /gb|гб/i.test(m[2])) ? "TB" : "GB"}`);
  } else add(out, "storage", "Накопичувач", storage(text));
  const size = screenSize(text) || (() => { const m = text.match(/\b(13\.3|14|15\.6|16|17\.3|18)\b/); return m ? `${m[1]}\"` : undefined; })();
  add(out, "screen", "Діагональ", size);
  add(out, "display_hz", "Частота екрана", refreshRate(text));
}

function tvSpecs(text: string, out: Candidate[]) {
  add(out, "screen", "Діагональ", screenSize(text));
  if (/\b8k\b/i.test(text)) add(out, "resolution", "Роздільна здатність", "8K");
  else if (/\b4k\b|3840\s*[x×]\s*2160/i.test(text)) add(out, "resolution", "Роздільна здатність", "4K");
  if (/mini\s*led/i.test(text)) add(out, "panel", "Матриця", "Mini LED");
  else if (/qled/i.test(text)) add(out, "panel", "Матриця", "QLED");
  else if (/oled/i.test(text)) add(out, "panel", "Матриця", "OLED");
  add(out, "display_hz", "Частота", refreshRate(text));
  if (/hdmi\s*2\.1/i.test(text)) add(out, "hdmi", "HDMI", "2.1");
}

function homeSpecs(text: string, out: Candidate[]) {
  const suction = matchOne(text, /\b(\d{4,5})\s*pa\b/i);
  add(out, "suction", "Потужність всмоктування", suction ? `${Number(suction).toLocaleString("uk-UA")} Па` : undefined);
  if (/lidar|lds/i.test(text)) add(out, "navigation", "Навігація", "LiDAR");
  if (/станц|station|self[- ]?empty|самоочищ/i.test(text)) add(out, "station", "Станція", "Є");
  if (/mop|митт|волог/i.test(text)) add(out, "mop", "Вологе прибирання", "Є");
  const battery = matchOne(text, /\b(\d{4})\s*(?:mah|мАг|мач)\b/i);
  add(out, "battery", "Акумулятор", battery ? `${battery} мА·год` : undefined);
}

function toolSpecs(text: string, out: Candidate[]) {
  const volts = matchOne(text, /\b(10\.8|12|14\.4|18|20|24|36|40|54|60)\s*v\b/i);
  add(out, "voltage", "Напруга", volts ? `${volts} V` : undefined);
  const torque = matchOne(text, /\b(\d{2,3})\s*(?:nm|нм|н·м)\b/i);
  add(out, "torque", "Крутний момент", torque ? `${torque} Н·м` : undefined);
  const ah = matchOne(text, /\b(1\.5|2|2\.5|3|4|5|6|8|9|12)\s*(?:ah|а·?год|ач)\b/i);
  add(out, "battery_capacity", "Ємність АКБ", ah ? `${ah} А·год` : undefined);
  if (/brushless|безщітк|безщет/i.test(text)) add(out, "motor", "Двигун", "Безщітковий");
  if (/body\s*only|без\s*(?:акум|акб)|каркас|solo/i.test(text)) add(out, "kit", "Комплектація", "Без АКБ");
  else if (/\b(?:2x|2\s*x|2\s*акб|дві\s*акб)/i.test(text)) add(out, "kit", "Комплектація", "2 АКБ");
}

function categorySpecs(category: string, text: string) {
  const out: Candidate[] = [];
  if (category === "Смартфони") smartphoneSpecs(text, out);
  else if (category === "Ноутбуки") laptopSpecs(text, out);
  else if (category === "Телевізори") tvSpecs(text, out);
  else if (category === "Для дому") homeSpecs(text, out);
  else if (category === "Інструменти") toolSpecs(text, out);
  return out;
}

function evidenceText(value: string) {
  return normalize(value)
    .replace(/гц/g, "hz")
    .replace(/н[·\s]?м/g, "nm")
    .replace(/гб/g, "gb")
    .replace(/тб/g, "tb")
    .replace(/м[аa][·\s]?(?:год|г)|мач|mah/g, "mah")
    .replace(/а[·\s]?(?:год|г)|ач|ah/g, "ah")
    .replace(/па/g, "pa")
    .replace(/безщітк[а-яіїєґ]*|безщет[а-яіїєґ]*/g, "brushless")
    .replace(/["″]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceFor(candidate: Candidate, product: Product) {
  const valueNorm = evidenceText(candidate.value);
  const matchesValue = (text: string) => {
    const t = evidenceText(text);
    const pieces = valueNorm.split(/\s+/).filter(piece => piece.length > 1 || /\d/.test(piece));
    return pieces.length ? pieces.every(piece => t.includes(piece)) : false;
  };
  const titleHit = matchesValue(`${product.title} ${product.subtitle} ${product.highlights.join(" ")}`) ? 1 : 0;
  const sourceNames = new Set<string>();
  for (const offer of product.offers) if (offer.title && matchesValue(offer.title)) sourceNames.add(offer.marketplace);
  const sourceCount = sourceNames.size;
  let confidence = 58 + titleHit * 22 + Math.min(20, sourceCount * 8);
  if (!sourceCount && !titleHit) confidence = 50;
  return { confidence: Math.min(99, confidence), sourceCount };
}

export function enrichProductSpecs(product: Product): Product {
  const { all } = sourceTexts(product);
  const candidates = categorySpecs(product.category, all);
  const specs: ProductSpec[] = candidates.map(candidate => {
    const evidence = evidenceFor(candidate, product);
    return { ...candidate, confidence: evidence.confidence, sourceCount: evidence.sourceCount };
  });
  const expectedByCategory: Record<string, number> = { "Смартфони": 6, "Ноутбуки": 6, "Телевізори": 5, "Для дому": 4, "Інструменти": 4 };
  const expected = expectedByCategory[product.category] || Math.max(3, specs.length);
  const specCoverage = Math.min(100, Math.round((specs.length / expected) * 100));
  return { ...product, specs, specCoverage };
}

export function specsAsText(product: Product) {
  return (product.specs || []).map(spec => `${spec.label} ${spec.value}`).join(" ");
}

export function specValue(product: Product, key: string) {
  return product.specs?.find(spec => spec.key === key)?.value;
}

export function comparisonSpecKeys(products: Product[], limit = 7) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    for (const spec of product.specs || []) {
      const item = counts.get(spec.key) || { label: spec.label, count: 0 };
      item.count += 1;
      counts.set(spec.key, item);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, "uk"))
    .slice(0, limit)
    .map(([key, meta]) => ({ key, label: meta.label }));
}
