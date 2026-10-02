export type PriceParseMode = "structured" | "price-node" | "context";

const CURRENCY_MARKER_RE = /(?:₴|грн\.?|uah\b)/i;
const NUMBER_SRC = String.raw`(?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d{1,3}(?:[.,]\d{3})+|\d{1,8})(?:[.,]\d{1,2})?`;
const CURRENCY_PRICE_RE = new RegExp(`(?:(?:₴|грн\\.?|uah\\b)\\s*(${NUMBER_SRC})|(${NUMBER_SRC})\\s*(?:₴|грн\\.?|uah\\b))`, "gi");
const NUMBER_TOKEN_RE = new RegExp(NUMBER_SRC, "g");
const SAFE_PRICE_WORD_RE = /\b(?:від|до|ціна|price|sale|акція|акційна|за)\b/gi;
const UNIT_RE = /^(?:мм|mm|см|cm|м|m|кг|kg|г|g|л|l|мл|ml|вт|w|в|v|mah|мач|hz|гц|gb|гб|tb|тб|шт)\b/i;

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeNumericToken(raw: string): number | null {
  let value = raw.replace(/[\s\u00a0'’]/g, "").trim();
  if (!value) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep >= 0 && value.length - lastSep - 1 <= 2) {
    const whole = value.slice(0, lastSep).replace(/[.,]/g, "");
    const fraction = value.slice(lastSep + 1).replace(/[^0-9]/g, "");
    value = `${whole}.${fraction}`;
  } else {
    value = value.replace(/[.,]/g, "");
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 20_000_000 ? Math.round(number) : null;
}

function looksLikeMeasurementAround(text: string, start: number, end: number) {
  const left = text.slice(Math.max(0, start - 20), start);
  const right = text.slice(end, Math.min(text.length, end + 20));
  if (/[0-9]\s*[xх×]\s*$/i.test(left)) return true;
  if (/^\s*[xх×]\s*[0-9]/i.test(right)) return true;
  if (/^\s*(?:\/\s*)?[0-9]+\s*[xх×]/i.test(right)) return true;
  if (UNIT_RE.test(right.trimStart())) return true;
  return false;
}

function currencyQualifiedPrice(text: string): number | null {
  CURRENCY_PRICE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CURRENCY_PRICE_RE.exec(text))) {
    const raw = match[1] || match[2];
    if (!raw) continue;
    const within = match[0].indexOf(raw);
    const start = match.index + Math.max(0, within);
    const end = start + raw.length;
    if (looksLikeMeasurementAround(text, start, end)) continue;
    const parsed = normalizeNumericToken(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

function numericOnlyPrice(text: string): number | null {
  if (!text) return null;
  if (/[xх×]\s*\d|\d\s*[xх×]/i.test(text)) return null;
  const withoutCurrency = text.replace(/(?:₴|грн\.?|uah\b)/gi, " ").replace(SAFE_PRICE_WORD_RE, " ");
  const tokens = withoutCurrency.match(NUMBER_TOKEN_RE) || [];
  if (tokens.length !== 1) return null;

  // A price node may contain punctuation around the value, but not product units or words.
  const residue = withoutCurrency
    .replace(tokens[0], " ")
    .replace(/[\s:;,.()\[\]{}\-–—~≈+*/]/g, "")
    .trim();
  if (residue) return null;
  return normalizeNumericToken(tokens[0]);
}

export function parsePriceValue(value?: string | number | null, mode: PriceParseMode = "structured"): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 20_000_000) return Math.round(value);
  const text = cleanText(String(value || ""));
  if (!text) return null;

  const qualified = currencyQualifiedPrice(text);
  if (qualified !== null) return qualified;
  if (mode === "context") return null;

  return numericOnlyPrice(text);
}

export function hasCurrencyMarker(value?: string | null) {
  return CURRENCY_MARKER_RE.test(String(value || ""));
}

export function titleContainsMatchingDimensionNumber(title: string, price: number) {
  const target = String(Math.round(price));
  const normalized = cleanText(title).toLowerCase();
  const dimension = new RegExp(`(?:^|[^0-9])${target}\\s*[xх×]\\s*\\d|\\d\\s*[xх×]\\s*${target}(?:[^0-9]|$)`, "i");
  return dimension.test(normalized);
}

export function suspiciousUnqualifiedPrice(title: string, rawPrice: string, parsedPrice: number | null) {
  if (parsedPrice === null || hasCurrencyMarker(rawPrice)) return false;
  if (titleContainsMatchingDimensionNumber(title, parsedPrice)) return true;

  // Extra guard for model/size-heavy titles: an unqualified numeric price equal to one of
  // several title numbers is more likely a size/model fragment than a real price.
  const titleNumbers = (cleanText(title).match(/\d+(?:[.,]\d+)?/g) || []).map(v => Number(v.replace(",", "."))).filter(Number.isFinite);
  if (titleNumbers.length >= 2 && titleNumbers.some(v => Math.round(v) === Math.round(parsedPrice))) return true;
  return false;
}
