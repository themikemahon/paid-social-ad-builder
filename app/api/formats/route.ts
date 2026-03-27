import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { fetchFormatRecommendations } from '@/lib/adology';
import type { CreativeFormat, CreativeFormatId, FormatRanking } from '@/lib/types';

/** All 10 creative formats in alphabetical order (fallback). */
const ALL_FORMATS: CreativeFormat[] = [
  { id: 'comparison', name: 'Comparison', description: 'Side-by-side comparison layout' },
  { id: 'imessage', name: 'iMessage', description: 'iMessage conversation style' },
  { id: 'meme', name: 'Meme', description: 'Meme-style format with image and text' },
  { id: 'notes-app', name: 'Notes App', description: 'Notes app screenshot style' },
  { id: 'notification', name: 'Notification', description: 'Push notification style' },
  { id: 'photo-forward', name: 'Photo-Forward', description: 'Photo-dominant layout with text overlay' },
  { id: 'question-hook', name: 'Question Hook', description: 'Question-led engagement format' },
  { id: 'standard-hero', name: 'Standard Hero', description: 'Classic hero image with headline and CTA' },
  { id: 'stat-callout', name: 'Stat Callout', description: 'Statistics-focused highlight format' },
  { id: 'text-post', name: 'Text Post', description: 'Text-only social post format' },
];

/**
 * GET /api/formats — Get creative format recommendations.
 *
 * Query params:
 *   - project_id (optional): project to pull objective/persona from
 *
 * Returns ranked formats from Adology when available,
 * or all formats in alphabetical order as fallback.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    const projectId = request.nextUrl.searchParams.get('project_id');

    // Fetch workspace Adology config
    const wsRows = await sql`
      SELECT adology_brand_id FROM workspaces WHERE id = ${workspaceId}
    `;
    if (wsRows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }

    const brandId = wsRows[0].adology_brand_id as string | null;

    // Try to get ranked recommendations from Adology
    if (brandId && projectId) {
      const projRows = await sql`
        SELECT objectives FROM projects WHERE id = ${projectId} AND workspace_id = ${workspaceId}
      `;

      if (projRows.length > 0) {
        const objective = (projRows[0].objectives as string) || '';

        // Fetch assigned persona for the project (first one)
        const personaRows = await sql`
          SELECT ap.* FROM audience_personas ap
          INNER JOIN project_personas pp ON pp.persona_id = ap.id
          WHERE pp.project_id = ${projectId}
          LIMIT 1
        `;

        const persona = personaRows.length > 0
          ? {
              id: personaRows[0].id as string,
              workspaceId: personaRows[0].workspace_id as string,
              name: personaRows[0].name as string,
              demographics: (typeof personaRows[0].demographics === 'string'
                ? JSON.parse(personaRows[0].demographics)
                : personaRows[0].demographics ?? {}) as Record<string, unknown>,
              painPoints: (personaRows[0].pain_points ?? []) as string[],
              motivations: (personaRows[0].motivations ?? []) as string[],
              platformBehavior: (typeof personaRows[0].platform_behavior === 'string'
                ? JSON.parse(personaRows[0].platform_behavior)
                : personaRows[0].platform_behavior ?? {}) as Record<string, string>,
            }
          : null;

        const rankings = await fetchFormatRecommendations(objective, persona as any, brandId);

        if (rankings && rankings.length > 0) {
          return NextResponse.json({
            ranked: true,
            formats: rankings.map(enrichRanking),
          });
        }
      }
    }

    // Fallback: alphabetical listing
    return NextResponse.json({
      ranked: false,
      formats: ALL_FORMATS.map((f) => ({
        ...f,
        score: null,
        reason: null,
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Formats route error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch format recommendations');
  }
}

function enrichRanking(ranking: FormatRanking) {
  const format = ALL_FORMATS.find((f) => f.id === ranking.formatId);
  return {
    id: ranking.formatId,
    name: format?.name ?? ranking.formatId,
    description: format?.description ?? '',
    score: ranking.score,
    reason: ranking.reason,
  };
}
