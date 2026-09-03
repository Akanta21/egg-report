/**
 * Scrape today's 浠水 table and all regional 快报 for the target date.
 * Also fills any gap since the last recorded date (up to 14 days back).
 *
 * Exit codes:
 *   0  today's 浠水45斤 price recorded
 *   2  no verifiable 浠水 price for today (do not backfill, do not guess)
 *   1  unexpected error
 *
 * Usage: npm run scrape [-- --date 2026-09-03]
 */
import { sql, closeDb } from "../src/lib/db.js";
import { addDays, todayHK } from "../src/lib/dates.js";
import { discover, fetchHtml, parseRegional, parseXishui, type ListingEntry } from "../src/lib/jbzyw.js";

const argDate = process.argv.indexOf("--date");
const target = argDate > 0 ? process.argv[argDate + 1]! : todayHK();

const db = sql();
const last = await db<{ d: string | null }[]>`select max(trade_date)::text as d from xishui_prices where weight_jin = 45`;
const lastDate = last[0]?.d ?? null;
const oldest = lastDate ? addDays(lastDate, 1) : addDays(target, -14);
const from = oldest < addDays(target, -14) ? addDays(target, -14) : oldest;

console.log(`target=${target} last_recorded=${lastDate ?? "none"} filling_from=${from}`);

const entries = await discover(from, target);
const xishui = entries.filter((e) => e.kind === "xishui" && e.date <= target);
const regional = entries.filter((e) => e.kind === "regional" && e.date <= target);
console.log(`found ${xishui.length} 浠水 articles, ${regional.length} regional 快报 in window`);

let todayRecorded = false;

for (const e of xishui.sort((a, b) => a.date.localeCompare(b.date))) {
  const art = parseXishui(await fetchHtml(e.url), target);
  if (art.date !== e.date) console.warn(`date mismatch title=${e.date} page=${art.date} ${e.url}`);
  if (!art.p45) {
    console.warn(`no 45斤 row parsed at ${e.url}`);
    continue;
  }
  await db`
    insert into xishui_prices ${db(
      art.rows.map((r) => ({ trade_date: art.date, weight_jin: r.weightJin, price: r.price, price_prev: r.pricePrev, source_url: e.url })),
      "trade_date", "weight_jin", "price", "price_prev", "source_url",
    )}
    on conflict (trade_date, weight_jin) do update set price = excluded.price, price_prev = excluded.price_prev, source_url = excluded.source_url, scraped_at = now()`;
  console.log(`浠水 ${art.date}: 45斤=${art.p45.price} (prev ${art.p45.pricePrev ?? "?"}), ${art.rows.length} bands`);
  if (art.date === target) todayRecorded = true;
  await new Promise((r) => setTimeout(r, 300));
}

for (const e of regional) {
  const quotes = parseRegional(await fetchHtml(e.url));
  if (quotes.length === 0) {
    console.warn(`no quotes parsed: ${e.title} ${e.url}`);
    continue;
  }
  await db`
    insert into regional_quotes ${db(
      quotes.map((q) => ({ trade_date: e.date, province: e.region ?? "?", city: q.city, price: q.price, unit: q.unit, trend: q.trend, raw: q.raw, source_url: e.url })),
      "trade_date", "province", "city", "price", "unit", "trend", "raw", "source_url",
    )}
    on conflict (trade_date, province, city, unit) do update set price = excluded.price, trend = excluded.trend, raw = excluded.raw, scraped_at = now()`;
  console.log(`${e.date} ${e.region}: ${quotes.length} quotes`);
  await new Promise((r) => setTimeout(r, 300));
}

await closeDb();

if (!todayRecorded) {
  console.error(`NO VERIFIED 浠水45斤 PRICE FOR ${target}. Leave the gap. Do not estimate.`);
  process.exit(2);
}
