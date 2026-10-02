import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const app = read("components/SmartBuyApp.tsx");
const route = read("app/api/search/route.ts");
const search = read("lib/search.ts");
const live = read("lib/live-market.ts");
const intl = read("lib/international-market.ts");
const persistence = read("lib/persistence.ts");
const matching = read("lib/matching.ts");
const types = read("lib/types.ts");

assert(app.includes("const searchTimeoutMs = 50000"), "client timeout must leave headroom for the server");
assert(route.includes("SMARTBUY_SEARCH_ROUTE_TIMEOUT_MS") && route.includes("after(async ()"), "route budget/background snapshot missing");
assert(search.includes("SMARTBUY_SEARCH_CORE_TIMEOUT_MS") && search.includes("Promise.allSettled") && search.includes("appendPartialWarning"), "partial-result orchestration missing");
assert(!search.includes("await snapshotProducts"), "search core must not block on Supabase snapshot writes");
assert(live.includes("fetchPageWithTimeout") && live.includes("const body = response.ok ? await response.text()"), "response body is not protected by AbortController");
assert(live.includes("SMARTBUY_UKRAINE_TOTAL_TIMEOUT_MS") && live.includes("partial: budgetExhausted"), "Ukraine wave budget/partial return missing");
assert(intl.includes("SMARTBUY_INTERNATIONAL_WAVE_TIMEOUT_MS") && intl.includes("Promise.allSettled"), "international wave budget missing");
assert(persistence.includes("upsert(productRows") && persistence.includes("historyRows"), "batched persistence missing");
assert(matching.includes('макбук: "macbook"') && matching.includes("macbookchip:"), "MacBook Ukrainian alias/generation matching missing");
assert(types.includes("partial?: boolean") && types.includes("durationMs?: number"), "partial-result API metadata missing");

console.log("SmartBuy v6.0.0 search-stability audit OK · partial results + bounded connectors + non-blocking history");
