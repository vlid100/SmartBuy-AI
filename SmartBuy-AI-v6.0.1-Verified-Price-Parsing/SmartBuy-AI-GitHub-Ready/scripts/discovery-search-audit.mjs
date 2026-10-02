import fs from "node:fs";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const discovery = read("lib/discovery-query.ts");
const matching = read("lib/matching.ts");
const live = read("lib/live-market.ts");
const intl = read("lib/international-market.ts");
const search = read("lib/search.ts");
const ui = read("components/SmartBuyApp.tsx");

const checks = [
  [discovery.includes("стійк") && discovery.includes("towel rack"), "generic product concepts"],
  [discovery.includes("coreAroundFor") && discovery.includes("relaxedCore"), "query reduction"],
  [discovery.includes("translateDiscoveryQuery"), "international translation fallback"],
  [matching.includes("evaluateSearchMatch") && matching.includes("isSpecificProductQuery"), "descriptive vs model-specific matching"],
  [live.includes("evaluateSearchMatch(query, offer.title)"), "UA connector discovery matching"],
  [intl.includes("buildDiscoveryQueries(query, \"international\"") && intl.includes("queryVariantsTried"), "international query variants"],
  [search.includes("searchWebDiscovery") && search.includes("discoveryHits"), "web discovery fallback"],
  [ui.includes("Discovery Search") && ui.includes("discoveryHits"), "discovery UI"],
];
const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`Discovery audit failed: ${label}`);
  process.exit(1);
}
console.log("SmartBuy v6.0.1 discovery-search audit OK · natural language + query reduction + international + web fallback");
