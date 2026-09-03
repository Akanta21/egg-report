/**
 * jbzyw.com (鸡病专业网) scraping.
 *
 * Site facts (verified 2026-09-03):
 * - Server-rendered HTML, UTF-8, no JS gate.
 * - Listing: https://www.jbzyw.com/lists/279 (蛋鸡行情), paged as /lists/279/2, /lists/279/3 ...
 *   Each entry is an <a href="/view/NNNNNN"> whose text is the article title, e.g.
 *   "8月31日华中（浠水）蛋品交易中心价格", followed by "发布时间：YYYY-MM-DD".
 * - 浠水 article: a table with columns 重量(斤) | 价差 | 昨日蛋价 | 今日蛋价 | 涨/跌.
 *   The 45斤 row is labelled "标价" in the 价差 column.
 * - Regional 快报 articles are prose: "辽宁地区朝阳鸡蛋234元/45斤，落；凌源鸡蛋234元/45斤，落；..."
 *
 * All parsing is done on collapsed text, not on DOM structure, so minor
 * template changes on their side don't break us.
 */
import * as cheerio from "cheerio";
import { resolveMonthDay } from "./dates.js";

export const BASE = "https://www.jbzyw.com";
export const LIST_URL = `${BASE}/lists/279`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export async function fetchHtml(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "zh-CN,zh;q=0.9" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Collapse all whitespace, including full-width spaces, so regexes are stable. */
export function collapse(text: string): string {
  return text.replace(/[\s\u3000]+/g, " ").trim();
}

export function bodyText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return collapse($("body").text());
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface ListingEntry {
  id: number;
  url: string;
  title: string;
  /** YYYY-MM-DD, resolved from the "M月D日" title prefix. */
  date: string;
  kind: "xishui" | "regional" | "other";
  /** For regional entries: province/market label extracted from the title. */
  region?: string;
}

const TITLE_DATE = /^(\d{1,2})月(\d{1,2})日/;
const XISHUI = /华中（浠水）蛋品交易中心价格/;
// "8月31日辽宁部分地区鸡蛋价格快报", "8月31日山东部分地区鸡蛋价格快报（图）", "8月31日北京大洋路市场鸡蛋价格行情快报", "8月31日上海部分地区蛋价快报"
const REGIONAL = /^(\d{1,2})月(\d{1,2})日([\u4e00-\u9fa5]{2,6}?)(?:部分地区|大洋路市场|地区)?(?:鸡蛋价格|蛋价)(?:行情)?快报/;

export function parseListing(html: string, referenceDate: string): ListingEntry[] {
  const $ = cheerio.load(html);
  const seen = new Set<number>();
  const out: ListingEntry[] = [];
  $("a[href*='/view/']").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/\/view\/(\d+)/);
    const title = collapse($(a).text());
    if (!m || !title) return;
    const id = Number(m[1]);
    if (seen.has(id)) return;
    const dm = title.match(TITLE_DATE);
    if (!dm) return; // sidebars, ads, 推荐内容 without a date prefix
    seen.add(id);
    const date = resolveMonthDay(Number(dm[1]), Number(dm[2]), referenceDate);
    let kind: ListingEntry["kind"] = "other";
    let region: string | undefined;
    if (XISHUI.test(title)) kind = "xishui";
    else {
      const rm = title.match(REGIONAL);
      if (rm) {
        kind = "regional";
        region = rm[3];
      }
    }
    out.push({ id, url: `${BASE}/view/${id}`, title, date, kind, region });
  });
  return out;
}

/**
 * Walk listing pages until we've seen entries older than `oldestDate`.
 * Returns entries with date >= oldestDate.
 */
