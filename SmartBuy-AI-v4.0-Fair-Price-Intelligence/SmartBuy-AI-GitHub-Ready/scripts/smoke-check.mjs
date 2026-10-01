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
  'lib/matching.ts',
  'lib/source-router.ts',
  'lib/query-expansion.ts',
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
  'supabase/update_to_latest.sql',
  'vercel.json',
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('SmartBuy smoke-check: missing required files:');
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '4.0.0') {
  console.error(`SmartBuy smoke-check: package version must be 4.0.0, got ${pkg.version}`);
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
if (!typesSource.includes('\"assistedImport\"') || !typesSource.includes('ProductBatchImportResponse') || !registrySource.includes('identifySourceUrl') || !importRouteSource.includes('importProductFromUrl') || !batchImportRouteSource.includes('Promise.allSettled') || !importIntelligenceSource.includes('mergeImportedProductGroup') || !offerDecisionSource.includes('rankOfferDecisions') || !fairPriceSource.includes('buildFairPriceInsight') || !fairPriceSource.includes('positionAgainstFairPrice')) {
  console.error('SmartBuy smoke-check: v4.0 Fair Price / decision / import wiring is incomplete.');
  process.exit(1);
}

for (const forbidden of ['.env', '.env.local', '.env.production']) {
  if (fs.existsSync(path.join(root, forbidden))) {
    console.error(`SmartBuy smoke-check: ${forbidden} must not be committed.`);
    process.exit(1);
  }
}

console.log(`SmartBuy smoke-check OK · v${pkg.version} · ${required.length} critical files present`);
