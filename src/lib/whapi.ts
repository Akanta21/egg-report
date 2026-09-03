import { requireEnv } from "./env.js";

const GATE = "https://gate.whapi.cloud";

function headers() {
  return { authorization: `Bearer ${requireEnv("WHAPI_TOKEN")}`, "content-type": "application/json" };
}

export async function health(): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${GATE}/health`, { headers: headers() });
  const body = (await res.json().catch(() => ({}))) as { status?: { text?: string } | string };
  const status = typeof body.status === "string" ? body.status : body.status?.text ?? "unknown";
  return { ok: res.ok && /auth/i.test(status), status };
}

export async function sendText(to: string, body: string, attempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${GATE}/messages/text`, { method: "POST", headers: headers(), body: JSON.stringify({ to, body }) });
      const json = (await res.json().catch(() => ({}))) as { sent?: boolean; message?: unknown; error?: unknown };
      if (res.ok && json.sent !== false) return;
      throw new Error(`whapi ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function listGroups(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${GATE}/groups?count=200`, { headers: headers() });
  if (!res.ok) throw new Error(`whapi groups ${res.status}`);
  const json = (await res.json()) as { groups?: Array<{ id: string; name?: string; subject?: string }> };
  return (json.groups ?? []).map((g) => ({ id: g.id, name: g.name ?? g.subject ?? "" }));
}
