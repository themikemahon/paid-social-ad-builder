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

// Enable UUID generation
await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

// ============================================================
// Users & Authentication
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Workspaces (Brand containers)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    logo_url TEXT,
    color_primary TEXT,
    color_secondary TEXT,
    color_accent TEXT,
    font_family TEXT,
    brand_urls JSONB DEFAULT '[]',
    adology_brand_id TEXT,
    adology_custom_labels JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Workspace Members (Role-based access)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
  )
`;

// ============================================================
// Workspace Platforms (Enabled social platforms per workspace)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS workspace_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'meta', 'reddit')),
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    UNIQUE(workspace_id, platform)
  )
`;

// ============================================================
// Audience Personas
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS audience_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    demographics JSONB DEFAULT '{}',
    pain_points TEXT[] DEFAULT '{}',
    motivations TEXT[] DEFAULT '{}',
    platform_behavior JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Projects (Campaign containers within a workspace)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    brief TEXT,
    objectives TEXT,
    strategy_overrides JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Strategy Documents
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS strategy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
    blob_url TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Project-Persona junction
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS project_personas (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    persona_id UUID NOT NULL REFERENCES audience_personas(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, persona_id)
  )
`;

// ============================================================
// Copy Sets (Groups of copy blocks within a project)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS copy_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Copy Blocks (Individual ad copy units)
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS copy_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    copy_set_id UUID NOT NULL REFERENCES copy_sets(id) ON DELETE CASCADE,
    headline TEXT DEFAULT '',
    subhead TEXT DEFAULT '',
    primary_cta TEXT DEFAULT '',
    secondary_cta TEXT DEFAULT '',
    creative_format TEXT DEFAULT 'standard-hero',
    sort_order INTEGER DEFAULT 0,
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Copy Block Comments
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS copy_block_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    copy_block_id UUID NOT NULL REFERENCES copy_blocks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Copy Block Images
// ============================================================
await sql`
  CREATE TABLE IF NOT EXISTS copy_block_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    copy_block_id UUID NOT NULL REFERENCES copy_blocks(id) ON DELETE CASCADE,
    blob_url TEXT NOT NULL,
    aspect_ratio TEXT,
    platform TEXT CHECK (platform IN ('linkedin', 'meta', 'reddit')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ============================================================
// Indexes
// ============================================================
await sql`CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_audience_personas_workspace ON audience_personas(workspace_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_strategy_documents_workspace ON strategy_documents(workspace_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_strategy_documents_project ON strategy_documents(project_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_copy_sets_project ON copy_sets(project_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_copy_blocks_copy_set ON copy_blocks(copy_set_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_copy_block_comments_block ON copy_block_comments(copy_block_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_copy_block_images_block ON copy_block_images(copy_block_id)`;

console.log("✅ New schema tables and indexes created (or already exist)");
