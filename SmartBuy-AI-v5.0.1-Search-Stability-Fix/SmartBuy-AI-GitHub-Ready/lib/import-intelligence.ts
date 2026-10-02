import type { Offer, Product } from "./types";
import { evaluateTitleMatch, productIdentityMeta } from "./matching";

export type ImportedProductGroup = {
  id: string;
  productIds: string[];
  label: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  spread: number;
  sourceNames: string[];
  exactIdentity: boolean;
};

export type ImportedVariantConflict = {
  leftId: string;
  rightId: string;
  leftTitle: string;
  rightTitle: string;
  conflicts: string[];
  message: string;
};

export type BatchImportInsight = {
  productCount: number;
  groupedCount: number;
  groups: ImportedProductGroup[];
  variantConflicts: ImportedVariantConflict[];
  summary: string;
};

function productSources(product: Product) {
  const names = new Set<string>();
  for (const offer of product.offers || []) {
    if (offer.marketplace) names.add(offer.marketplace);
    else if (offer.store) names.add(offer.store);
  }
  if (!names.size && product.source) names.add(product.source);
  return [...names];
}

function sameImportedVariant(left: Product, right: Product) {
  const leftIdentity = productIdentityMeta(left.title);
  const rightIdentity = productIdentityMeta(right.title);
  if (leftIdentity.key && rightIdentity.key && leftIdentity.key === rightIdentity.key) return { same: true, exact: true };
  const match = evaluateTitleMatch(left.title, right.title);
  return { same: match.reliable, exact: false };
}

function variantConflictMessage(conflicts: string[]) {
  const labels: Record<string, string> = {
    storage: "різна пам’ять",
    ram: "різна оперативна пам’ять",
    variant: "різна версія моделі",
    generation: "різне покоління",
  };
  const readable = conflicts.filter(key => labels[key]).map(key => labels[key]);
  return readable.length ? readable.join(" · ") : "схожі назви, але модифікації відрізняються";
}

export function analyzeImportedProducts(products: Product[]): BatchImportInsight {
  const safe = products.filter(Boolean);
  const buckets: { products: Product[]; exactIdentity: boolean }[] = [];

  for (const product of safe) {
    let target: { products: Product[]; exactIdentity: boolean } | undefined;
    let exact = false;
    for (const bucket of buckets) {
      const verdict = sameImportedVariant(bucket.products[0], product);
      if (verdict.same) {
        target = bucket;
        exact = verdict.exact;
        break;
      }
    }
    if (target) {
      target.products.push(product);
      target.exactIdentity = target.exactIdentity && exact;
    } else {
      buckets.push({ products: [product], exactIdentity: Boolean(productIdentityMeta(product.title).key) });
    }
  }

  const groups: ImportedProductGroup[] = buckets.map((bucket, index) => {
    const prices = bucket.products.map(product => Number(product.bestPrice)).filter(price => Number.isFinite(price) && price > 0);
    const sourceNames = new Set<string>();
    for (const product of bucket.products) for (const name of productSources(product)) sourceNames.add(name);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    return {
      id: `import-group-${index + 1}`,
      productIds: bucket.products.map(product => product.id),
      label: productIdentityMeta(bucket.products[0]?.title || "").label,
      count: bucket.products.length,
      minPrice,
      maxPrice,
      spread: Math.max(0, maxPrice - minPrice),
      sourceNames: [...sourceNames],
      exactIdentity: bucket.exactIdentity,
    };
  });

  const variantConflicts: ImportedVariantConflict[] = [];
  const conflictFingerprints = new Set<string>();
  for (let i = 0; i < safe.length; i++) {
    for (let j = i + 1; j < safe.length; j++) {
      const left = safe[i];
      const right = safe[j];
      const match = evaluateTitleMatch(left.title, right.title);
      const relevantConflicts = match.conflicts.filter(key => ["storage", "ram", "variant", "generation"].includes(key));
      const unrelated = match.conflicts.includes("brand") || match.conflicts.includes("model") || match.conflicts.includes("accessory") || match.conflicts.includes("counterfeit");
      if (!match.reliable && !unrelated && relevantConflicts.length && match.sharedTokens >= 2) {
        const identities = [productIdentityMeta(left.title).label, productIdentityMeta(right.title).label].sort();
        const fingerprint = `${identities.join("::")}::${[...relevantConflicts].sort().join(",")}`;
        if (conflictFingerprints.has(fingerprint)) continue;
        conflictFingerprints.add(fingerprint);
        variantConflicts.push({
          leftId: left.id,
          rightId: right.id,
          leftTitle: left.title,
          rightTitle: right.title,
          conflicts: relevantConflicts,
          message: variantConflictMessage(relevantConflicts),
        });
      }
    }
  }

  const groupedCount = groups.filter(group => group.count > 1).reduce((sum, group) => sum + group.count, 0);
  const summary = groupedCount > 1
    ? `SmartBuy знайшов ${groups.filter(group => group.count > 1).length} ${groups.filter(group => group.count > 1).length === 1 ? "групу" : "групи"} однакових модифікацій. Їх можна об’єднати й порівнювати продавців як один товар.`
    : variantConflicts.length
      ? "Посилання схожі, але частина модифікацій відрізняється. Перевір пам’ять, версію та покоління перед порівнянням ціни."
      : "SmartBuy не знайшов посилань, які безпечно можна об’єднати як одну модифікацію.";

  return { productCount: safe.length, groupedCount, groups, variantConflicts, summary };
}

function offerKey(offer: Offer) {
  return offer.url || `${offer.marketplace}|${offer.store}|${offer.price}|${offer.title || ""}`;
}

export function mergeImportedProductGroup(products: Product[]): Product | null {
  const safe = products.filter(Boolean);
  if (!safe.length) return null;
  const base = [...safe].sort((a, b) => a.bestPrice - b.bestPrice)[0];
  const offerMap = new Map<string, Offer>();
  for (const product of safe) {
    for (const offer of product.offers || []) {
      const key = offerKey(offer);
      const previous = offerMap.get(key);
      if (!previous || offer.price < previous.price) offerMap.set(key, offer);
    }
  }
  const offers = [...offerMap.values()].sort((a, b) => a.price - b.price);
  const bestPrice = offers.length ? Math.min(...offers.map(offer => offer.price)) : Math.min(...safe.map(product => product.bestPrice));
  const sourceNames = [...new Set(offers.map(offer => offer.marketplace || offer.store).filter(Boolean))];
  const identity = productIdentityMeta(base.title);
  return {
    ...base,
    id: `import-merged-${identity.key || base.id}-${Date.now()}`.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180),
    bestPrice,
    offers,
    source: sourceNames.length ? sourceNames.join(" + ") : base.source,
    productUrl: offers[0]?.url || base.productUrl,
    highlights: [
      `Об’єднано ${safe.length} пропозиції з ${Math.max(sourceNames.length, 1)} джерел`,
      ...base.highlights.filter(item => !item.toLowerCase().includes("імпорт")),
    ].slice(0, 5),
    aiSummary: `SmartBuy підтвердив, що ці ${safe.length} посилання відповідають одній модифікації (${identity.label}). Пропозиції об’єднані в один товар, щоб порівнювати продавців і ціну без змішування різних версій.`,
  };
}
