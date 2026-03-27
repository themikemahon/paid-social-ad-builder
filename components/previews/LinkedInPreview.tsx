'use client';

import React from 'react';
import type { CopyBlockFields, BrandIdentity, CreativeFormatId } from '@/lib/types';
import { getTemplate } from '@/lib/templates';

export interface LinkedInPreviewProps {
  copyBlock: CopyBlockFields;
  brandIdentity: BrandIdentity;
  creativeFormat: CreativeFormatId;
  imageUrl?: string;
}

export function LinkedInPreview({
  copyBlock,
  brandIdentity,
  creativeFormat,
  imageUrl,
}: LinkedInPreviewProps) {
  const Template = getTemplate(creativeFormat);

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: 552,
      }}
    >
      {/* Header: company info + promoted label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
        {brandIdentity.logoUrl ? (
          <img
            src={brandIdentity.logoUrl}
            alt={brandIdentity.brandName}
            style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 4,
              backgroundColor: brandIdentity.colorPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            {brandIdentity.brandName.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#000' }}>
            {brandIdentity.brandName}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>Promoted</div>
        </div>
      </div>

      {/* Template content */}
      <div>
        {Template ? (
          <Template
            copyBlock={copyBlock}
            brandIdentity={brandIdentity}
            platform="linkedin"
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
          justifyContent: 'space-around',
          padding: '8px 16px',
          borderTop: '1px solid #e0e0e0',
        }}
      >
        {['👍 Like', '💬 Comment', '🔄 Repost', '📤 Send'].map((action) => (
          <button
            key={action}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#666',
              padding: '8px 4px',
              fontWeight: 600,
            }}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
