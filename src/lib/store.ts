import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;
export interface StoredXishuiRow { weight_jin: number; price: number; price_prev: number | null; source_url: string; }
export interface StoredRegionalQuote { province: string; city: string; price: number; unit: string; trend: string; raw: string; source_url: string; }
const dataDir = () => process.env.EGG_DATA_DIR || join(process.cwd(), "data");
export function xishuiPath(): string { return join(dataDir(), "xishui.json"); }
export function regionalPath(): string { return join(dataDir(), "regional.json"); }
const reportsDir = () => join(dataDir(), "reports");
const reportPath = (date: string) => join(reportsDir(), `${date}.md`);

export async function readJson<T>(path: string, empty: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw error;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  const object = value as JsonObject;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, sortKeys(object[key])]));
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeAtomic(path, `${JSON.stringify(sortKeys(value), null, 2)}\n`);
}
export async function readXishui<T = JsonObject>(): Promise<T> { return readJson(xishuiPath(), {} as T); }
export async function readRegional<T = JsonObject>(): Promise<T> { return readJson(regionalPath(), {} as T); }
export async function readReport(date: string): Promise<string | null> {
  try { return await readFile(reportPath(date), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function writeReport(date: string, markdown: string): Promise<void> { await writeAtomic(reportPath(date), markdown); }
export async function reportDates(): Promise<string[]> {
  try { return (await readdir(reportsDir())).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).map((name) => name.slice(0, -3)).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
