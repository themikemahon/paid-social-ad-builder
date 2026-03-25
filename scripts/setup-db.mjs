import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Load .env.local if present
try {
  const envFile = readFileSync(".env.local", "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS ad_edits (
    ad_id TEXT NOT NULL,
    field_index INTEGER NOT NULL,
    html TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ad_id, field_index)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS ad_approvals (
    ad_id TEXT PRIMARY KEY,
    approved BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

console.log("✅ ad_edits and ad_approvals tables created (or already exist)");
