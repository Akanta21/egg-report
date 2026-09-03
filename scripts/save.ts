/**
 * Persist today's report and the support/resistance zones it names, so
 * tomorrow's run can answer "what changed since yesterday".
 *
 * Usage: npm run save -- /tmp/report.md [--date 2026-09-03]
 */
import { readFile } from "node:fs/promises";
import { sql, closeDb } from "../src/lib/db.js";
import { todayHK } from "../src/lib/dates.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("report path required");
const argDate = args.indexOf("--date");
const target = argDate >= 0 ? args[argDate + 1]! : todayHK();

const md = await readFile(file, "utf8");

function zones(label: RegExp): number[][] {
  const out: number[][] = [];
  for (const m of md.matchAll(new RegExp(`${label.source}[：:]\\s*([^\\n]+)`, "g"))) {
    for (const r of m[1]!.matchAll(/(\d{3})\s*[–\-~至]\s*(\d{3})/g)) out.push([Number(r[1]), Number(r[2])]);
  }
  return out;
}

const z = { support: zones(/支持位/), resistance: zones(/阻力位/) };
await sql()`
  insert into reports (trade_date, report_md, zones) values (${target}, ${md}, ${JSON.stringify(z)}::jsonb)
  on conflict (trade_date) do update set report_md = excluded.report_md, zones = excluded.zones, created_at = now()`;
console.log(`saved report for ${target}; zones=${JSON.stringify(z)}`);
await closeDb();
