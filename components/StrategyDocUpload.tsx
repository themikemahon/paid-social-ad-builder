'use client';

import React, { useState, useRef } from 'react';

interface StrategyDocUploadProps {
  workspaceId: string;
  projectId?: string;
  onUploaded: () => void;
}

const ACCEPTED_TYPES = '.pdf,.docx,.txt';
const MAX_SIZE_MB = 10;

export function StrategyDocUpload({ workspaceId, projectId, onUploaded }: StrategyDocUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    // Client-side size validation
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_SIZE_MB}MB limit`);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspace_id', workspaceId);
      if (projectId) formData.append('project_id', projectId);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/strategy-docs', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      setSuccess(`Uploaded ${file.name}`);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={styles.fileInput}
          aria-label="Select strategy document"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          style={{
            ...styles.uploadBtn,
            opacity: uploading ? 0.6 : 1,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      <div style={styles.hint}>PDF, DOCX, or TXT · Max {MAX_SIZE_MB}MB</div>
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  fileInput: {
    fontSize: 12,
    flex: 1,
  },
  uploadBtn: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#242424',
    color: '#fff',
    fontFamily: 'inherit',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
  },
  error: {
    fontSize: 12,
    color: '#dc2626',
  },
  success: {
    fontSize: 12,
    color: '#16a34a',
  },
};
