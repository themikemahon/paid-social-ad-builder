import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import type { StrategyDocType } from '@/lib/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES: Record<string, StrategyDocType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? null,
    filename: row.filename,
    fileType: row.file_type,
    blobUrl: row.blob_url,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/strategy-docs — list strategy documents for the current workspace.
 * Optional query param: ?project_id=<uuid> to filter by project.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();
    const projectId = request.nextUrl.searchParams.get('project_id');

    let rows;
    if (projectId) {
      rows = await sql`
        SELECT * FROM strategy_documents
        WHERE workspace_id = ${workspaceId} AND project_id = ${projectId}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT * FROM strategy_documents
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
      `;
    }

    return NextResponse.json(rows.map(mapRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list strategy documents');
  }
}

/**
 * POST /api/strategy-docs — upload a strategy document.
 * Expects multipart form data with:
 *   - file: the document file (pdf, docx, or txt, ≤10MB)
 *   - project_id (optional): associate with a specific project
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, workspaceId } = await requireRole(request, ['admin', 'editor']);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('project_id') as string | null;

    if (!file) {
      return apiError(400, 'VALIDATION_ERROR', 'file is required');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return apiError(400, 'VALIDATION_ERROR', 'File exceeds 10 MB size limit', {
        maxBytes: MAX_FILE_SIZE,
        actualBytes: file.size,
      });
    }

    // Validate file type
    const fileType = ALLOWED_TYPES[file.type];
    if (!fileType) {
      // Fallback: check extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      const extType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'txt' : null;
      if (!extType) {
        return apiError(400, 'VALIDATION_ERROR', 'Invalid file type. Accepted: pdf, docx, txt');
      }
      // Use extension-derived type
      return await uploadAndStore(file, extType as StrategyDocType, workspaceId, projectId, userId);
    }

    return await uploadAndStore(file, fileType, workspaceId, projectId, userId);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to upload strategy document');
  }
}

async function uploadAndStore(
  file: File,
  fileType: StrategyDocType,
  workspaceId: string,
  projectId: string | null,
  userId: string
): Promise<NextResponse> {
  const sql = getDb();

  // Upload to Vercel Blob
  const blob = await put(
    `strategy-docs/${workspaceId}/${Date.now()}-${file.name}`,
    file,
    { access: 'public' }
  );

  // Store metadata
  const rows = await sql`
    INSERT INTO strategy_documents (
      workspace_id, project_id, filename, file_type, blob_url, file_size_bytes, uploaded_by
    ) VALUES (
      ${workspaceId},
      ${projectId},
      ${file.name},
      ${fileType},
      ${blob.url},
      ${file.size},
      ${userId}
    )
    RETURNING *
  `;

  return NextResponse.json(mapRow(rows[0]), { status: 201 });
}
