import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { parseZones } from "../src/lib/report.js";
import { readJson, writeJson } from "../src/lib/store.js";

const row = (price: number, price_prev: number | null = null) => [{ weight_jin: 45, price, price_prev, source_url: "u" }, { weight_jin: 44, price: price - 5, price_prev: null, source_url: "u" }];

test("context derives window, monthly structure, gaps and previous report from data files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "egg-"));
  const path = join(dir, "xishui.json");
  assert.deepEqual(await readJson(path, {}), {});
  await writeJson(path, { "2026-09-02": row(240, 236), "2026-08-31": row(236), "2026-08-28": row(243), "2026-08-01": row(200), "2026-09-04": row(999) });
  const { stdout } = await promisify(execFile)("npx", ["tsx", "scripts/context.ts", "--date", "2026-09-03"], { env: { ...process.env, EGG_DATA_DIR: dir } });
  const ctx = JSON.parse(stdout);
  assert.equal(ctx.today_recorded, false);
  assert.deepEqual(ctx.xishui_45.last_120.map((d: { trade_date: string }) => d.trade_date), ["2026-08-01", "2026-08-28", "2026-08-31", "2026-09-02"]);
  assert.deepEqual(ctx.xishui_45.monthly_structure, [
    { ym: "2026-08", lo: 200, hi: 243, first: 200, last: 236 },
    { ym: "2026-09", lo: 240, hi: 240, first: 240, last: 240 },
  ]);
  assert.deepEqual(ctx.xishui_45.missing_dates_in_window.slice(-3), ["2026-08-29", "2026-08-30", "2026-09-01"]);
  assert.deepEqual(ctx.weight_bands.previous_day, [{ weight_jin: 45, price: 240 }, { weight_jin: 44, price: 235 }]);
  assert.equal(ctx.previous_report, null);
});

test("parseZones reads 支持位/阻力位 ranges", () => {
  assert.deepEqual(parseZones("• 最近支持位：229–235\n• 最近阻力位：239-243、245~248"), { support: [[229, 235]], resistance: [[239, 243], [245, 248]] });
});
