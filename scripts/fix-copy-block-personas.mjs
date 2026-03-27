import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Persona IDs from DB
const PERSONAS = {
  'Opportunity Seeker': '71dc3355-0b51-4fb3-b38a-08416e7cd6cc',
  'Authority Builder': 'be0b2e68-6060-4a22-9ba6-c3ede3b9d969',
  'Foundation Builder': 'bcf4e75a-780b-45e6-937a-d6df72a84c8a',
  'Growth Driver': '28ed0209-3cc7-4e48-9194-547a0f281ee6',
  'Community Engager': 'a06af8c8-e664-4346-815a-fcee0b250cce',
};

// Map copy block headlines to their audience from the spreadsheet
// Format: partial headline match -> persona name
const HEADLINE_TO_PERSONA = [
  // General Product
  ['Build the online presence that helps you get noticed', 'Opportunity Seeker'],
  ['Turn solid expertise into the online presence', 'Authority Builder'],
  ['Build credibility from day one', 'Foundation Builder'],
  ['Build your reputation and grow', 'Growth Driver'],
  ['Post with purpose and build your online presence', 'Community Engager'],

  // Problem / Solution
  ['Feeling invisible to hiring managers', 'Opportunity Seeker'],
  ['Your experience speaks for itself. Does your profile', 'Authority Builder'],
  ['Stop overthinking what to post', 'Foundation Builder'],
  ['Is your profile driving your pipeline', 'Growth Driver'],
  ['You already love showing up online', 'Community Engager'],

  // Trust Angle
  ['Norton protects your digital life. Now it protects', 'Opportunity Seeker'],
  ['Norton built its reputation on protection', 'Authority Builder'],
  ['Norton has always built confidence', 'Foundation Builder'],
  ['Norton protects you online. Now it helps your busi', 'Growth Driver'],
  ['Take control of your online narrative', 'Community Engager'],
];

const blocks = await sql`SELECT id, headline, territory_id, persona_id FROM copy_blocks`;

let fixed = 0;
for (const block of blocks) {
  if (block.persona_id) continue; // already assigned

  const hl = block.headline || '';
  let matched = null;

  for (const [pattern, persona] of HEADLINE_TO_PERSONA) {
    if (hl.includes(pattern)) {
      matched = persona;
      break;
    }
  }

  if (matched && PERSONAS[matched]) {
    await sql`UPDATE copy_blocks SET persona_id = ${PERSONAS[matched]}, updated_at = NOW() WHERE id = ${block.id}`;
    fixed++;
    console.log('Assigned:', block.id.substring(0, 8), '|', matched, '|', hl.substring(0, 50));
  } else {
    console.log('UNMATCHED:', block.id.substring(0, 8), '|', hl.substring(0, 60));
  }
}

console.log(`\nFixed ${fixed} copy blocks.`);
