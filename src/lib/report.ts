export function parseZones(markdown: string): { support: number[][]; resistance: number[][] } {
  const find = (label: string): number[][] => {
    const ranges: number[][] = [];
    for (const match of markdown.matchAll(new RegExp(`${label}[：:]\\s*([^\\n]+)`, "gi"))) {
      for (const range of match[1]!.matchAll(/(\d{3})\s*[–\-~至]\s*(\d{3})/g)) ranges.push([Number(range[1]), Number(range[2])]);
    }
    return ranges;
  };
  return { support: find("支持位"), resistance: find("阻力位") };
}
