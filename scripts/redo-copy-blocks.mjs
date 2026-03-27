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

// Parse template.html to extract source copy from annotations
const html = readFileSync("template.html", "utf-8");

// Extract all LinkedIn ad blocks with their annotations
// Pattern: data-id="li-{territory}-{persona}" ... annotation-body with Primary/Secondary/Native CTA/Custom CTA
const adBlockRegex = /data-id="(li-[^"]+)"[\s\S]*?annotation-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;

const copyBlocks = {};
let match;
while ((match = adBlockRegex.exec(html)) !== null) {
  const adId = match[1];
  const body = match[2];
  
  const primaryMatch = body.match(/Primary:<\/span>\s*(.*?)(?:<\/div>|$)/);
  const secondaryMatch = body.match(/Secondary:<\/span>\s*(.*?)(?:<\/div>|$)/);
  const nativeCTAMatch = body.match(/Native CTA:<\/span>\s*(.*?)(?:<\/div>|$)/);
  const customCTAMatch = body.match(/Custom CTA:<\/span>\s*(.*?)(?:<\/div>|$)/);
  
  // Parse ad ID: li-{territory}-{persona}
  const parts = adId.split("-");
  const territory = parts[1]; // gp, ps, ta
  const persona = parts[2]; // opp, auth, found, growth, comm
  const key = `${territory}-${persona}`;
  
  if (!copyBlocks[key]) {
    copyBlocks[key] = {
      territory,
      persona,
      primary: primaryMatch ? primaryMatch[1].trim() : "",
      secondary: secondaryMatch ? secondaryMatch[1].trim() : "",
      ctaNative: nativeCTAMatch ? nativeCTAMatch[1].trim() : "",
      ctaCustom: customCTAMatch ? customCTAMatch[1].trim() : "",
    };
  }
}

console.log(`Found ${Object.keys(copyBlocks).length} distinct copy blocks from annotations`);

// Get project, territories, personas
const [project] = await sql`SELECT id FROM projects WHERE name = 'Norton Revamp' LIMIT 1`;
if (!project) { console.error("No project found"); process.exit(1); }

const territories = await sql`SELECT id, name FROM creative_territories WHERE project_id = ${project.id}`;
const personas = await sql`SELECT id, name FROM audience_personas`;

const territoryMap = {};
for (const t of territories) {
  if (t.name === "General Product") territoryMap["gp"] = t.id;
  if (t.name === "Problem / Solution") territoryMap["ps"] = t.id;
  if (t.name === "Trust Angle") territoryMap["ta"] = t.id;
}

const personaMap = {};
for (const p of personas) {
  if (p.name === "Opportunity Seeker") personaMap["opp"] = p.id;
  if (p.name === "Authority Builder") personaMap["auth"] = p.id;
  if (p.name === "Foundation Builder") personaMap["found"] = p.id;
  if (p.name === "Growth Driver") personaMap["growth"] = p.id;
  if (p.name === "Community Engager") personaMap["comm"] = p.id;
}

// Delete all existing copy blocks and copy sets for this project
console.log("Cleaning up old data...");
await sql`DELETE FROM generated_ads WHERE copy_block_id IN (SELECT cb.id FROM copy_blocks cb JOIN copy_sets cs ON cs.id = cb.copy_set_id WHERE cs.project_id = ${project.id})`;
await sql`DELETE FROM copy_blocks WHERE copy_set_id IN (SELECT id FROM copy_sets WHERE project_id = ${project.id})`;
await sql`DELETE FROM copy_sets WHERE project_id = ${project.id}`;

// Create one copy set for the project (flat list, no grouping)
const [copySet] = await sql`
  INSERT INTO copy_sets (project_id, name, sort_order)
  VALUES (${project.id}, 'Norton Revamp Copy', 0)
  RETURNING id
`;

console.log(`Created copy set: ${copySet.id}`);

// Create 15 copy blocks (one per territory × persona)
let sortOrder = 0;
const blockMap = {}; // key -> block id

