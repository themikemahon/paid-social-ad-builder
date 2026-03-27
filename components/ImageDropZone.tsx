'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { SocialPlatform } from '@/lib/types';

export interface ImageDropZoneProps {
  copyBlockId: string;
  platform: SocialPlatform;
  imageUrl?: string | null;
  onImageChange: (imageUrl: string | null) => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

export function ImageDropZone({
  copyBlockId,
  platform,
  imageUrl,
  onImageChange,
}: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Only PNG and JPEG images are accepted');
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('copy_block_id', copyBlockId);
        formData.append('platform', platform);

        const res = await fetch('/api/images', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Upload failed');
        }

        const data = await res.json();
        onImageChange(data.url || data.blobUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [copyBlockId, platform, onImageChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemove = async () => {
    setError(null);
    try {
      const res = await fetch('/api/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copy_block_id: copyBlockId, platform }),
      });
      if (res.ok) {
        onImageChange(null);
      }
    } catch {
      setError('Failed to remove image');
    }
  };

  // If an image is already set, show it with a remove button
  if (imageUrl) {
    return (
      <div style={{ position: 'relative' }}>
        <img
          src={imageUrl}
          alt="Ad creative"
          style={{
            width: '100%',
            display: 'block',
            borderRadius: 4,
            objectFit: 'cover',
          }}
        />
        <button
          type="button"
          onClick={handleRemove}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
          aria-label="Remove image"
        >
          ✕
        </button>
        {error && (
          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        aria-label="Drop image here or click to upload"
        style={{
          border: `2px dashed ${dragging ? '#2563eb' : '#d1d5db'}`,
          borderRadius: 8,
          padding: '20px 12px',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          background: dragging ? '#eff6ff' : '#f9fafb',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {uploading ? (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Uploading…</span>
        ) : (
          <>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🖼️</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Drop image here or click to upload
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
              PNG or JPEG
            </div>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {error && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
