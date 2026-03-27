'use client';

import React, { useState } from 'react';
import type { ApprovalStatus } from '@/lib/types';

export interface ApprovalButtonProps {
  copyBlockId: string;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Current user's role — only reviewer and admin can approve */
  userRole: string;
  onApprovalChange: (update: {
    approvalStatus: ApprovalStatus;
    approvedBy: string | null;
    approvedAt: string | null;
  }) => void;
}

export function ApprovalButton({
  copyBlockId,
  approvalStatus,
  approvedAt,
  userRole,
  onApprovalChange,
}: ApprovalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canApprove = userRole === 'reviewer' || userRole === 'admin';
  const isApproved = approvalStatus === 'approved';

  const handleClick = async () => {
    if (!canApprove) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copy_block_id: copyBlockId,
          action: isApproved ? 'revoke' : 'approve',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update approval');
      }

      const data = await res.json();
      onApprovalChange({
        approvalStatus: data.approvalStatus,
        approvedBy: data.approvedBy ?? null,
        approvedAt: data.approvedAt ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update approval');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading || !canApprove}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: isApproved ? '#dc2626' : '#fff',
            background: loading
              ? '#d1d5db'
              : isApproved
                ? '#fff'
                : '#16a34a',
            border: isApproved ? '1px solid #dc2626' : 'none',
            borderRadius: 6,
            cursor: loading || !canApprove ? 'not-allowed' : 'pointer',
            opacity: canApprove ? 1 : 0.5,
          }}
          aria-label={isApproved ? 'Revoke approval' : 'Approve copy block'}
        >
          {loading
            ? 'Updating…'
            : isApproved
              ? '✕ Revoke Approval'
              : '✓ Approve'}
        </button>

        {isApproved && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            Approved
            {approvedAt && (
              <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>
                {new Date(approvedAt).toLocaleDateString()}
              </span>
            )}
          </span>
        )}

        {!canApprove && !isApproved && (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            Only reviewers and admins can approve
          </span>
        )}
      </div>

      {error && (
        <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>
      )}
    </div>
  );
}
