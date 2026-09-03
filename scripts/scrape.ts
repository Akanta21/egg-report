/** Scrape the target window and persist verified prices. */
import { addDays, todayHK } from "../src/lib/dates.js";
import { discover, fetchHtml, parseRegional, parseXishui } from "../src/lib/jbzyw.js";
import { readRegional, readXishui, writeJson, regionalPath, xishuiPath, type StoredRegionalQuote, type StoredXishuiRow } from "../src/lib/store.js";

const args = process.argv.slice(2);
const dateIndex = args.indexOf("--date");
const target = dateIndex >= 0 ? args[dateIndex + 1]! : todayHK();
const existing = await readXishui<Record<string, StoredXishuiRow[]>>();
const lastDate = Object.keys(existing).filter((date) => existing[date]?.some((row) => row.weight_jin === 45)).sort().at(-1) ?? null;
const from = lastDate ? addDays(lastDate, 1) : addDays(target, -14);
const windowStart = from < addDays(target, -14) ? addDays(target, -14) : from;
console.log(`target=${target} last_recorded=${lastDate ?? "none"} filling_from=${windowStart}`);
const entries = await discover(windowStart, target);
const xishuiEntries = entries.filter((entry) => entry.kind === "xishui" && entry.date <= target);
const regionalEntries = entries.filter((entry) => entry.kind === "regional" && entry.date <= target);
console.log(`found ${xishuiEntries.length} 浠水 articles, ${regionalEntries.length} regional 快报 in window`);
let todayRecorded = existing[target]?.some((row) => row.weight_jin === 45) ?? false;
for (const entry of xishuiEntries.sort((a, b) => a.date.localeCompare(b.date))) {
  const article = parseXishui(await fetchHtml(entry.url), target);
  if (!article.p45) { console.warn(`no 45斤 row parsed at ${entry.url}`); continue; }
  const rows = article.rows.map((row): StoredXishuiRow => ({ weight_jin: row.weightJin, price: row.price, price_prev: row.pricePrev, source_url: entry.url }));
  existing[article.date] = rows;
  console.log(`浠水 ${article.date}: 45斤=${article.p45.price} (prev ${article.p45.pricePrev ?? "?"}), ${rows.length} bands`);
  if (article.date === target) todayRecorded = true;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
const regional = await readRegional<Record<string, StoredRegionalQuote[]>>();
for (const entry of regionalEntries) {
  const quotes = parseRegional(await fetchHtml(entry.url));
  if (!quotes.length) { console.warn(`no quotes parsed: ${entry.title} ${entry.url}`); continue; }
  const prior = regional[entry.date] ?? [];
  const byKey = new Map(prior.map((quote) => [`${quote.province}|${quote.city}|${quote.unit}`, quote]));
  for (const quote of quotes) byKey.set(`${entry.region ?? "?"}|${quote.city}|${quote.unit}`, { province: entry.region ?? "?", ...quote, source_url: entry.url });
  regional[entry.date] = [...byKey.values()];
  console.log(`${entry.date} ${entry.region}: ${quotes.length} quotes`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}
// Regional first; xishui.json is the checkpoint that advances last_recorded, so it goes last.
await writeJson(regionalPath(), regional);
await writeJson(xishuiPath(), existing);
if (!todayRecorded) { console.error(`NO VERIFIED 浠水45斤 PRICE FOR ${target}. Leave the gap. Do not estimate.`); process.exitCode = 2; }
