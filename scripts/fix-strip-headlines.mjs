import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Fix ALL platforms
const rows = await sql`SELECT id, platform, strip_headline, source_primary, image_headline, post_copy, source_secondary FROM generated_ads`;

let shFixed = 0;
let pcFixed = 0;

for (const r of rows) {
  const sh = r.strip_headline || '';
  const sp = r.source_primary || '';
  const ih = r.image_headline || '';

  const needsFix = !sh || sh === ih || sh.length > 70 ||
    sh.includes('stock photo') || sh.includes('Rule of') ||
    sh.includes('Revamp:') || sh.includes('graduated') ||
    sh.includes('After Revamp') || sh.includes('Sarah M') ||
    sh.includes('James C') || sh.includes('&nbsp;');

  if (needsFix) {
    let newHl = sp;
    if (newHl.length > 70) {
      const cut = newHl.lastIndexOf(' ', 70);
      newHl = cut > 20 ? newHl.substring(0, cut) : newHl.substring(0, 70);
    }
    if (!newHl) newHl = 'Build your online presence with Norton Revamp';

    await sql`UPDATE generated_ads SET strip_headline = ${newHl}, updated_at = NOW() WHERE id = ${r.id}`;
    shFixed++;
    console.log('Fixed strip:', r.platform, r.id.substring(0, 8), '|', JSON.stringify(sh.substring(0, 40)), '->', JSON.stringify(newHl.substring(0, 40)));
  }

  // Fix truncated post_copy
  const pc = r.post_copy || '';
  const ss = r.source_secondary || '';
  if (ss && ss.length > pc.length && !pc.endsWith('.') && !pc.endsWith('!') && !pc.endsWith('?')) {
    await sql`UPDATE generated_ads SET post_copy = ${ss}, updated_at = NOW() WHERE id = ${r.id}`;
    pcFixed++;
    console.log('Fixed post:', r.platform, r.id.substring(0, 8));
  }
}

console.log(`\nDone. Fixed ${shFixed} strip headlines, ${pcFixed} post_copy values across all platforms.`);
