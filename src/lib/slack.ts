import { env } from "./env.js";

export async function postSlack(text: string): Promise<boolean> {
  const url = env().SLACK_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`slack ${res.status}: ${await res.text()}`);
  return true;
}
