'use client';

import React from 'react';
import type { CopyBlockFields, BrandIdentity, CreativeFormatId } from '@/lib/types';
import { getTemplate } from '@/lib/templates';

export interface RedditPreviewProps {
  copyBlock: CopyBlockFields;
  brandIdentity: BrandIdentity;
  creativeFormat: CreativeFormatId;
  imageUrl?: string;
}

export function RedditPreview({
  copyBlock,
  brandIdentity,
  creativeFormat,
  imageUrl,
}: RedditPreviewProps) {
  const Template = getTemplate(creativeFormat);

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#fff',
        border: '1px solid #ccc',
        borderRadius: 4,
        overflow: 'hidden',
        maxWidth: 600,
      }}
    >
      {/* Header: subreddit + promoted flair */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {brandIdentity.logoUrl ? (
          <img
            src={brandIdentity.logoUrl}
            alt={brandIdentity.brandName}
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: brandIdentity.colorPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {brandIdentity.brandName.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#1a1a1b' }}>
            u/{brandIdentity.brandName.replace(/\s+/g, '')}
          </div>
          <span
            style={{
              fontSize: 10,
              color: '#0079d3',
              backgroundColor: '#e8f0fe',
              padding: '1px 6px',
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            Promoted
          </span>
        </div>
      </div>

      {/* Template content */}
      <div>
        {Template ? (
          <Template
            copyBlock={copyBlock}
            brandIdentity={brandIdentity}
            platform="reddit"
            imageUrl={imageUrl}
          />
        ) : (
          <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>
            Unknown format: {creativeFormat}
          </div>
        )}
      </div>

      {/* Engagement bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          borderTop: '1px solid #edeff1',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: '#878a8c',
              padding: 2,
            }}
            aria-label="Upvote"
          >
            ⬆
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1b' }}>Vote</span>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: '#878a8c',
              padding: 2,
            }}
            aria-label="Downvote"
          >
            ⬇
          </button>
        </div>
        {['💬 Comment', '↗️ Share'].map((action) => (
          <button
            key={action}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: '#878a8c',
              padding: '4px 2px',
              fontWeight: 700,
            }}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
