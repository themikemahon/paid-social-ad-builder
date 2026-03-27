import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import type { SocialPlatform } from '@/lib/types';

const VALID_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/workspaces/[id]/platforms — list enabled platforms.
 * Any workspace member can view.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;

    if (id !== workspaceId) {
      return apiError(403, 'FORBIDDEN', 'Workspace ID mismatch');
    }

    const sql = getDb();
    const rows = await sql`
      SELECT id, workspace_id, platform, config, enabled
      FROM workspace_platforms
      WHERE workspace_id = ${id}
      ORDER BY platform ASC
    `;

    const platforms = rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      platform: r.platform,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : (r.config ?? {}),
      enabled: r.enabled,
    }));

    return NextResponse.json(platforms);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list platforms');
  }
}

/**
 * PUT /api/workspaces/[id]/platforms — upsert platform configuration (admin-only).
 * Body: { platform: string, enabled: boolean, config?: object }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin']);
    const { id } = await context.params;
    const body = await request.json();
    const { platform, enabled, config } = body;

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return apiError(400, 'VALIDATION_ERROR', `platform must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }

    if (typeof enabled !== 'boolean') {
      return apiError(400, 'VALIDATION_ERROR', 'enabled must be a boolean');
    }

    const sql = getDb();
    const configJson = JSON.stringify(config || {});

    // Upsert: insert or update on conflict
    const rows = await sql`
      INSERT INTO workspace_platforms (workspace_id, platform, config, enabled)
      VALUES (${id}, ${platform}, ${configJson}, ${enabled})
      ON CONFLICT (workspace_id, platform)
      DO UPDATE SET config = ${configJson}, enabled = ${enabled}
      RETURNING *
    `;

    return NextResponse.json({
      id: rows[0].id,
      workspaceId: rows[0].workspace_id,
      platform: rows[0].platform,
      config: typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : (rows[0].config ?? {}),
      enabled: rows[0].enabled,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update platform');
  }
}
