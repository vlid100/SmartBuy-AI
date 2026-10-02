import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'app/page.tsx',
  'app/api/search/route.ts',
  'app/api/health/route.ts',
  'app/api/diagnostics/route.ts',
  'app/api/cron/track-prices/route.ts',
  'components/SmartBuyApp.tsx',
  'components/PwaManager.tsx',
  'lib/live-market.ts',
  'lib/price-parser.ts',
  'lib/international-market.ts',
  'lib/matching.ts',
  'lib/source-router.ts',
  'lib/query-expansion.ts',
  'lib/discovery-query.ts',
  'lib/web-discovery.ts',
  'lib/source-capabilities.ts',
  'app/api/source-capabilities/route.ts',
  'app/api/import-product/route.ts',
  'app/api/import-products/route.ts',
  'lib/product-import.ts',
  'lib/import-intelligence.ts',
  'lib/offer-decision.ts',
  'lib/fair-price.ts',
  'lib/diagnostics.ts',
  'public/sw.js',
  'lib/push.ts',
  'app/api/push/route.ts',
  'lib/rate-limit.ts',
  'lib/server-log.ts',
  'app/privacy/page.tsx',
  'app/terms/page.tsx',
  'app/robots.ts',
  'app/sitemap.ts',
  'supabase/v5.0_production.sql',
  'supabase/update_to_latest.sql',
  'scripts/search-stability-audit.mjs',
  'scripts/price-parsing-audit.mjs',
  'vercel.json',
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('SmartBuy smoke-check: missing required files:');
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '6.0.1') {
  console.error(`SmartBuy smoke-check: package version must be 6.0.1, got ${pkg.version}`);
  process.exit(1);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const cronPaths = new Set((vercel.crons || []).map(item => item.path));
if (!cronPaths.has('/api/cron/track-prices')) {
  console.error('SmartBuy smoke-check: price tracking cron is missing from vercel.json');
  process.exit(1);
}


const typesSource = fs.readFileSync(path.join(root, 'lib/types.ts'), 'utf8');
const registrySource = fs.readFileSync(path.join(root, 'lib/source-registry.ts'), 'utf8');
const importRouteSource = fs.readFileSync(path.join(root, 'app/api/import-product/route.ts'), 'utf8');
const batchImportRouteSource = fs.readFileSync(path.join(root, 'app/api/import-products/route.ts'), 'utf8');
const importIntelligenceSource = fs.readFileSync(path.join(root, 'lib/import-intelligence.ts'), 'utf8');
const offerDecisionSource = fs.readFileSync(path.join(root, 'lib/offer-decision.ts'), 'utf8');
const fairPriceSource = fs.readFileSync(path.join(root, 'lib/fair-price.ts'), 'utf8');
const internationalSource = fs.readFileSync(path.join(root, 'lib/international-market.ts'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const pushSource = fs.readFileSync(path.join(root, 'lib/push.ts'), 'utf8');
if (!typesSource.includes('\"assistedImport\"') || !typesSource.includes('ProductBatchImportResponse') || !registrySource.includes('identifySourceUrl') || !importRouteSource.includes('importProductFromUrl') || !batchImportRouteSource.includes('Promise.allSettled') || !importIntelligenceSource.includes('mergeImportedProductGroup') || !offerDecisionSource.includes('rankOfferDecisions') || !fairPriceSource.includes('buildFairPriceInsight') || !fairPriceSource.includes('positionAgainstFairPrice') || !internationalSource.includes('searchInternationalLive') || !serviceWorkerSource.includes('notificationclick') || !serviceWorkerSource.includes('addEventListener(\"push\"') || !pushSource.includes('sendPushForHash')) {
  console.error('SmartBuy smoke-check: v5.0 market / push / production wiring is incomplete.');
  process.exit(1);
}


const appSource = fs.readFileSync(path.join(root, 'components/SmartBuyApp.tsx'), 'utf8');
const liveMarketSource = fs.readFileSync(path.join(root, 'lib/live-market.ts'), 'utf8');
const searchSource = fs.readFileSync(path.join(root, 'lib/search.ts'), 'utf8');
const persistenceSource = fs.readFileSync(path.join(root, 'lib/persistence.ts'), 'utf8');
const matchingSource = fs.readFileSync(path.join(root, 'lib/matching.ts'), 'utf8');
const priceParserSource = fs.readFileSync(path.join(root, 'lib/price-parser.ts'), 'utf8');
const searchRouteSource = fs.readFileSync(path.join(root, 'app/api/search/route.ts'), 'utf8');
if (!appSource.includes('const searchTimeoutMs = 50000') || !appSource.includes('setCoverage({ totalOffers: 0') || !liveMarketSource.includes('fetchPageWithTimeout') || !liveMarketSource.includes('suspiciousUnqualifiedPrice') || !priceParserSource.includes('mode === "context"') || !priceParserSource.includes('titleContainsMatchingDimensionNumber') || !liveMarketSource.includes('SMARTBUY_UKRAINE_TOTAL_TIMEOUT_MS') || !internationalSource.includes('SMARTBUY_INTERNATIONAL_WAVE_TIMEOUT_MS') || !searchSource.includes('Promise.allSettled') || searchSource.includes('await snapshotProducts') || !persistenceSource.includes('upsert(productRows') || !matchingSource.includes('макбук: "macbook"') || !searchRouteSource.includes('after(async ()') || !searchRouteSource.includes('SMARTBUY_SEARCH_ROUTE_TIMEOUT_MS') || !searchRouteSource.includes('export const maxDuration = 45')) {
  console.error('SmartBuy smoke-check: v6.0.1 partial-results / timeout guards are incomplete.');
  process.exit(1);
}

for (const forbidden of ['.env', '.env.local', '.env.production']) {
  if (fs.existsSync(path.join(root, forbidden))) {
    console.error(`SmartBuy smoke-check: ${forbidden} must not be committed.`);
    process.exit(1);
  }
}

console.log(`SmartBuy smoke-check OK · v${pkg.version} · ${required.length} critical files present`);
