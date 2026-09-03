/** Date helpers. All trade dates are HK/China local calendar dates, formatted YYYY-MM-DD. */

export function todayHK(): string {
  return formatDate(new Date(), "Asia/Hong_Kong");
}

export function formatDate(d: Date, tz = "Asia/Hong_Kong"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * jbzyw titles carry only "M月D日". Listings run backwards in time, so resolve
 * to the most recent year that does not put the date after `reference`
 * (with one day of slack for timezone drift). "12月31日" seen on 2026-09-03 is
 * 2025-12-31, not 2026-12-31.
 */
export function resolveMonthDay(month: number, day: number, reference: string): string {
  const refYear = Number(reference.slice(0, 4));
  const limit = addDays(reference, 1);
  for (const y of [refYear + 1, refYear, refYear - 1]) {
    const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso <= limit) return iso;
  }
  return `${refYear - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
