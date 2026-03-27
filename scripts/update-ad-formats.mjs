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

// Format mapping: platform → territory code → persona code → creative_format
const FORMAT_MAP = {
  linkedin: {
    gp: { opp: "standard-hero", auth: "photo-forward", found: "question-hook", growth: "standard-hero", comm: "text-post" },
    ps: { opp: "standard-hero", auth: "stat-callout", found: "question-hook", growth: "photo-forward", comm: "standard-hero" },
    ta: { opp: "comparison", auth: "standard-hero", found: "text-post", growth: "stat-callout", comm: "photo-forward" },
  },
  meta: {
    gp: { opp: "photo-forward", auth: "standard-hero", found: "notification", growth: "stat-callout", comm: "standard-hero" },
    ps: { opp: "comparison", auth: "question-hook", found: "imessage", growth: "standard-hero", comm: "photo-forward" },
    ta: { opp: "standard-hero", auth: "notification", found: "standard-hero", growth: "comparison", comm: "stat-callout" },
  },
  reddit: {
    gp: { opp: "meme", auth: "comparison", found: "text-post", growth: "imessage", comm: "question-hook" },
    ps: { opp: "notes-app", auth: "meme", found: "standard-hero", growth: "comparison", comm: "question-hook" },
    ta: { opp: "imessage", auth: "text-post", found: "meme", growth: "standard-hero", comm: "comparison" },
  },
};

// Persona name → code
const PERSONA_CODES = {
  "Opportunity Seeker": "opp",
  "Authority Builder": "auth",
  "Foundation Builder": "found",
  "Growth Driver": "growth",
  "Community Engager": "comm",
};

// Territory name → code
const TERRITORY_CODES = {
  "General Product": "gp",
  "Problem / Solution": "ps",
  "Trust Angle": "ta",
};

// Fetch all generated_ads joined with persona and territory names
const rows = await sql`
  SELECT
    ga.id,
    ga.platform,
    ap.name AS persona_name,
    ct.name AS territory_name
  FROM generated_ads ga
  LEFT JOIN audience_personas ap ON ga.persona_id = ap.id
  LEFT JOIN creative_territories ct ON ga.territory_id = ct.id
`;

let updated = 0;
let skipped = 0;

for (const row of rows) {
  const platformMap = FORMAT_MAP[row.platform];
  if (!platformMap) { skipped++; continue; }

  const terrCode = TERRITORY_CODES[row.territory_name];
  if (!terrCode || !platformMap[terrCode]) { skipped++; continue; }

  const personaCode = PERSONA_CODES[row.persona_name];
  if (!personaCode) { skipped++; continue; }

  const format = platformMap[terrCode][personaCode];
  if (!format) { skipped++; continue; }

  await sql`UPDATE generated_ads SET creative_format = ${format}, updated_at = NOW() WHERE id = ${row.id}`;
  updated++;
  console.log(`  ${row.platform} / ${row.territory_name} / ${row.persona_name} → ${format}`);
}

console.log(`\n✅ Updated ${updated} ads, skipped ${skipped}`);
