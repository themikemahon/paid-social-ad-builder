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

// Get all legacy ad_edits grouped by ad_id
const edits = await sql`SELECT * FROM ad_edits ORDER BY ad_id, field_index`;
const adGroups = {};
for (const e of edits) {
  if (!adGroups[e.ad_id]) adGroups[e.ad_id] = [];
  adGroups[e.ad_id].push(e);
}

// Get legacy images
const images = await sql`SELECT * FROM ad_images`;
const imageMap = {};
for (const img of images) imageMap[img.ad_id] = img.blob_url;

// Get territories
const territories = await sql`SELECT id, name FROM creative_territories`;
const territoryMap = {};
for (const t of territories) territoryMap[t.name] = t.id;

// Get personas
const personas = await sql`SELECT id, name FROM audience_personas`;
const personaMap = {};
for (const p of personas) personaMap[p.name] = p.id;

// Get copy blocks with their copy set names
const blocks = await sql`
  SELECT cb.id, cb.copy_set_id, cb.headline, cb.territory_id, cs.name as set_name
  FROM copy_blocks cb
  JOIN copy_sets cs ON cs.id = cb.copy_set_id
  ORDER BY cs.sort_order, cb.sort_order
`;

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

// Parse ad_id: li-gp-opp, meta-gp-opp, rd-gp-opp
function parseAdId(adId) {
  const parts = adId.split("-");
  let platform, personaType, personaCode;
  if (parts[0] === "meta") {
    platform = "meta"; personaType = parts[1]; personaCode = parts[2];
  } else {
    const pMap = { li: "linkedin", rd: "reddit" };
    platform = pMap[parts[0]] || parts[0]; personaType = parts[1]; personaCode = parts[2];
  }
  return { platform, personaType, personaCode };
}

const personaTypeToTerritory = {
  gp: "General Product",
  ps: "Problem / Solution",
  ta: "Trust Angle",
};

const personaCodeToName = {
  opp: "Opportunity Seeker",
  auth: "Authority Builder",
  found: "Foundation Builder",
  growth: "Growth Driver",
  comm: "Community Engager",
};

const personaTypeToSetPrefix = {
  gp: "General Professional",
  ps: "Professional Seeker",
  ta: "Trust Advocate",
};

let created = 0;
for (const [adId, fields] of Object.entries(adGroups)) {
  const { platform, personaType, personaCode } = parseAdId(adId);
  const territoryName = personaTypeToTerritory[personaType];
  const personaName = personaCodeToName[personaCode];
  const setPrefix = personaTypeToSetPrefix[personaType];

  if (!territoryName || !personaName || !setPrefix) continue;

  const territoryId = territoryMap[territoryName];
  const personaId = personaMap[personaName];

  // Find the matching copy block: set name starts with setPrefix and contains personaName
  // Each platform's ad maps to the same copy block (one block per persona type × persona code)
  const targetSetName = `${setPrefix} × ${personaName}`;
  
  // Find the copy block that matches this platform
  // In the seed, we created 3 blocks per set (one per platform: li, meta, rd)
  // The blocks are ordered by platform alphabetically: linkedin(0), meta(1), reddit(2)
  const matchingBlocks = blocks.filter(b => b.set_name === targetSetName);
  const platformOrder = { linkedin: 0, meta: 1, reddit: 2 };
  const block = matchingBlocks[platformOrder[platform]];

  if (!block) {
    console.log(`No block found for ${adId} (${targetSetName}, ${platform})`);
    continue;
  }

  // Build the generated ad content from legacy fields
  const postCopy = stripHtml(fields[0]?.html || "");
  const allFields = fields.map(f => stripHtml(f.html));
  
  // For the generated ad, the post_copy is field 0, and the rest are image/strip content
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
        ${block.id}, ${territoryId}, ${personaId}, ${platform}, 'standard-hero',
        ${postCopy}, ${imageHeadline}, ${imageSubhead}, ${stripHeadline}, ${stripCta},
        ${block.headline}, '', '', '',
        ${imageUrl}, ${platformOrder[platform]}
      )
      ON CONFLICT (copy_block_id, platform) DO UPDATE SET
        post_copy = ${postCopy},
        image_headline = ${imageHeadline},
        image_subhead = ${imageSubhead},
        strip_headline = ${stripHeadline},
        strip_cta = ${stripCta},
        image_url = ${imageUrl},
        territory_id = ${territoryId},
        persona_id = ${personaId}
    `;
    created++;
  } catch (err) {
    console.error(`Error for ${adId}:`, err.message);
  }
}

console.log(`\n✅ ${created} generated ads seeded from legacy data`);
