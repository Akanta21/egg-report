/** Save a report as data/reports/YYYY-MM-DD.md. */
import { readFile } from "node:fs/promises";
import { todayHK } from "../src/lib/dates.js";
import { parseZones } from "../src/lib/report.js";
import { writeReport } from "../src/lib/store.js";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) throw new Error("report path required");
const dateIndex = args.indexOf("--date");
const target = dateIndex >= 0 ? args[dateIndex + 1]! : todayHK();
const markdown = await readFile(file, "utf8");
const zones = parseZones(markdown);
await writeReport(target, markdown);
console.log(`saved report for ${target}; zones=${JSON.stringify(zones)}`);
