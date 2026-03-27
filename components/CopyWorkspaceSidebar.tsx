'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type {
  CopyBlock,
  CopyBlockFields,
  CopySet,
  CreativeFormatId,
  SocialPlatform,
  ApprovalStatus,
} from '@/lib/types';
import { ApprovalButton } from './ApprovalButton';
import { CommentPanel } from './CommentPanel';

/** Build auth + workspace headers for API calls. */
function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const hdrs: Record<string, string> = { ...extra };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    const wsId = localStorage.getItem('current_workspace_id');
    if (token) hdrs['Authorization'] = `Bearer ${token}`;
    if (wsId) hdrs['x-workspace-id'] = wsId;
  }
  return hdrs;
}

// ============================================================
// Props interfaces
// ============================================================

export interface CopyWorkspaceSidebarProps {
  copySets: CopySet[];
  activeCopyBlockId: string | null;
  projectId: string;
  targetPlatform: SocialPlatform;
  currentUserId: string;
  userRole: string;
  onCopyBlockSelect: (copyBlockId: string) => void;
  onCopyBlockUpdate: (copyBlock: CopyBlock) => void;
  onCopyBlockAdd: (copyBlock: CopyBlock) => void;
  onCsvImport: () => void;
}

interface FormatOption {
  id: string;
  name: string;
  description: string;
  score?: number | null;
  reason?: string | null;
}

// ============================================================
// CopyBlockEditor
// ============================================================

interface CopyBlockEditorProps {
  copyBlock: CopyBlock;
  onUpdate: (copyBlock: CopyBlock) => void;
}

