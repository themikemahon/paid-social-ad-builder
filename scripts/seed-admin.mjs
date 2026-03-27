import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";
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

const email = "admin@norton.com";
const password = "admin123";
const displayName = "Admin User";
const passwordHash = createHash("sha256").update(password).digest("hex");

async function seed() {
  // Create user
  const [user] = await sql`
    INSERT INTO users (email, password_hash, display_name)
    VALUES (${email}, ${passwordHash}, ${displayName})
    ON CONFLICT (email) DO UPDATE SET display_name = ${displayName}
    RETURNING id
  `;
  console.log(`User created: ${user.id} (${email})`);

  // Create workspace
  const [ws] = await sql`
    INSERT INTO workspaces (name, brand_name, color_primary, color_secondary, color_accent, font_family)
    VALUES ('Norton Workspace', 'Norton', '#FEEB29', '#242424', '#666666', 'Inter')
    RETURNING id
  `;
  console.log(`Workspace created: ${ws.id}`);

  // Add user as admin member
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${ws.id}, ${user.id}, 'admin')
    ON CONFLICT (workspace_id, user_id) DO NOTHING
  `;
  console.log(`User added as admin to workspace`);

  // Enable all platforms
  for (const platform of ["linkedin", "meta", "reddit"]) {
    await sql`
      INSERT INTO workspace_platforms (workspace_id, platform, enabled)
      VALUES (${ws.id}, ${platform}, true)
      ON CONFLICT (workspace_id, platform) DO NOTHING
    `;
  }
  console.log(`Platforms enabled: linkedin, meta, reddit`);

  console.log(`\nDone! Log in with:`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
