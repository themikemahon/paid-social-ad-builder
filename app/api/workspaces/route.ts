import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateHexColor(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw apiError(400, 'VALIDATION_ERROR', `${field} must be a valid hex color (e.g. #FF0000)`);
  }
  return value;
}

async function authenticate(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw apiError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header');
  }
  const session = await verifySession(authHeader.slice(7));
  if (!session) {
    throw apiError(401, 'UNAUTHORIZED', 'Invalid or expired session token');
  }
  return session.userId;
}

/**
 * GET /api/workspaces — list workspaces the current user belongs to.
 * Falls back to listing all workspaces for cookie-based (site password) auth.
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    let userId: string | null = null;
    try { userId = await authenticate(request); } catch { /* cookie auth fallback */ }

    if (userId) {
      const rows = await sql`
        SELECT w.* FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = ${userId}
        ORDER BY w.created_at DESC
      `;
      return NextResponse.json(rows.map(mapWorkspaceRow));
    }

    // Cookie-based auth — return all workspaces
    const rows = await sql`SELECT * FROM workspaces ORDER BY created_at DESC`;
    return NextResponse.json(rows.map(mapWorkspaceRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list workspaces');
  }
}

/**
 * POST /api/workspaces — create a new workspace (admin-only).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    const sql = getDb();

    // Check if user is an admin in any workspace (global admin check)
    const adminCheck = await sql`
      SELECT 1 FROM workspace_members
      WHERE user_id = ${userId} AND role = 'admin'
      LIMIT 1
    `;
    if (adminCheck.length === 0) {
      return apiError(403, 'FORBIDDEN', 'Only admins can create workspaces');
    }

    const body = await request.json();
    const { brand_name, name, logo_url, color_primary, color_secondary, color_accent, font_family, brand_urls, adology_brand_id, adology_custom_labels } = body;

    if (!brand_name || (typeof brand_name === 'string' && brand_name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'brand_name is required');
    }

    const colorPrimary = validateHexColor(color_primary, 'color_primary');
    const colorSecondary = validateHexColor(color_secondary, 'color_secondary');
    const colorAccent = validateHexColor(color_accent, 'color_accent');

    const rows = await sql`
      INSERT INTO workspaces (
        name, brand_name, logo_url,
        color_primary, color_secondary, color_accent,
        font_family, brand_urls,
        adology_brand_id, adology_custom_labels
      ) VALUES (
        ${name || brand_name},
        ${brand_name},
        ${logo_url || null},
        ${colorPrimary},
        ${colorSecondary},
        ${colorAccent},
        ${font_family || null},
        ${JSON.stringify(brand_urls || [])},
        ${adology_brand_id || null},
        ${JSON.stringify(adology_custom_labels || {})}
      )
      RETURNING *
    `;

    // Auto-add creator as admin member
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${rows[0].id}, ${userId}, 'admin')
    `;

    return NextResponse.json(mapWorkspaceRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create workspace');
  }
}

function mapWorkspaceRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    logoUrl: row.logo_url ?? null,
    colorPrimary: row.color_primary ?? null,
    colorSecondary: row.color_secondary ?? null,
    colorAccent: row.color_accent ?? null,
    fontFamily: row.font_family ?? null,
    brandUrls: typeof row.brand_urls === 'string' ? JSON.parse(row.brand_urls) : (row.brand_urls ?? []),
    adologyBrandId: row.adology_brand_id ?? null,
    adologyCustomLabels: typeof row.adology_custom_labels === 'string' ? JSON.parse(row.adology_custom_labels) : (row.adology_custom_labels ?? {}),
    createdAt: row.created_at,
  };
}
