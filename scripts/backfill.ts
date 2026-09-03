/**
 * One-time history load. Walks the listing back to --from and stores every
 * 浠水 table it finds. Regional 快报 are skipped by default (add --regional).
 *
 * Usage: npm run backfill -- --from 2026-01-01 [--regional]
 */
import { sql, closeDb } from "../src/lib/db.js";
import { todayHK } from "../src/lib/dates.js";
import { discover, fetchHtml, parseRegional, parseXishui } from "../src/lib/jbzyw.js";

const i = process.argv.indexOf("--from");
if (i < 0) throw new Error("--from YYYY-MM-DD required");
const from = process.argv[i + 1]!;
const withRegional = process.argv.includes("--regional");
const today = todayHK();

const entries = await discover(from, today, 400);
const db = sql();
let n = 0;

for (const e of entries.filter((x) => x.kind === "xishui")) {
  const art = parseXishui(await fetchHtml(e.url), e.date);
  if (!art.p45) { console.warn(`skip (no 45): ${e.url}`); continue; }
  await db`insert into xishui_prices ${db(
    art.rows.map((r) => ({ trade_date: art.date, weight_jin: r.weightJin, price: r.price, price_prev: r.pricePrev, source_url: e.url })),
    "trade_date", "weight_jin", "price", "price_prev", "source_url",
  )} on conflict (trade_date, weight_jin) do nothing`;
  n++;
  if (n % 20 === 0) console.log(`${n} days done, at ${art.date}`);
  await new Promise((r) => setTimeout(r, 400));
}

if (withRegional) {
  for (const e of entries.filter((x) => x.kind === "regional")) {
    const quotes = parseRegional(await fetchHtml(e.url));
    if (!quotes.length) continue;
    await db`insert into regional_quotes ${db(
      quotes.map((q) => ({ trade_date: e.date, province: e.region ?? "?", city: q.city, price: q.price, unit: q.unit, trend: q.trend, raw: q.raw, source_url: e.url })),
      "trade_date", "province", "city", "price", "unit", "trend", "raw", "source_url",
    )} on conflict do nothing`;
    await new Promise((r) => setTimeout(r, 400));
  }
}

console.log(`backfill complete: ${n} 浠水 days`);
await closeDb();
