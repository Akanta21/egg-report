import { readFile } from "node:fs/promises";
import { sql, closeDb } from "../src/lib/db.js";

const ddl = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql().unsafe(ddl);
console.log("schema applied");
await closeDb();
