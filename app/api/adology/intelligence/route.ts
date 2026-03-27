import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { fetchCategoryVoice, fetchCultureVoice } from '@/lib/adology';
import type { AdologyInsight, SocialPlatform } from '@/lib/types';

/**
 * GET /api/adology/intelligence — Fetch Tier 2 intelligence data
 * (Category Voice + Culture Voice) for the current workspace.
 *
 * Requires editor+ role. Returns whatever Adology data is available;
 * individual voices that fail are omitted rather than failing the whole request.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    // Fetch workspace for Adology config
    const wsRows = await sql`
      SELECT adology_brand_id, adology_custom_labels FROM workspaces WHERE id = ${workspaceId}
    `;
    if (wsRows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }

    const brandId = wsRows[0].adology_brand_id as string | null;
    if (!brandId) {
      return NextResponse.json({ insights: [], warning: 'No Adology brand ID configured for this workspace' });
    }

    const customLabels = (typeof wsRows[0].adology_custom_labels === 'string'
      ? JSON.parse(wsRows[0].adology_custom_labels)
      : wsRows[0].adology_custom_labels ?? {}) as Record<string, string>;

    // Fetch enabled platforms for this workspace
    const platformRows = await sql`
      SELECT platform FROM workspace_platforms
      WHERE workspace_id = ${workspaceId} AND enabled = true
    `;
    const platforms = platformRows.map((r) => r.platform as SocialPlatform);

    // Fetch both voices in parallel
    const [categoryVoice, cultureVoice] = await Promise.all([
      fetchCategoryVoice({ brandId, customLabels, platforms }),
      fetchCultureVoice({ brandId, customLabels, platforms }),
    ]);

    const insights: AdologyInsight[] = [];
    if (categoryVoice) insights.push(categoryVoice);
    if (cultureVoice) insights.push(cultureVoice);

    return NextResponse.json({ insights });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Adology intelligence route error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch Adology intelligence');
  }
}
