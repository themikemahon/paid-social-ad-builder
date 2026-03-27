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

// Generated ads — one per copy block × platform
// This is the creative interpretation of a copy block for a specific platform
await sql`
  CREATE TABLE IF NOT EXISTS generated_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    copy_block_id UUID NOT NULL REFERENCES copy_blocks(id) ON DELETE CASCADE,
    territory_id UUID REFERENCES creative_territories(id) ON DELETE SET NULL,
    persona_id UUID REFERENCES audience_personas(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'meta', 'reddit')),
    creative_format TEXT NOT NULL DEFAULT 'standard-hero',
    -- Rendered ad content (platform-specific interpretation of the copy block)
    post_copy TEXT DEFAULT '',
    image_headline TEXT DEFAULT '',
    image_subhead TEXT DEFAULT '',
    strip_headline TEXT DEFAULT '',
    strip_cta TEXT DEFAULT '',
    -- Source copy reference (snapshot at generation time)
    source_primary TEXT DEFAULT '',
    source_secondary TEXT DEFAULT '',
    source_cta_native TEXT DEFAULT '',
    source_cta_custom TEXT DEFAULT '',
    -- Copy notes explaining the creative interpretation
    copy_notes TEXT DEFAULT '',
    -- Image
    image_url TEXT,
    -- Approval
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    -- Timestamps
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(copy_block_id, platform)
  )
`;

await sql`CREATE INDEX IF NOT EXISTS idx_generated_ads_copy_block ON generated_ads(copy_block_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_generated_ads_territory ON generated_ads(territory_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_generated_ads_platform ON generated_ads(platform)`;

console.log("✅ Generated ads table created");
