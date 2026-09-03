/**
 * Emit everything the analysis step needs as one JSON document on stdout.
 * The routine prompt reads this and writes the report. Nothing here is
 * interpretation; it is data plus a few derived numbers.
 *
 * Usage: npm run context [-- --date 2026-09-03] > /tmp/ctx.json
 */
import { sql, closeDb } from "../src/lib/db.js";
import { addDays, todayHK } from "../src/lib/dates.js";

const argDate = process.argv.indexOf("--date");
const target = argDate > 0 ? process.argv[argDate + 1]! : todayHK();
const db = sql();

const daily = await db<{ trade_date: string; price: number; price_prev: number | null }[]>`
  select trade_date::text, price, price_prev from xishui_prices
  where weight_jin = 45 and trade_date >= ${addDays(target, -120)} and trade_date <= ${target}
  order by trade_date`;

const bandsToday = await db<{ weight_jin: number; price: number; price_prev: number | null }[]>`
  select weight_jin, price, price_prev from xishui_prices where trade_date = ${target} order by weight_jin desc`;

const bandsPrev = await db<{ weight_jin: number; price: number }[]>`
  select weight_jin, price from xishui_prices
  where trade_date = (select max(trade_date) from xishui_prices where trade_date < ${target}) order by weight_jin desc`;

const monthly = await db<{ ym: string; lo: number; hi: number; first: number; last: number }[]>`
  with m as (
    select to_char(trade_date, 'YYYY-MM') ym, trade_date, price from xishui_prices where weight_jin = 45 and trade_date <= ${target}
  )
  select ym, min(price) lo, max(price) hi,
    (array_agg(price order by trade_date))[1] first,
    (array_agg(price order by trade_date desc))[1] last
  from m group by ym order by ym`;

const regional = await db<{ trade_date: string; province: string; city: string; price: number; unit: string; trend: string }[]>`
  select trade_date::text, province, city, price::float, unit, trend from regional_quotes
  where trade_date >= ${addDays(target, -3)} and trade_date <= ${target}
  order by trade_date desc, province, city`;

const lastReport = await db<{ trade_date: string; report_md: string; zones: unknown }[]>`
  select trade_date::text, report_md, zones from reports where trade_date < ${target} order by trade_date desc limit 1`;

const p45 = daily.at(-1);
const gapDays: string[] = [];
for (let i = 1; i < daily.length; i++) {
  let d = addDays(daily[i - 1]!.trade_date, 1);
  while (d < daily[i]!.trade_date) { gapDays.push(d); d = addDays(d, 1); }
}

const ctx = {
  target_date: target,
  today_recorded: p45?.trade_date === target,
  xishui_45: {
    today: p45 ?? null,
    last_14: daily.slice(-14),
    last_120: daily,
    missing_dates_in_window: gapDays,
    monthly_structure: monthly,
  },
  weight_bands: { today: bandsToday, previous_day: bandsPrev },
  regional_last_3_days: regional,
  previous_report: lastReport[0] ?? null,
  farmio_cycle: {
    decision_days: ["Wednesday", "Saturday"],
    cycle_a: "Wed quote by 10:00 -> reply same day -> Fri delivery to Tsuen Wan",
    cycle_b: "Sat quote by 10:00-11:00 -> reply same day -> Mon delivery to Tsuen Wan",
    comfortable_holding_days: 14,
    max_exposure_days: [14, 21],
  },
};

process.stdout.write(JSON.stringify(ctx, null, 2));
await closeDb();
