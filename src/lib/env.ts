import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  WHAPI_TOKEN: z.string().min(1).optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  EGG_GROUP_ID: z.string().regex(/@g\.us$/, "must be a WhatsApp group id ending in @g.us").optional(),
  TZ: z.string().default("Asia/Hong_Kong"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env()[key];
  if (v === undefined || v === null || v === "") throw new Error(`${key} is required for this step`);
  return v as NonNullable<Env[K]>;
}
