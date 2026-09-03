/** Emit the deterministic JSON context consumed by the analysis prompt. */
import { addDays, todayHK } from "../src/lib/dates.js";
import { parseZones } from "../src/lib/report.js";
import { readRegional, readReport, readXishui, reportDates, type StoredRegionalQuote, type StoredXishuiRow } from "../src/lib/store.js";

type Xishui = Record<string, StoredXishuiRow[]>;
type Regional = Record<string, StoredRegionalQuote[]>;
const args = process.argv.slice(2);
const dateIndex = args.indexOf("--date");
const target = dateIndex >= 0 ? args[dateIndex + 1]! : todayHK();
const xishui = await readXishui<Xishui>();
const regional = await readRegional<Regional>();
const allDates = Object.keys(xishui).filter((date) => date <= target).sort();
const dates = allDates.filter((date) => date >= addDays(target, -120));
const daily = dates.flatMap((date) => {
  const row = xishui[date]?.find((item) => item.weight_jin === 45);
  return row ? [{ trade_date: date, price: row.price, price_prev: row.price_prev }] : [];
});
const byWeightDesc = (a: { weight_jin: number }, b: { weight_jin: number }) => b.weight_jin - a.weight_jin;
const todayRows = (xishui[target] ?? []).sort(byWeightDesc);
const previousDate = allDates.filter((date) => date < target).at(-1);
const previousRows = (previousDate ? xishui[previousDate] ?? [] : []).sort(byWeightDesc);
const monthly = new Map<string, { ym: string; lo: number; hi: number; first: number; last: number }>();
for (const date of allDates) {
  const row = xishui[date]?.find((item) => item.weight_jin === 45);
  if (!row) continue;
  const item = { trade_date: date, price: row.price };
  const ym = item.trade_date.slice(0, 7);
  const current = monthly.get(ym);
  if (!current) monthly.set(ym, { ym, lo: item.price, hi: item.price, first: item.price, last: item.price });
  else { current.lo = Math.min(current.lo, item.price); current.hi = Math.max(current.hi, item.price); current.last = item.price; }
}
const gapDays: string[] = [];
for (let i = 1; i < daily.length; i++) for (let date = addDays(daily[i - 1]!.trade_date, 1); date < daily[i]!.trade_date; date = addDays(date, 1)) gapDays.push(date);
let previousReport: { trade_date: string; report_md: string; zones: ReturnType<typeof parseZones> } | null = null;
for (const date of (await reportDates()).filter((value) => value < target).reverse()) {
  const markdown = await readReport(date);
  if (markdown !== null) { previousReport = { trade_date: date, report_md: markdown, zones: parseZones(markdown) }; break; }
}
const regionalLast3 = Object.keys(regional).filter((date) => date >= addDays(target, -3) && date <= target).sort().reverse().flatMap((date) => [...(regional[date] ?? [])].sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city)).map((quote) => ({ trade_date: date, province: quote.province, city: quote.city, price: quote.price, unit: quote.unit, trend: quote.trend })));
const today45 = daily.at(-1) ?? null;
const ctx = {
  target_date: target,
  today_recorded: today45?.trade_date === target,
  xishui_45: { today: today45, last_14: daily.slice(-14), last_120: daily, missing_dates_in_window: gapDays, monthly_structure: [...monthly.values()] },
  weight_bands: { today: todayRows.map(({ weight_jin, price, price_prev }) => ({ weight_jin, price, price_prev })), previous_day: previousRows.map(({ weight_jin, price }) => ({ weight_jin, price })) },
  regional_last_3_days: regionalLast3,
  previous_report: previousReport,
  farmio_cycle: { decision_days: ["Wednesday", "Saturday"], cycle_a: "Wed quote by 10:00 -> reply same day -> Fri delivery to Tsuen Wan", cycle_b: "Sat quote by 10:00-11:00 -> reply same day -> Mon delivery to Tsuen Wan", comfortable_holding_days: 14, max_exposure_days: [14, 21] },
};
process.stdout.write(JSON.stringify(ctx, null, 2));
