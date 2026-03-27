/**
 * Property tests for Approval Workflow.
 *
 * Property 37: Approval locks copy block — approved status, approved_by, approved_at set
 * Property 38: Approval revocation unlocks copy block — status reset to pending, fields cleared
 * Property 39: Approval restricted to reviewers and admins — editor/viewer rejected
 *
 * Validates: Requirements 13.1, 13.2, 13.3
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-approvals-property-tests-minimum-length';
});

// ── Mocks ──

const mockSql = vi.fn();
vi.mock('@/lib/db', () => ({
  getDb: () => mockSql,
}));

beforeEach(() => {
  mockSql.mockReset();
});

// ── Constants ──

const TEST_USER_ID = 'user-uuid-approvals-test';
const TEST_WORKSPACE_ID = 'workspace-uuid-approvals-test';

// ── Helpers ──

function buildApprovalRequest(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost:3000/api/approvals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: JSON.stringify(body),
  });
}

// ── Property 37: Approval locks copy block ──
// **Validates: Requirements 13.1**
describe('Property 37: Approval locks copy block', () => {
  it('approving a copy block sets approved status, approved_by, and approved_at', async () => {
    const { POST } = await import('@/app/api/approvals/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom<UserRole>('reviewer', 'admin'),
        async (copyBlockId, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const req = buildApprovalRequest(token, TEST_WORKSPACE_ID, {
            copy_block_id: copyBlockId,
            action: 'approve',
          });

          const approvedAt = new Date().toISOString();

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT existing copy block
          mockSql.mockResolvedValueOnce([{ id: copyBlockId, approval_status: 'pending' }]);
          // 3. UPDATE copy_blocks RETURNING
          mockSql.mockResolvedValueOnce([{
            id: copyBlockId,
            approval_status: 'approved',
            approved_by: TEST_USER_ID,
            approved_at: approvedAt,
          }]);

          const res = await POST(req);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.approvalStatus).toBe('approved');
          expect(body.approvedBy).toBe(TEST_USER_ID);
          expect(body.approvedAt).toBeTruthy();
          expect(body.id).toBe(copyBlockId);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ── Property 38: Approval revocation unlocks copy block ──
// **Validates: Requirements 13.2**
describe('Property 38: Approval revocation unlocks copy block', () => {
  it('revoking approval resets status to pending and clears approved_by and approved_at', async () => {
    const { POST } = await import('@/app/api/approvals/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom<UserRole>('reviewer', 'admin'),
        async (copyBlockId, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const req = buildApprovalRequest(token, TEST_WORKSPACE_ID, {
            copy_block_id: copyBlockId,
            action: 'revoke',
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT existing copy block (currently approved)
          mockSql.mockResolvedValueOnce([{ id: copyBlockId, approval_status: 'approved' }]);
          // 3. UPDATE copy_blocks RETURNING (revoked)
          mockSql.mockResolvedValueOnce([{
            id: copyBlockId,
            approval_status: 'pending',
            approved_by: null,
            approved_at: null,
          }]);

          const res = await POST(req);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.approvalStatus).toBe('pending');
          expect(body.approvedBy).toBeNull();
          expect(body.approvedAt).toBeNull();
          expect(body.id).toBe(copyBlockId);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ── Property 39: Approval restricted to reviewers and admins ──
// **Validates: Requirements 13.3**
describe('Property 39: Approval restricted to reviewers and admins', () => {
  it('editor and viewer roles are rejected with 403 FORBIDDEN', async () => {
    const { POST } = await import('@/app/api/approvals/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom<UserRole>('editor', 'viewer'),
        async (copyBlockId, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const req = buildApprovalRequest(token, TEST_WORKSPACE_ID, {
            copy_block_id: copyBlockId,
            action: 'approve',
          });

          // 1. requireRole membership check — returns non-allowed role
          mockSql.mockResolvedValueOnce([{ role }]);
          // requireRole throws 403 before any further SQL calls

          const res = await POST(req);
          expect(res.status).toBe(403);

          const body = await res.json();
          expect(body.code).toBe('FORBIDDEN');
        }
      ),
      { numRuns: 30 }
    );
  });
});
