/**
 * Convert the report's markdown-ish output into WhatsApp / Slack mrkdwn.
 * Both use *single asterisk* bold. Headers are not supported anywhere, so
 * they become bold lines.
 */
export function toChatMarkup(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      let l = line.replace(/\*\*(.+?)\*\*/g, "*$1*");       // **x** -> *x*
      l = l.replace(/^#{1,6}\s+(.+)$/, (_, t) => `*${t.replace(/^\*|\*$/g, "")}*`); // ### x -> *x*
      l = l.replace(/^[-*]\s+/, "• ");                       // - item -> • item
      l = l.replace(/^>\s?/, "");                            // drop blockquote marker
      l = l.replace(/^-{3,}$/, "⸻");                         // hr
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** WhatsApp caps a text message at 65,536 chars but long messages render badly. Split on section breaks. */
export function splitForWhatsApp(text: string, max = 3800): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let buf = "";
  for (const block of text.split(/\n(?=⸻|\*)/)) {
    if ((buf + "\n" + block).length > max && buf) {
      parts.push(buf.trim());
      buf = block;
    } else buf = buf ? `${buf}\n${block}` : block;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}