function CopyBlockEditor({ copyBlock, onUpdate }: CopyBlockEditorProps) {
  const [fields, setFields] = useState<CopyBlockFields>({
    headline: copyBlock.headline,
    subhead: copyBlock.subhead,
    primaryCta: copyBlock.primaryCta,
    secondaryCta: copyBlock.secondaryCta,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFieldsRef = useRef(fields);

  // Sync when a different copy block is selected
  useEffect(() => {
    const next: CopyBlockFields = {
      headline: copyBlock.headline,
      subhead: copyBlock.subhead,
      primaryCta: copyBlock.primaryCta,
      secondaryCta: copyBlock.secondaryCta,
    };
    setFields(next);
    latestFieldsRef.current = next;
  }, [copyBlock.id, copyBlock.headline, copyBlock.subhead, copyBlock.primaryCta, copyBlock.secondaryCta]);

  const persistFields = useCallback(
    async (updated: CopyBlockFields) => {
      try {
        const res = await fetch(`/api/copy-blocks/${copyBlock.id}`, {
          method: 'PUT',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            headline: updated.headline,
            subhead: updated.subhead,
            primary_cta: updated.primaryCta,
            secondary_cta: updated.secondaryCta,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          onUpdate({ ...copyBlock, ...mapResponseToCopyBlock(saved) });
        }
      } catch {
        // Silently fail — user can retry
      }
    },
    [copyBlock, onUpdate],
  );

  const handleChange = (field: keyof CopyBlockFields, value: string) => {
    const next = { ...latestFieldsRef.current, [field]: value };
    setFields(next);
    latestFieldsRef.current = next;

    // Debounce: persist 2 seconds after last keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistFields(latestFieldsRef.current);
    }, 2000);

    // Optimistic update for real-time preview
    onUpdate({ ...copyBlock, ...next });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fieldConfig: { key: keyof CopyBlockFields; label: string; multiline?: boolean }[] = [
    { key: 'headline', label: 'Headline' },
    { key: 'subhead', label: 'Subhead', multiline: true },
    { key: 'primaryCta', label: 'Primary CTA' },
    { key: 'secondaryCta', label: 'Secondary CTA' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fieldConfig.map(({ key, label, multiline }) => (
        <div key={key}>
          <label
            htmlFor={`cb-${copyBlock.id}-${key}`}
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}
          >
            {label}
          </label>
          {multiline ? (
            <textarea
              id={`cb-${copyBlock.id}-${key}`}
              value={fields[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <input
              id={`cb-${copyBlock.id}-${key}`}
              type="text"
              value={fields[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CopySetList
// ============================================================

interface CopySetListProps {
  copySets: CopySet[];
  activeCopyBlockId: string | null;
  onCopyBlockSelect: (copyBlockId: string) => void;
  onAddCopyBlock: (copySetId: string) => void;
}

function CopySetList({ copySets, activeCopyBlockId, onCopyBlockSelect, onAddCopyBlock }: CopySetListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {copySets.map((cs) => (
        <div key={cs.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{cs.name}</span>
            <button
              type="button"
              onClick={() => onAddCopyBlock(cs.id)}
              style={{
                padding: '2px 8px',
                fontSize: 12,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#f9fafb',
                cursor: 'pointer',
                color: '#374151',
              }}
              aria-label={`Add copy block to ${cs.name}`}
            >
              + Block
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(cs.copyBlocks ?? []).map((cb) => (
              <button
                key={cb.id}
                type="button"
                onClick={() => onCopyBlockSelect(cb.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  fontSize: 13,
                  border: activeCopyBlockId === cb.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: activeCopyBlockId === cb.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  color: '#111827',
                }}
              >
                {cb.headline || '(untitled)'}
              </button>
            ))}
            {(cs.copyBlocks ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 10px' }}>No copy blocks yet</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


// ============================================================
// FormatPicker
// ============================================================

interface FormatPickerProps {
  projectId: string;
  currentFormat: CreativeFormatId;
  onFormatSelect: (formatId: CreativeFormatId) => void;
}

function FormatPicker({ projectId, currentFormat, onFormatSelect }: FormatPickerProps) {
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [ranked, setRanked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/formats?project_id=${projectId}`, {
      headers: {
        ...(typeof window !== 'undefined' && localStorage.getItem('auth_token')
          ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
          : {}),
        ...(typeof window !== 'undefined' && localStorage.getItem('current_workspace_id')
          ? { 'x-workspace-id': localStorage.getItem('current_workspace_id')! }
          : {}),
      },
    })
      .then((res) => res.json())
      .then((data: { ranked: boolean; formats: FormatOption[] }) => {
        if (cancelled) return;
        setRanked(data.ranked ?? false);
        setFormats(data.formats ?? []);
      })
      .catch(() => {
        // On error, leave empty — user can retry
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return <div style={{ fontSize: 12, color: '#9ca3af', padding: 8 }}>Loading formats…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        Creative Format {ranked ? '(Ranked)' : '(A–Z)'}
      </div>
      {formats.map((fmt) => {
        const isActive = fmt.id === currentFormat;
        return (
          <button
            key={fmt.id}
            type="button"
            onClick={() => onFormatSelect(fmt.id as CreativeFormatId)}
            style={{
              textAlign: 'left',
              padding: '6px 10px',
              fontSize: 12,
              border: isActive ? '2px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: 6,
              background: isActive ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              color: '#111827',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {fmt.name}
              {ranked && fmt.score != null && (
                <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                  Score: {fmt.score}
                </span>
              )}
            </span>
            {ranked && fmt.reason && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>{fmt.reason}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// GenerateCopyButton
// ============================================================

interface GenerateCopyButtonProps {
  copyBlockId: string;
  targetPlatform: SocialPlatform;
  onGenerated: (fields: CopyBlockFields) => void;
}

function GenerateCopyButton({ copyBlockId, targetPlatform, onGenerated }: GenerateCopyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ copyBlockId, targetPlatform }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }
      const fields: CopyBlockFields = await res.json();
      onGenerated(fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background: loading ? '#93c5fd' : '#2563eb',
          border: 'none',
          borderRadius: 6,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Generating…' : '✨ Generate Copy'}
      </button>
      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}


// ============================================================
// CsvUploadDialog
// ============================================================

interface CsvUploadDialogProps {
  copySetId: string;
  onImportComplete: () => void;
}

function CsvUploadDialog({ copySetId, onImportComplete }: CsvUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<{
    successCount: number;
    errorCount: number;
    errors: Array<{ row: number; column: string; message: string }>;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('copy_set_id', copySetId);

      const res = await fetch('/api/csv-import', {
        method: 'POST',
        headers: getApiHeaders(),
        body: formData,
      });
      const data = await res.json();
      setSummary(data);
      onImportComplete();
    } catch {
      setSummary({ successCount: 0, errorCount: 1, errors: [{ row: 0, column: '', message: 'Upload failed' }] });
    } finally {
      setUploading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '8px 16px',
          fontSize: 13,
          border: '1px solid #d1d5db',
          borderRadius: 6,
          background: '#f9fafb',
          cursor: 'pointer',
          color: '#374151',
        }}
      >
        📄 Import CSV
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 8,
        padding: 16,
        background: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Import CSV</span>
        <button
          type="button"
          onClick={() => { setOpen(false); setSummary(null); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#6b7280',
          }}
          aria-label="Close CSV import"
        >
          ✕
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ fontSize: 12 }}
        aria-label="Select CSV file"
      />

      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        style={{
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background: uploading ? '#93c5fd' : '#2563eb',
          border: 'none',
          borderRadius: 6,
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>

      {summary && (
        <div style={{ fontSize: 12, color: '#374151' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            ✅ {summary.successCount} imported, ⚠️ {summary.errorCount} skipped
          </div>
          {summary.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {summary.errors.map((err, i) => (
                <li key={i} style={{ color: '#dc2626', marginBottom: 2 }}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function mapResponseToCopyBlock(data: Record<string, unknown>): Partial<CopyBlock> {
  return {
    id: data.id as string,
    copySetId: data.copySetId as string,
    headline: data.headline as string,
    subhead: data.subhead as string,
    primaryCta: data.primaryCta as string,
    secondaryCta: data.secondaryCta as string,
    creativeFormat: data.creativeFormat as CreativeFormatId,
    sortOrder: data.sortOrder as number,
    approvalStatus: data.approvalStatus as CopyBlock['approvalStatus'],
    approvedBy: (data.approvedBy as string) ?? null,
    approvedAt: (data.approvedAt as string) ?? null,
  };
}


// ============================================================
// CopyWorkspaceSidebar (main export)
// ============================================================

export function CopyWorkspaceSidebar({
  copySets,
  activeCopyBlockId,
  projectId,
  targetPlatform,
  currentUserId,
  userRole,
  onCopyBlockSelect,
  onCopyBlockUpdate,
  onCopyBlockAdd,
  onCsvImport,
}: CopyWorkspaceSidebarProps) {
  // Find the active copy block across all sets
  const activeCopyBlock = activeCopyBlockId
    ? copySets
        .flatMap((cs) => cs.copyBlocks ?? [])
        .find((cb) => cb.id === activeCopyBlockId) ?? null
    : null;

  // Find the copy set that contains the active block
  const activeCopySetId = activeCopyBlock
    ? copySets.find((cs) => (cs.copyBlocks ?? []).some((cb) => cb.id === activeCopyBlock.id))?.id ?? null
    : null;

  const handleAddCopyBlock = async (copySetId: string) => {
    try {
      const existingBlocks = copySets.find((cs) => cs.id === copySetId)?.copyBlocks ?? [];
      const res = await fetch('/api/copy-blocks', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          copy_set_id: copySetId,
          sort_order: existingBlocks.length,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newBlock: CopyBlock = mapResponseToCopyBlock(data) as CopyBlock;
        onCopyBlockAdd(newBlock);
      }
    } catch {
      // Silently fail
    }
  };

  const handleFormatSelect = async (formatId: CreativeFormatId) => {
    if (!activeCopyBlock) return;
    try {
      const res = await fetch(`/api/copy-blocks/${activeCopyBlock.id}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ creative_format: formatId }),
      });
      if (res.ok) {
        const data = await res.json();
        onCopyBlockUpdate({ ...activeCopyBlock, ...mapResponseToCopyBlock(data) });
      }
    } catch {
      // Silently fail
    }
  };

  const handleGenerated = async (fields: CopyBlockFields) => {
    if (!activeCopyBlock) return;
    // Persist generated fields
    try {
      const res = await fetch(`/api/copy-blocks/${activeCopyBlock.id}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          headline: fields.headline,
          subhead: fields.subhead,
          primary_cta: fields.primaryCta,
          secondary_cta: fields.secondaryCta,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCopyBlockUpdate({ ...activeCopyBlock, ...mapResponseToCopyBlock(data) });
      }
    } catch {
      // Still update locally even if persist fails
      onCopyBlockUpdate({ ...activeCopyBlock, ...fields });
    }
  };

  return (
    <div
      style={{
        width: 320,
        minWidth: 320,
        borderRight: '1px solid #e5e7eb',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 700,
          fontSize: 15,
          color: '#111827',
        }}
      >
        Copy Workspace
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Copy set list */}
        <CopySetList
          copySets={copySets}
          activeCopyBlockId={activeCopyBlockId}
          onCopyBlockSelect={onCopyBlockSelect}
          onAddCopyBlock={handleAddCopyBlock}
        />

        {/* Active block editor */}
        {activeCopyBlock && (
          <>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Edit Copy Block
              </div>
              <CopyBlockEditor copyBlock={activeCopyBlock} onUpdate={onCopyBlockUpdate} />
            </div>

            {/* Format picker */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <FormatPicker
                projectId={projectId}
                currentFormat={activeCopyBlock.creativeFormat}
                onFormatSelect={handleFormatSelect}
              />
            </div>

            {/* Generate button */}
            <GenerateCopyButton
              copyBlockId={activeCopyBlock.id}
              targetPlatform={targetPlatform}
              onGenerated={handleGenerated}
            />

            {/* Approval */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <ApprovalButton
                copyBlockId={activeCopyBlock.id}
                approvalStatus={activeCopyBlock.approvalStatus}
                approvedBy={activeCopyBlock.approvedBy}
                approvedAt={activeCopyBlock.approvedAt}
                userRole={userRole}
                onApprovalChange={(update) => {
                  onCopyBlockUpdate({
                    ...activeCopyBlock,
                    approvalStatus: update.approvalStatus,
                    approvedBy: update.approvedBy,
                    approvedAt: update.approvedAt,
                  });
                }}
              />
            </div>

            {/* Comments */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <CommentPanel
                copyBlockId={activeCopyBlock.id}
                currentUserId={currentUserId}
              />
            </div>
          </>
        )}

        {/* CSV import */}
        {activeCopySetId && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <CsvUploadDialog copySetId={activeCopySetId} onImportComplete={onCsvImport} />
          </div>
        )}
      </div>
    </div>
  );
}
