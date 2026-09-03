/** One-time history load for Xishui, with optional regional quotes. */
import { todayHK } from "../src/lib/dates.js";
import { discover, fetchHtml, parseRegional, parseXishui } from "../src/lib/jbzyw.js";
import { readRegional, readXishui, writeJson, regionalPath, xishuiPath, type StoredRegionalQuote, type StoredXishuiRow } from "../src/lib/store.js";

const fromIndex = process.argv.indexOf("--from");
if (fromIndex < 0 || !process.argv[fromIndex + 1]) throw new Error("--from YYYY-MM-DD required");
const from = process.argv[fromIndex + 1]!;
const withRegional = process.argv.includes("--regional");
const entries = await discover(from, todayHK(), 400);
const xishui = await readXishui<Record<string, StoredXishuiRow[]>>();
let count = 0;
for (const entry of entries.filter((item) => item.kind === "xishui")) {
  const article = parseXishui(await fetchHtml(entry.url), entry.date);
  if (!article.p45) { console.warn(`skip (no 45): ${entry.url}`); continue; }
  if (!xishui[article.date]) xishui[article.date] = article.rows.map((row) => ({ weight_jin: row.weightJin, price: row.price, price_prev: row.pricePrev, source_url: entry.url }));
  count++;
  if (count % 20 === 0) console.log(`${count} days done, at ${article.date}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
}
await writeJson(xishuiPath(), xishui);
if (withRegional) {
  const regional = await readRegional<Record<string, StoredRegionalQuote[]>>();
  for (const entry of entries.filter((item) => item.kind === "regional")) {
    const quotes = parseRegional(await fetchHtml(entry.url));
    if (!quotes.length) continue;
    const prior = regional[entry.date] ?? [];
    const keys = new Set(prior.map((quote) => `${quote.province}|${quote.city}|${quote.unit}`));
    regional[entry.date] = [...prior, ...quotes.filter((quote) => !keys.has(`${entry.region ?? "?"}|${quote.city}|${quote.unit}`)).map((quote) => ({ province: entry.region ?? "?", ...quote, source_url: entry.url }))];
    await writeJson(regionalPath(), regional);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
console.log(`backfill complete: ${count} 浠水 days`);
