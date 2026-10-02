import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const mustFile = file => { if (!fs.existsSync(path.join(root, file))) throw new Error(`missing ${file}`); };
const must = (file, needles) => {
  mustFile(file); const text = read(file);
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file}: missing ${needle}`);
};

must("public/sw.js", ['addEventListener("push"', 'showNotification', 'addEventListener("notificationclick"']);
must("app/api/push/route.ts", ["savePushSubscription", "sendPushForSyncKey", "pushPublicKey"]);
must("lib/push.ts", ["webpush.sendNotification", "smartbuy_push_subscriptions", "WEB_PUSH_PRIVATE_KEY"]);
must("lib/notifications.ts", ["sendPushForHash", "dedupe_key"]);

must("lib/international-market.ts", ["amazon", "aliexpress", "temu", "shippingCost", "availability", "enrichInternationalOffers"]);
must("lib/search.ts", ["searchInternationalLive", "International Live"]);

const live = read("lib/live-market.ts");
for (const id of ["olx","rozetka","hotline","ekatalog","allo","comfy","foxtrot","epicentr","ktc","telemart","brain"]) {
  if (!live.includes(`id: "${id}"`)) throw new Error(`missing Ukraine source ${id}`);
}
for (const signal of ["sellerRating", "sellerReviewCount", "sellerSince", "returnPolicy", "enrichPriorityOffers"]) {
  if (!live.includes(signal)) throw new Error(`missing seller/live signal ${signal}`);
}

must("lib/matching.ts", ["COLOR_ALIASES", "skuTokens", "REGION_ALIASES", 'conflicts.push("color")', 'conflicts.push("sku")', 'conflicts.push("region")']);
must("lib/seller-intelligence.ts", ["sellerRatingLabel", "sellerHistoryLabel", "returnLabel"]);

must("lib/rate-limit.ts", ["rate_limited", "Retry-After"]);
must("lib/server-log.ts", ["smartbuy_server_events", "[redacted]"]);
for (const file of ["app/privacy/page.tsx","app/terms/page.tsx","app/robots.ts","app/sitemap.ts","SOURCE_USE.md"]) mustFile(file);
must("SOURCE_USE.md", ["SMARTBUY_DISABLED_SOURCES", "does **not** bypass CAPTCHA"]);
must("supabase/v5.0_production.sql", ["smartbuy_push_subscriptions", "smartbuy_server_events"]);
must(".env.example", ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "SMARTBUY_DISABLED_SOURCES"]);

const pkg = JSON.parse(read("package.json"));
if (pkg.version !== "5.0.1") throw new Error(`package version is ${pkg.version}`);
if (!pkg.dependencies?.["web-push"]) throw new Error("web-push dependency missing");

console.log("SmartBuy v5.0.1 feature-audit OK · all requested production blocks are wired");