for (const [key, cb] of Object.entries(copyBlocks)) {
  const territoryId = territoryMap[cb.territory];
  const personaId = personaMap[cb.persona];
  
  const [block] = await sql`
    INSERT INTO copy_blocks (copy_set_id, headline, subhead, primary_cta, secondary_cta, creative_format, sort_order, territory_id)
    VALUES (${copySet.id}, ${cb.primary}, ${cb.secondary}, ${cb.ctaNative}, ${cb.ctaCustom}, 'standard-hero', ${sortOrder++}, ${territoryId})
    RETURNING id
  `;
  
  blockMap[key] = block.id;
  console.log(`  Block ${key}: "${cb.primary.slice(0, 60)}..." → ${block.id}`);
}

console.log(`\nCreated ${Object.keys(blockMap).length} copy blocks`);

// Now recreate generated_ads from the legacy ad_edits, linked to the correct copy blocks
const edits = await sql`SELECT * FROM ad_edits ORDER BY ad_id, field_index`;
const adGroups = {};
for (const e of edits) {
  if (!adGroups[e.ad_id]) adGroups[e.ad_id] = [];
  adGroups[e.ad_id].push(e);
}

const images = await sql`SELECT * FROM ad_images`;
const imageMap = {};
for (const img of images) imageMap[img.ad_id] = img.blob_url;

function stripHtml(h) {
  if (!h) return "";
  return h.replace(/<span class="see-more-ellipsis">.*?<\/span>/g, "")
    .replace(/<div class="meme-line">/g, "").replace(/<div class="notes-title">/g, "")
    .replace(/<div class="notes-text">/g, "").replace(/<div class="notes-link">/g, "")
    .replace(/<br\s*\/?>/g, "\n").replace(/<div>/g, "\n").replace(/<\/div>/g, "")
    .replace(/<[^>]+>/g, "").trim();
}

function parseAdId(adId) {
  const parts = adId.split("-");
  if (parts[0] === "meta") return { platform: "meta", territory: parts[1], persona: parts[2] };
  const pMap = { li: "linkedin", rd: "reddit" };
  return { platform: pMap[parts[0]] || parts[0], territory: parts[1], persona: parts[2] };
}

// Format mapping from the template
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

let adCount = 0;
for (const [adId, fields] of Object.entries(adGroups)) {
  const { platform, territory, persona } = parseAdId(adId);
  const key = `${territory}-${persona}`;
  const blockId = blockMap[key];
  if (!blockId) { console.log(`  Skip ${adId}: no block for ${key}`); continue; }

  const territoryId = territoryMap[territory];
  const personaId = personaMap[persona];
  const format = FORMAT_MAP[platform]?.[territory]?.[persona] || "standard-hero";

  // Get the source copy from the copy block we just created
  const cb = copyBlocks[key];

  // Build ad content from legacy fields
  const postCopy = stripHtml(fields[0]?.html || "");
  const allFields = fields.map(f => stripHtml(f.html));
  let imageHeadline = "", imageSubhead = "", stripHeadline = "", stripCta = "";
  if (allFields.length > 1) imageHeadline = allFields[1];
  if (allFields.length > 2) imageSubhead = allFields[2];
  if (allFields.length > 3) stripHeadline = allFields[3];
  if (allFields.length > 4) stripCta = allFields[4];

  const imageUrl = imageMap[adId] || null;

  try {
    await sql`
      INSERT INTO generated_ads (
        copy_block_id, territory_id, persona_id, platform, creative_format,
        post_copy, image_headline, image_subhead, strip_headline, strip_cta,
        source_primary, source_secondary, source_cta_native, source_cta_custom,
        image_url, sort_order
      ) VALUES (
        ${blockId}, ${territoryId}, ${personaId}, ${platform}, ${format},
        ${postCopy}, ${imageHeadline}, ${imageSubhead}, ${stripHeadline}, ${stripCta},
        ${cb.primary}, ${cb.secondary}, ${cb.ctaNative}, ${cb.ctaCustom},
        ${imageUrl}, ${adCount}
      )
    `;
    adCount++;
  } catch (err) {
    console.error(`Error for ${adId}:`, err.message);
  }
}

console.log(`\n✅ Done! Created ${Object.keys(blockMap).length} copy blocks and ${adCount} generated ads`);
