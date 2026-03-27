import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { generateCopy } from '@/lib/claude';
import { fetchCategoryVoice, fetchCultureVoice } from '@/lib/adology';
import type {
  BrandIdentity,
  AdologyInsight,
  StrategyDocument,
  AudiencePersona,
  GenerationContext,
  SocialPlatform,
  CreativeFormatId,
} from '@/lib/types';

const VALID_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

/**
 * POST /api/generate — trigger Claude copy generation for a copy block.
 *
 * Body: { copyBlockId: string, targetPlatform: SocialPlatform, personaId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();

    const { copyBlockId, targetPlatform, personaId } = body;

    // Validate required fields
    if (!copyBlockId) {
      return apiError(400, 'VALIDATION_ERROR', 'copyBlockId is required');
    }
    if (!targetPlatform || !VALID_PLATFORMS.includes(targetPlatform)) {
      return apiError(400, 'VALIDATION_ERROR', `targetPlatform must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }

    // 1. Look up copy block → copy set → project → workspace
    const blockRows = await sql`
      SELECT cb.*, cs.project_id
      FROM copy_blocks cb
      JOIN copy_sets cs ON cs.id = cb.copy_set_id
      WHERE cb.id = ${copyBlockId}
      LIMIT 1
    `;
    if (blockRows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }
    const block = blockRows[0];
    const projectId = block.project_id as string;

    // Verify project belongs to the workspace
    const projectRows = await sql`
      SELECT * FROM projects WHERE id = ${projectId} AND workspace_id = ${workspaceId} LIMIT 1
    `;
    if (projectRows.length === 0) {
      return apiError(403, 'FORBIDDEN', 'Copy block does not belong to this workspace');
    }

    // 2. Fetch brand identity from workspace
    const wsRows = await sql`
      SELECT brand_name, logo_url, color_primary, color_secondary, color_accent, font_family,
             adology_brand_id, adology_custom_labels
      FROM workspaces WHERE id = ${workspaceId} LIMIT 1
    `;
    if (wsRows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Workspace not found');
    }
    const ws = wsRows[0];
    const brandIdentity: BrandIdentity = {
      brandName: ws.brand_name as string,
      logoUrl: (ws.logo_url as string) || null,
      colorPrimary: (ws.color_primary as string) || '#000000',
      colorSecondary: (ws.color_secondary as string) || '#666666',
      colorAccent: (ws.color_accent as string) || '#0066CC',
      fontFamily: (ws.font_family as string) || 'sans-serif',
    };

    // 3. Fetch Adology insights (category + culture voice)
    const adologyInsights: AdologyInsight[] = [];
    const adologyBrandId = ws.adology_brand_id as string | null;
    if (adologyBrandId) {
      const customLabels = (ws.adology_custom_labels as Record<string, string>) || {};
      const platformRows = await sql`
        SELECT platform FROM workspace_platforms
        WHERE workspace_id = ${workspaceId} AND enabled = true
      `;
      const platforms = platformRows.map((r) => r.platform as string);

      const [categoryVoice, cultureVoice] = await Promise.all([
        fetchCategoryVoice({ brandId: adologyBrandId, platforms, customLabels }),
        fetchCultureVoice({ brandId: adologyBrandId, platforms, customLabels }),
      ]);
      if (categoryVoice) adologyInsights.push(categoryVoice);
      if (cultureVoice) adologyInsights.push(cultureVoice);
    }

    // 4. Fetch strategy documents (workspace-level + project-level)
    const stratDocRows = await sql`
      SELECT id, workspace_id, project_id, filename, file_type, blob_url, file_size_bytes, created_at
      FROM strategy_documents
      WHERE workspace_id = ${workspaceId}
        AND (project_id IS NULL OR project_id = ${projectId})
      ORDER BY created_at ASC
    `;
    const strategyDocuments: StrategyDocument[] = stratDocRows.map((r) => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      projectId: (r.project_id as string) || null,
      filename: r.filename as string,
      fileType: r.file_type as StrategyDocument['fileType'],
      blobUrl: r.blob_url as string,
      fileSizeBytes: r.file_size_bytes as number,
      createdAt: r.created_at as string,
    }));

    // 5. Fetch persona
    let persona: AudiencePersona | null = null;
    if (personaId) {
      const personaRows = await sql`
        SELECT * FROM audience_personas WHERE id = ${personaId} AND workspace_id = ${workspaceId} LIMIT 1
      `;
      if (personaRows.length > 0) {
        persona = mapPersonaRow(personaRows[0]);
      }
    } else {
      // Fall back to first persona assigned to the project
      const assignedRows = await sql`
        SELECT ap.* FROM audience_personas ap
        JOIN project_personas pp ON pp.persona_id = ap.id
        WHERE pp.project_id = ${projectId}
        LIMIT 1
      `;
      if (assignedRows.length > 0) {
        persona = mapPersonaRow(assignedRows[0]);
      }
    }

    // 6. Assemble context and generate
    const existingCopy = {
      headline: block.headline as string,
      subhead: block.subhead as string,
      primaryCta: block.primary_cta as string,
      secondaryCta: block.secondary_cta as string,
    };
    const hasExistingCopy = existingCopy.headline || existingCopy.subhead ||
      existingCopy.primaryCta || existingCopy.secondaryCta;

    const context: GenerationContext = {
      adologyInsights,
      strategyDocuments,
      brandIdentity,
      persona,
      creativeFormat: (block.creative_format as CreativeFormatId) || 'standard-hero',
      targetPlatform: targetPlatform as SocialPlatform,
      existingCopy: hasExistingCopy ? existingCopy : null,
    };

    const copyFields = await generateCopy(context);
    return NextResponse.json(copyFields);
  } catch (err) {
    if (err instanceof NextResponse) return err;

    // Claude API or other generation errors → 502
    console.error('Copy generation failed:', err);
    return apiError(502, 'GENERATION_FAILED', 'Copy generation failed. Please try again.');
  }
}

function mapPersonaRow(r: Record<string, unknown>): AudiencePersona {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    name: r.name as string,
    demographics: (r.demographics as Record<string, unknown>) || {},
    painPoints: (r.pain_points as string[]) || [],
    motivations: (r.motivations as string[]) || [],
    platformBehavior: (r.platform_behavior as AudiencePersona['platformBehavior']) || ({} as AudiencePersona['platformBehavior']),
  };
}
