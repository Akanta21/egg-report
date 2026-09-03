import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseListing, parseRegional, parseXishui } from "../src/lib/jbzyw.js";
import { toChatMarkup } from "../src/lib/whatsapp.js";
import { resolveMonthDay } from "../src/lib/dates.js";

const fx = (n: string) => readFile(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("parses 浠水 table, all 16 bands, flat day", async () => {
  const a = parseXishui(await fx("xishui-2026-08-31.html"), "2026-09-03");
  assert.equal(a.date, "2026-08-31");
  assert.equal(a.rows.length, 16);
  assert.deepEqual(a.p45, { weightJin: 45, price: 236, pricePrev: 236 });
  assert.equal(a.rows.at(-1)?.weightJin, 30);
  assert.equal(a.rows.at(-1)?.price, 166);
  assert.ok(!a.rows.some((r) => r.weightJin === 46), "46 row has no price and must be skipped");
});

test("parses 浠水 table on a down day where 涨/跌 column is populated", async () => {
  const a = parseXishui(await fx("xishui-2026-08-27.html"), "2026-08-27");
  assert.deepEqual(a.p45, { weightJin: 45, price: 243, pricePrev: 248 });
  assert.equal(a.rows.find((r) => r.weightJin === 30)?.price, 173);
  assert.equal(a.rows.length, 4);
});

test("parses regional 快报 clauses incl. per-jin, ranges, 到户", async () => {
  const q = parseRegional(await fx("liaoning-2026-08-27.html"));
  const by = Object.fromEntries(q.map((x) => [x.city, x]));
  assert.equal(by["朝阳"]?.price, 234);
  assert.equal(by["朝阳"]?.unit, "45斤");
  assert.equal(by["朝阳"]?.trend, "落");
  assert.equal(by["锦州"]?.trend, "稳");
  assert.equal(by["沈阳"]?.unit, "斤");
  assert.equal(by["沈阳"]?.trend, "涨");
  assert.equal(by["淮北"]?.unit, "30斤");
  assert.equal(by["淮安"]?.price, (5.23 + 5.3) / 2);
  assert.equal(q.length, 9);
});

test("classifies listing entries and resolves dates", async () => {
  const e = parseListing(await fx("listing.html"), "2026-09-03");
  const xs = e.filter((x) => x.kind === "xishui");
  assert.equal(xs.length, 3);
  assert.equal(xs[0]?.date, "2026-08-27");
  assert.equal(xs[0]?.id, 515881);
  assert.equal(xs.find((x) => x.id === 400000)?.date, "2025-12-31", "12月31日 seen in Sep resolves to previous year");
  const regs = e.filter((x) => x.kind === "regional").map((x) => x.region);
  assert.deepEqual(regs, ["安徽", "辽宁", "山东", "上海", "北京"]);
  assert.equal(e.find((x) => x.id === 515882)?.kind, "other");
});

test("resolveMonthDay never resolves to the future", () => {
  assert.equal(resolveMonthDay(1, 2, "2026-12-30"), "2026-01-02");
  assert.equal(resolveMonthDay(12, 31, "2027-01-01"), "2026-12-31");
  assert.equal(resolveMonthDay(9, 3, "2026-09-03"), "2026-09-03");
});

test("markdown to WhatsApp markup", () => {
  const out = toChatMarkup("### 全國市場走勢\n**今日：236**\n- 月線：🟢 x\n> quote\n---\n");
  assert.equal(out, "*全國市場走勢*\n*今日：236*\n• 月線：🟢 x\nquote\n⸻");
});
