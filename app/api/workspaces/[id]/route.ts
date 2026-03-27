import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateHexColor(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw apiError(400, 'VALIDATION_ERROR', `${field} must be a valid hex color (e.g. #FF0000)`);
  }
  return value;
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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/workspaces/[id] — get workspace details.
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
    const rows = await sql`SELECT * FROM workspaces WHERE id = ${id} LIMIT 1`;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }

    return NextResponse.json(mapWorkspaceRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get workspace');
  }
}

/**
 * PUT /api/workspaces/[id] — update workspace (admin-only).
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin']);
    const { id } = await context.params;
    const body = await request.json();

    const { brand_name, name, logo_url, color_primary, color_secondary, color_accent, font_family, brand_urls, adology_brand_id, adology_custom_labels } = body;

    if (brand_name !== undefined && (typeof brand_name !== 'string' || brand_name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'brand_name cannot be empty');
    }

    if (color_primary !== undefined) validateHexColor(color_primary, 'color_primary');
    if (color_secondary !== undefined) validateHexColor(color_secondary, 'color_secondary');
    if (color_accent !== undefined) validateHexColor(color_accent, 'color_accent');

    const sql = getDb();
    const rows = await sql`
      UPDATE workspaces SET
        name = COALESCE(${name ?? null}, name),
        brand_name = COALESCE(${brand_name ?? null}, brand_name),
        logo_url = COALESCE(${logo_url ?? null}, logo_url),
        color_primary = COALESCE(${color_primary ?? null}, color_primary),
        color_secondary = COALESCE(${color_secondary ?? null}, color_secondary),
        color_accent = COALESCE(${color_accent ?? null}, color_accent),
        font_family = COALESCE(${font_family ?? null}, font_family),
        brand_urls = COALESCE(${brand_urls ? JSON.stringify(brand_urls) : null}, brand_urls),
        adology_brand_id = COALESCE(${adology_brand_id ?? null}, adology_brand_id),
        adology_custom_labels = COALESCE(${adology_custom_labels ? JSON.stringify(adology_custom_labels) : null}, adology_custom_labels),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }

    return NextResponse.json(mapWorkspaceRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update workspace');
  }
}

/**
 * DELETE /api/workspaces/[id] — delete workspace (admin-only).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`DELETE FROM workspaces WHERE id = ${id} RETURNING id`;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete workspace');
  }
}
