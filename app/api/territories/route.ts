import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? '',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const projectId = request.nextUrl.searchParams.get('project_id');
    if (!projectId) return apiError(400, 'VALIDATION_ERROR', 'project_id required');

    const sql = getDb();
    const rows = await sql`
      SELECT * FROM creative_territories
      WHERE project_id = ${projectId}
      ORDER BY sort_order ASC, created_at ASC
    `;

    // For each territory, fetch assigned audience IDs
    const result = await Promise.all(rows.map(async (r) => {
      const audiences = await sql`
        SELECT persona_id FROM territory_audiences WHERE territory_id = ${r.id}
      `;
      return { ...mapRow(r), audienceIds: audiences.map((a) => a.persona_id) };
    }));

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list territories');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();
    const { project_id, name, description, audience_ids } = body;

    if (!project_id) return apiError(400, 'VALIDATION_ERROR', 'project_id required');
    if (!name?.trim()) return apiError(400, 'VALIDATION_ERROR', 'name required');

    const [row] = await sql`
      INSERT INTO creative_territories (project_id, name, description, sort_order)
      VALUES (${project_id}, ${name.trim()}, ${description?.trim() || ''}, 
        COALESCE((SELECT MAX(sort_order) + 1 FROM creative_territories WHERE project_id = ${project_id}), 0))
      RETURNING *
    `;

    // Assign audiences if provided
    if (audience_ids?.length) {
      for (const pid of audience_ids) {
        await sql`INSERT INTO territory_audiences (territory_id, persona_id) VALUES (${row.id}, ${pid}) ON CONFLICT DO NOTHING`;
      }
    }

    return NextResponse.json({ ...mapRow(row), audienceIds: audience_ids || [] }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create territory');
  }
}
