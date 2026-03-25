import { neon } from "@neondatabase/serverless";

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

console.log("✅ ad_edits table created (or already exists)");
