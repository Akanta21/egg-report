import postgres from "postgres";
import { requireEnv } from "./env.js";

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!client) client = postgres(requireEnv("DATABASE_URL"), { max: 2, idle_timeout: 5, prepare: false });
  return client;
}

export async function closeDb() {
  if (client) await client.end({ timeout: 5 });
  client = null;
}