export async function discover(oldestDate: string, referenceDate: string, maxPages = 40): Promise<ListingEntry[]> {
  const all: ListingEntry[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? LIST_URL : `${LIST_URL}/${page}`;
    const entries = parseListing(await fetchHtml(url), referenceDate);
    if (entries.length === 0) break;
    all.push(...entries.filter((e) => e.date >= oldestDate));
    const oldestOnPage = entries.reduce((a, e) => (e.date < a ? e.date : a), "9999-12-31");
    if (oldestOnPage < oldestDate) break;
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  return all;
}

// ---------------------------------------------------------------------------
// 浠水 article
// ---------------------------------------------------------------------------

export interface XishuiRow {
  weightJin: number;
  price: number;
  pricePrev: number | null;
}

export interface XishuiArticle {
  date: string;
  rows: XishuiRow[];
  /** Convenience: the 45斤 row, which is the tracked instrument. */
  p45: XishuiRow | null;
}

const PUBLISHED = /(\d{4})-(\d{2})-(\d{2})\s*来源/;
// "45 标价 236 236" or "44 -2 234 234 5" or "30 -6 166 166"
// Change column is optional and we never trust it; we derive change ourselves.
const ROW = /\b(3\d|4[0-6])\s+(标价|-?\d{1,2})\s+(\d{3})\s+(\d{3})\b/g;

export function parseXishui(html: string, referenceDate: string): XishuiArticle {
  const text = bodyText(html);
  const $ = cheerio.load(html);
  const title = collapse($("h1").first().text()) || collapse($("title").text());

  let date: string;
  const pub = text.match(PUBLISHED);
  if (pub) date = `${pub[1]}-${pub[2]}-${pub[3]}`;
  else {
    const dm = title.match(TITLE_DATE);
    if (!dm) throw new Error("cannot determine article date");
    date = resolveMonthDay(Number(dm[1]), Number(dm[2]), referenceDate);
  }

  // Primary: walk table rows. jbzyw renders the price table as a real <table>.
  const rows: XishuiRow[] = [];
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td, th").map((__, c) => collapse($(c).text())).get();
    if (cells.length < 4) return;
    const w = Number(cells[0]);
    const prev = Number(cells[2]);
    const cur = Number(cells[3]);
    if (!Number.isInteger(w) || w < 30 || w > 46) return;
    if (!Number.isInteger(cur) || cur < 50 || cur > 600) return;
    rows.push({ weightJin: w, price: cur, pricePrev: Number.isInteger(prev) ? prev : null });
  });

  // Fallback: text regex, in case the table is ever flattened to plain text.
  if (rows.length === 0) {
    const start = text.indexOf("今日鸡蛋价格");
    const end = text.indexOf("老母鸡及特色鸡蛋价格");
    const section = text.slice(start >= 0 ? start : 0, end > start ? end : undefined);
    for (const m of section.matchAll(ROW)) {
      const price = Number(m[4]);
      if (price < 50 || price > 600) continue;
      rows.push({ weightJin: Number(m[1]), price, pricePrev: Number(m[3]) });
    }
  }

  const byWeight = new Map<number, XishuiRow>();
  for (const r of rows) if (!byWeight.has(r.weightJin)) byWeight.set(r.weightJin, r);
  const clean = [...byWeight.values()].sort((a, b) => b.weightJin - a.weightJin);

  return { date, rows: clean, p45: byWeight.get(45) ?? null };
}

// ---------------------------------------------------------------------------
// Regional 快报 articles
// ---------------------------------------------------------------------------

export interface RegionalQuote {
  city: string;
  price: number;
  /** "斤" for per-jin, otherwise the pack size like "45斤", "30斤", "27.5斤". */
  unit: string;
  trend: "稳" | "落" | "涨";
  raw: string;
}

const TREND_MAP: Record<string, RegionalQuote["trend"]> = { 稳: "稳", 落: "落", 跌: "落", 降: "落", 涨: "涨", 升: "涨", 涨价: "涨" };
// "朝阳鸡蛋234元/45斤，落" / "阜阳鸡蛋5.1元/斤，落" / "淮北鸡蛋到户157元/30斤，落" / "淮安鸡蛋5.23-5.3元/斤，稳"
const QUOTE = /([\u4e00-\u9fa5]{2,8}?)(?:红蛋|粉蛋|鸡蛋)(?:到户|纸箱大码|散筐大码)?([\d.]+)(?:-([\d.]+))?元\s*\/\s*([\d.]*斤)\s*[，,]\s*(稳|落|跌|降|涨|升)/g;

export function parseRegional(html: string): RegionalQuote[] {
  const text = bodyText(html);
  const start = text.indexOf("鸡病专业网消息");
  const end = text.indexOf("免责声明");
  const section = text.slice(start >= 0 ? start : 0, end > start ? end : undefined);

  const out: RegionalQuote[] = [];
  const seen = new Set<string>();
  for (const m of section.matchAll(QUOTE)) {
    let city = m[1]!;
    // Strip leading "辽宁地区" / "山东地区" / "河南" province prefixes that get glued on in the first clause.
    city = city.replace(/^.*?地区/, "").replace(/^(?:河南|山东|辽宁|河北|江苏|安徽|山西|湖北|湖南|北京|天津|上海|四川|陕西|云南|广东|广西)/, "");
    if (!city) continue;
    const lo = Number(m[2]);
    const hi = m[3] ? Number(m[3]) : null;
    const price = hi ? (lo + hi) / 2 : lo;
    const unit = m[4] === "斤" ? "斤" : m[4]!;
    const trend = TREND_MAP[m[5]!];
    if (!trend || !Number.isFinite(price)) continue;
    const key = `${city}|${unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ city, price, unit, trend, raw: m[0] });
  }
  return out;
}
