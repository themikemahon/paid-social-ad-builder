import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Load .env.local
try {
  const envFile = readFileSync(".env.local", "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const sql = neon(process.env.DATABASE_URL);

// Get workspace ID
const [ws] = await sql`SELECT id FROM workspaces WHERE brand_name = 'Norton' LIMIT 1`;
if (!ws) { console.error("No Norton workspace found. Run seed-admin.mjs first."); process.exit(1); }
const workspaceId = ws.id;

const [adminUser] = await sql`SELECT id FROM users LIMIT 1`;
const userId = adminUser.id;

console.log(`Workspace: ${workspaceId}, User: ${userId}`);

// ── Create Audience Personas ──
const personas = [
  {
    name: "Opportunity Seeker",
    code: "opp",
    demographics: { age: "22-35", career_stage: "early-career", employment: "job-seeking or recently employed" },
    painPoints: ["Invisible to recruiters", "Applications go nowhere", "No proof of expertise online", "Blank or outdated LinkedIn profile"],
    motivations: ["Get noticed by hiring managers", "Build credible professional presence", "Stand out in job search"],
    platformBehavior: { linkedin: "Passive lurker, rarely posts", meta: "Scrolls feed, engages with career content", reddit: "Asks for career advice in subreddits" },
  },
  {
    name: "Authority Builder",
    code: "auth",
    demographics: { age: "35-55", career_stage: "mid-to-senior", employment: "established professional" },
    painPoints: ["20 years of expertise but 3 LinkedIn posts", "Profile doesn't reflect knowledge", "Peers with less experience have more visibility"],
    motivations: ["Share expertise online", "Build reputation matching experience", "Become a recognized voice in their field"],
    platformBehavior: { linkedin: "Has account but rarely active", meta: "Minimal professional use", reddit: "Reads industry threads" },
  },
  {
    name: "Foundation Builder",
    code: "found",
    demographics: { age: "20-30", career_stage: "early-career or student", employment: "new professional or recent graduate" },
    painPoints: ["No idea what to post", "Overthinks every draft", "Zero online presence", "Feels behind peers"],
    motivations: ["Build credibility from day one", "Start posting consistently", "Develop professional confidence online"],
    platformBehavior: { linkedin: "Created account but never posted", meta: "Active personally, not professionally", reddit: "Seeks beginner advice" },
  },
  {
    name: "Growth Driver",
    code: "growth",
    demographics: { age: "30-50", career_stage: "business owner or freelancer", employment: "self-employed or small business" },
    painPoints: ["Clients can't find them online", "Relies only on referrals", "No clear content strategy", "Too busy running business to post"],
    motivations: ["Get business seen online", "Build consistent pipeline visibility", "Grow reputation that compounds"],
    platformBehavior: { linkedin: "Posts sporadically", meta: "Uses for business page", reddit: "Engages in business/entrepreneur subreddits" },
  },
  {
    name: "Community Engager",
    code: "comm",
    demographics: { age: "25-45", career_stage: "any", employment: "active online but plateauing" },
    painPoints: ["Posts a lot but not growing", "No content strategy", "Random schedule", "Growth plateaus"],
    motivations: ["Make every post count", "Turn consistency into results", "Grow audience with purpose"],
    platformBehavior: { linkedin: "Active but unfocused", meta: "Shares frequently", reddit: "Active community member" },
  },
];

const personaMap = {};
for (const p of personas) {
  const [row] = await sql`
    INSERT INTO audience_personas (workspace_id, name, demographics, pain_points, motivations, platform_behavior)
    VALUES (${workspaceId}, ${p.name}, ${JSON.stringify(p.demographics)}, ${p.painPoints}, ${p.motivations}, ${JSON.stringify(p.platformBehavior)})
    RETURNING id
  `;
  personaMap[p.code] = row.id;
  console.log(`Persona: ${p.name} (${row.id})`);
}

// ── Create Project ──
const [project] = await sql`
  INSERT INTO projects (workspace_id, name, brief, objectives)
  VALUES (
    ${workspaceId},
    'Norton Revamp',
    'Paid social ad campaign for Norton Revamp — an AI-powered online presence builder that helps professionals build credibility through structured direction and writing support.',
    'Drive awareness and signups for Norton Revamp across LinkedIn, Meta, and Reddit targeting five audience personas.'
  )
  RETURNING id
`;
console.log(`Project: Norton Revamp (${project.id})`);

// Assign all personas to project
for (const [code, personaId] of Object.entries(personaMap)) {
  await sql`INSERT INTO project_personas (project_id, persona_id) VALUES (${project.id}, ${personaId})`;
}
console.log("All personas assigned to project");

// ── Fetch legacy ad edits ──
const edits = await sql`SELECT * FROM ad_edits ORDER BY ad_id, field_index`;

// Group edits by ad_id
const adGroups = {};
for (const e of edits) {
  if (!adGroups[e.ad_id]) adGroups[e.ad_id] = [];
  adGroups[e.ad_id].push(e);
}

// Strip HTML tags for clean text
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<span class="see-more-ellipsis">.*?<\/span>/g, "")
    .replace(/<div class="meme-line">/g, "")
    .replace(/<div class="notes-title">/g, "")
    .replace(/<div class="notes-text">/g, "")
    .replace(/<div class="notes-link">/g, "")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<div>/g, "\n")
    .replace(/<\/div>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Parse ad_id pattern: {platform}-{persona_type}-{persona_code}
// platform: li=linkedin, meta=meta, rd=reddit
// persona_type: gp=general_professional, ps=professional_seeker, ta=trust_advocate
// persona_code: opp, auth, found, growth, comm
function parseAdId(adId) {
  const parts = adId.split("-");
  const platformMap = { li: "linkedin", meta: "meta", rd: "reddit" };
  // Handle "meta" which has 3-part prefix
  let platform, personaType, personaCode;
  if (parts[0] === "meta") {
    platform = "meta";
    personaType = parts[1];
    personaCode = parts[2];
  } else {
    platform = platformMap[parts[0]] || parts[0];
    personaType = parts[1];
    personaCode = parts[2];
  }
  return { platform, personaType, personaCode };
}

// Group ads by persona code + persona type for copy sets
// Each copy set = one persona type (gp/ps/ta) × one persona code (opp/auth/found/growth/comm)
const copySetGroups = {};
for (const adId of Object.keys(adGroups)) {
  const { personaType, personaCode } = parseAdId(adId);
  const key = `${personaType}-${personaCode}`;
  if (!copySetGroups[key]) copySetGroups[key] = [];
  copySetGroups[key].push(adId);
}

const personaTypeNames = {
  gp: "General Professional",
  ps: "Professional Seeker",
  ta: "Trust Advocate",
};

const personaCodeNames = {
  opp: "Opportunity Seeker",
  auth: "Authority Builder",
  found: "Foundation Builder",
  growth: "Growth Driver",
  comm: "Community Engager",
};

let sortOrder = 0;
for (const [key, adIds] of Object.entries(copySetGroups)) {
  const [personaType, personaCode] = key.split("-");
  const setName = `${personaTypeNames[personaType] || personaType} × ${personaCodeNames[personaCode] || personaCode}`;

  const [copySet] = await sql`
    INSERT INTO copy_sets (project_id, name, sort_order)
    VALUES (${project.id}, ${setName}, ${sortOrder++})
    RETURNING id
  `;

  let blockOrder = 0;
  for (const adId of adIds.sort()) {
    const fields = adGroups[adId];
    const { platform } = parseAdId(adId);

    // Map fields based on what we have — field 0 is usually body/headline area
    // For simplicity: first meaningful text = headline, rest = subhead/CTAs
    let headline = "", subhead = "", primaryCta = "", secondaryCta = "";

    if (fields.length >= 1) headline = stripHtml(fields[0]?.html || "");
    if (fields.length >= 2) subhead = stripHtml(fields[1]?.html || "");
    if (fields.length >= 3) primaryCta = stripHtml(fields[2]?.html || "");
    if (fields.length >= 4) secondaryCta = stripHtml(fields[3]?.html || "");

    const [block] = await sql`
      INSERT INTO copy_blocks (copy_set_id, headline, subhead, primary_cta, secondary_cta, creative_format, sort_order)
      VALUES (${copySet.id}, ${headline}, ${subhead}, ${primaryCta}, ${secondaryCta}, 'standard-hero', ${blockOrder++})
      RETURNING id
    `;

    // Migrate images if they exist
    const images = await sql`SELECT * FROM ad_images WHERE ad_id = ${adId}`;
    for (const img of images) {
      await sql`
        INSERT INTO copy_block_images (copy_block_id, blob_url, platform)
        VALUES (${block.id}, ${img.blob_url}, ${platform})
      `;
    }
  }

  console.log(`Copy Set: ${setName} (${adIds.length} blocks)`);
}

console.log("\n✅ Migration complete! Norton Revamp project with personas and copy blocks seeded.");
