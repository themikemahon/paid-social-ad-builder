import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { generateCopy } from '@/lib/claude';
import { fetchCategoryVoice, fetchCultureVoice } from '@/lib/adology';
import type {
  BrandIdentity, AdologyInsight, StrategyDocument, AudiencePersona,
  GenerationContext, SocialPlatform, CreativeFormatId,
} from '@/lib/types';

const VALID_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const { copyBlockId, platforms } = await request.json();

    if (!copyBlockId) return apiError(400, 'VALIDATION_ERROR', 'copyBlockId is required');

    // Look up copy block
    const blockRows = await sql`
      SELECT cb.*, cs.project_id FROM copy_blocks cb
      JOIN copy_sets cs ON cs.id = cb.copy_set_id
      WHERE cb.id = ${copyBlockId} LIMIT 1
    `;
    if (blockRows.length === 0) return apiError(404, 'NOT_FOUND', 'Copy block not found');
    const block = blockRows[0];
    const projectId = block.project_id as string;
    const territoryId = block.territory_id as string | null;
    const personaId = block.persona_id as string | null;

    // Get project (derive workspace if not provided via header)
    let proj;
    if (workspaceId) {
      const rows = await sql`SELECT * FROM projects WHERE id = ${projectId} AND workspace_id = ${workspaceId} LIMIT 1`;
      if (rows.length === 0) return apiError(403, 'FORBIDDEN', 'Project not in this workspace');
      proj = rows[0];
    } else {
      const rows = await sql`SELECT * FROM projects WHERE id = ${projectId} LIMIT 1`;
      if (rows.length === 0) return apiError(404, 'NOT_FOUND', 'Project not found');
      proj = rows[0];
    }
    const wsId = workspaceId || (proj.workspace_id as string);
    const enabledPlatforms: SocialPlatform[] = (platforms as SocialPlatform[]) ||
      (proj.enabled_platforms as SocialPlatform[]) || VALID_PLATFORMS;

    // Fetch brand identity
    const wsRows = await sql`
      SELECT brand_name, logo_url, color_primary, color_secondary, color_accent, font_family,
             adology_brand_id, adology_custom_labels
      FROM workspaces WHERE id = ${wsId} LIMIT 1
    `;
    if (wsRows.length === 0) return apiError(404, 'NOT_FOUND', 'Workspace not found');
    const ws = wsRows[0];
    const brandIdentity: BrandIdentity = {
      brandName: ws.brand_name as string, logoUrl: (ws.logo_url as string) || null,
      colorPrimary: (ws.color_primary as string) || '#000000',
      colorSecondary: (ws.color_secondary as string) || '#666666',
      colorAccent: (ws.color_accent as string) || '#0066CC',
      fontFamily: (ws.font_family as string) || 'sans-serif',
    };

    // Adology insights
    const adologyInsights: AdologyInsight[] = [];
    const adologyBrandId = ws.adology_brand_id as string | null;
    if (adologyBrandId) {
      const customLabels = (ws.adology_custom_labels as Record<string, string>) || {};
      const platRows = await sql`SELECT platform FROM workspace_platforms WHERE workspace_id = ${wsId} AND enabled = true`;
      const plats = platRows.map((r: Record<string, unknown>) => r.platform as string);
      const [catV, culV] = await Promise.all([
        fetchCategoryVoice({ brandId: adologyBrandId, platforms: plats, customLabels }),
        fetchCultureVoice({ brandId: adologyBrandId, platforms: plats, customLabels }),
      ]);
      if (catV) adologyInsights.push(catV);
      if (culV) adologyInsights.push(culV);
    }

    // Strategy docs
    const sdRows = await sql`
      SELECT id, workspace_id, project_id, filename, file_type, blob_url, file_size_bytes, created_at
      FROM strategy_documents WHERE workspace_id = ${wsId} AND (project_id IS NULL OR project_id = ${projectId})
      ORDER BY created_at ASC
    `;
    const strategyDocuments: StrategyDocument[] = sdRows.map((r: Record<string, unknown>) => ({
      id: r.id as string, workspaceId: r.workspace_id as string,
      projectId: (r.project_id as string) || null, filename: r.filename as string,
      fileType: r.file_type as StrategyDocument['fileType'], blobUrl: r.blob_url as string,
      fileSizeBytes: r.file_size_bytes as number, createdAt: r.created_at as string,
    }));

    // Persona
    let persona: AudiencePersona | null = null;
    if (personaId) {
      const pRows = await sql`SELECT * FROM audience_personas WHERE id = ${personaId} LIMIT 1`;
      if (pRows.length > 0) persona = mapPersona(pRows[0]);
    }

    const existingCopy = {
      headline: block.headline as string, subhead: block.subhead as string,
      primaryCta: block.primary_cta as string, secondaryCta: block.secondary_cta as string,
    };

    const createdAds = [];
    console.log('[generate-ads] platforms:', enabledPlatforms, 'block:', copyBlockId);

    for (const platform of enabledPlatforms) {
      if (!VALID_PLATFORMS.includes(platform)) continue;
      console.log('[generate-ads] generating for', platform);

      const context: GenerationContext = {
        adologyInsights, strategyDocuments, brandIdentity, persona,
        creativeFormat: (block.creative_format as CreativeFormatId) || 'standard-hero',
        targetPlatform: platform, existingCopy,
      };

      const fields = await generateCopy(context);
      console.log('[generate-ads]', platform, 'generated:', JSON.stringify(fields).substring(0, 100));

      const rows = await sql`
        INSERT INTO generated_ads (
          copy_block_id, territory_id, persona_id, platform, creative_format,
          post_copy, image_headline, image_subhead, strip_headline, strip_cta,
          source_primary, source_secondary, source_cta_native, source_cta_custom, copy_notes
        ) VALUES (
          ${copyBlockId}, ${territoryId}, ${personaId}, ${platform},
          ${block.creative_format || 'standard-hero'},
          ${fields.subhead || existingCopy.subhead},
          ${fields.headline || existingCopy.headline},
          ${fields.subhead || existingCopy.subhead},
          ${fields.headline || existingCopy.headline},
          ${existingCopy.primaryCta || fields.primaryCta || 'Learn More'},
          ${existingCopy.headline}, ${existingCopy.subhead},
          ${existingCopy.primaryCta || fields.primaryCta},
          ${existingCopy.secondaryCta || fields.secondaryCta},
          ${'AI-generated from copy block'}
        )
        ON CONFLICT (copy_block_id, platform) DO UPDATE SET
          territory_id = EXCLUDED.territory_id, persona_id = EXCLUDED.persona_id,
          post_copy = EXCLUDED.post_copy, image_headline = EXCLUDED.image_headline,
          image_subhead = EXCLUDED.image_subhead, strip_headline = EXCLUDED.strip_headline,
          strip_cta = EXCLUDED.strip_cta, source_primary = EXCLUDED.source_primary,
          source_secondary = EXCLUDED.source_secondary, source_cta_native = EXCLUDED.source_cta_native,
          source_cta_custom = EXCLUDED.source_cta_custom, copy_notes = EXCLUDED.copy_notes,
          updated_at = NOW()
        RETURNING *
      `;
      if (rows.length > 0) createdAds.push(rows[0]);
    }

    console.log('[generate-ads] done, created/updated:', createdAds.length);
    return NextResponse.json({ ok: true, count: createdAds.length });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Ad generation failed:', err);
    return apiError(502, 'GENERATION_FAILED', 'Ad generation failed. Please try again.');
  }
}

function mapPersona(r: Record<string, unknown>): AudiencePersona {
  return {
    id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string,
    demographics: (r.demographics as Record<string, unknown>) || {},
    painPoints: (r.pain_points as string[]) || [], motivations: (r.motivations as string[]) || [],
    platformBehavior: (r.platform_behavior as AudiencePersona['platformBehavior']) || ({} as AudiencePersona['platformBehavior']),
  };
}
