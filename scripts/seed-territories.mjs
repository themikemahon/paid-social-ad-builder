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

// Get the Norton Revamp project
const [project] = await sql`SELECT id FROM projects WHERE name = 'Norton Revamp' LIMIT 1`;
if (!project) { console.error("No Norton Revamp project found"); process.exit(1); }

// Create territories
const territories = [
  { name: "General Product", description: "Broad awareness messaging introducing Norton Revamp as a professional presence builder", sort: 0 },
  { name: "Problem / Solution", description: "Pain-point driven messaging showing the before/after of using Norton Revamp", sort: 1 },
  { name: "Trust Angle", description: "Leveraging Norton brand trust to build credibility for the Revamp product", sort: 2 },
];

const territoryMap = {};
for (const t of territories) {
  const [row] = await sql`
    INSERT INTO creative_territories (project_id, name, description, sort_order)
    VALUES (${project.id}, ${t.name}, ${t.description}, ${t.sort})
    RETURNING id
  `;
  territoryMap[t.name] = row.id;
  console.log(`Territory: ${t.name} (${row.id})`);
}

// Map existing copy sets to territories based on naming convention
// Copy sets are named like "General Professional × Authority Builder"
// "General Professional" = General Product territory
// "Professional Seeker" = Problem / Solution territory
// "Trust Advocate" = Trust Angle territory
const copySetMapping = {
  "General Professional": "General Product",
  "Professional Seeker": "Problem / Solution",
  "Trust Advocate": "Trust Angle",
};

const copySets = await sql`
  SELECT cs.id, cs.name FROM copy_sets cs
  WHERE cs.project_id = ${project.id}
`;

for (const cs of copySets) {
  // Extract persona type from copy set name (e.g., "General Professional × Authority Builder")
  const personaType = cs.name.split(" × ")[0];
  const territoryName = copySetMapping[personaType];
  if (territoryName && territoryMap[territoryName]) {
    // Update all copy blocks in this set to belong to the territory
    await sql`
      UPDATE copy_blocks SET territory_id = ${territoryMap[territoryName]}
      WHERE copy_set_id = ${cs.id}
    `;
    console.log(`Linked "${cs.name}" → ${territoryName}`);
  }
}

console.log("\n✅ Territories seeded and linked to existing copy blocks");
