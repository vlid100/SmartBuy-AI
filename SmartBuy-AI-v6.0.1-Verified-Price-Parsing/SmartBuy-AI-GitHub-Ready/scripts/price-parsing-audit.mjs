import { parsePriceValue, suspiciousUnqualifiedPrice } from "../lib/price-parser.ts";

const cases = [
  ["Sonnet 5/450x400 + стійка 30x30. Україна", "context", null],
  ["Sonnet 10/950x500", "context", null],
  ["Elite 6/650x500", "context", null],
  ["Sonnet 5/450x400 — 4 927 ₴", "context", 4927],
  ["4 927 ₴", "price-node", 4927],
  ["4927", "price-node", 4927],
  ["450x400", "price-node", null],
  ["4.927", "structured", 4927],
  ["4 927,00 грн", "context", 4927],
  ["985 грн × 5", "context", 985],
];
for (const [value, mode, expected] of cases) {
  const actual = parsePriceValue(value, mode);
  if (actual !== expected) throw new Error(`${mode}: ${value} -> ${actual}, expected ${expected}`);
}
if (!suspiciousUnqualifiedPrice("Sonnet 5/450x400", "450", 450)) throw new Error("dimension number 450 must be suspicious");
if (!suspiciousUnqualifiedPrice("Sonnet 10/950x500", "10", 10)) throw new Error("model number 10 must be suspicious");
if (suspiciousUnqualifiedPrice("Sonnet 5/450x400", "4927", 4927)) throw new Error("real unrelated price 4927 must not be suspicious");

console.log("SmartBuy v6.0.1 price-parsing audit OK · dimensions/model numbers cannot become prices");
