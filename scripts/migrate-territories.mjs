import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

try {
  const envFile = readFileSync(".env.local", "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const sql = neon(process.env.DATABASE_URL);

// Creative territories — top-level grouping within a project
await sql`
  CREATE TABLE IF NOT EXISTS creative_territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// Territory-audience junction (which audiences a territory targets; empty = all)
await sql`
  CREATE TABLE IF NOT EXISTS territory_audiences (
    territory_id UUID NOT NULL REFERENCES creative_territories(id) ON DELETE CASCADE,
    persona_id UUID NOT NULL REFERENCES audience_personas(id) ON DELETE CASCADE,
    PRIMARY KEY (territory_id, persona_id)
  )
`;

// Add territory_id to copy_blocks so each block belongs to a territory
// Using ALTER TABLE with IF NOT EXISTS pattern
try {
  await sql`ALTER TABLE copy_blocks ADD COLUMN territory_id UUID REFERENCES creative_territories(id) ON DELETE SET NULL`;
} catch (e) {
  if (!e.message?.includes('already exists')) throw e;
}

// Add enabled_platforms to projects (JSONB array of platform strings)
try {
  await sql`ALTER TABLE projects ADD COLUMN enabled_platforms JSONB DEFAULT '["linkedin","meta","reddit"]'`;
} catch (e) {
  if (!e.message?.includes('already exists')) throw e;
}

// Indexes
await sql`CREATE INDEX IF NOT EXISTS idx_territories_project ON creative_territories(project_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_territory_audiences_territory ON territory_audiences(territory_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_copy_blocks_territory ON copy_blocks(territory_id)`;

console.log("✅ Territories migration complete");
