/**
 * Deliver a report to WhatsApp (Whapi) and Slack.
 *
 * Usage:
 *   npm run send -- /tmp/report.md
 *   npm run send -- --no-data          # posts a short "no verified price today" notice
 *   npm run send -- /tmp/report.md --dry
 */
import { readFile } from "node:fs/promises";
import { env } from "../src/lib/env.js";
import { postSlack } from "../src/lib/slack.js";
import { health, sendText } from "../src/lib/whapi.js";
import { splitForWhatsApp, toChatMarkup } from "../src/lib/whatsapp.js";
import { todayHK } from "../src/lib/dates.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const noData = args.includes("--no-data");
const file = args.find((a) => !a.startsWith("--"));

let text: string;
if (noData) {
  const [y, m, d] = todayHK().split("-");
  text = `🥚 *浠水45斤雞蛋 Update｜${Number(d)}/${Number(m)}*\n\n今日 jbzyw 未有可核實嘅浠水正式報價，唔作估算。\n明日會嘗試以「昨日價」補回。\n採購建議與上一個 Update 相同。`;
} else {
  if (!file) throw new Error("report path required, or --no-data");
  text = toChatMarkup(await readFile(file, "utf8"));
}

const parts = splitForWhatsApp(text);
console.log(`message: ${text.length} chars, ${parts.length} part(s)`);

if (dry) {
  console.log("--- DRY RUN ---\n" + parts.join("\n\n=== SPLIT ===\n\n"));
  process.exit(0);
}

const results: string[] = [];

const e = env();
if (e.WHAPI_TOKEN && e.EGG_GROUP_ID) {
  const h = await health();
  if (!h.ok) {
    results.push(`whatsapp: SKIPPED, channel status=${h.status}`);
  } else {
    for (const p of parts) await sendText(e.EGG_GROUP_ID, p);
    results.push(`whatsapp: sent ${parts.length} part(s) to ${e.EGG_GROUP_ID}`);
  }
} else results.push("whatsapp: not configured");

try {
  results.push((await postSlack(text)) ? "slack: sent" : "slack: not configured");
} catch (err) {
  results.push(`slack: FAILED ${(err as Error).message}`);
}

console.log(results.join("\n"));
if (results.some((r) => /SKIPPED|FAILED/.test(r))) process.exit(3);
