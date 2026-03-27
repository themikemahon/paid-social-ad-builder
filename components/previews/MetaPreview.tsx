'use client';

import React from 'react';
import type { CopyBlockFields, BrandIdentity, CreativeFormatId } from '@/lib/types';
import { getTemplate } from '@/lib/templates';

export interface MetaPreviewProps {
  copyBlock: CopyBlockFields;
  brandIdentity: BrandIdentity;
  creativeFormat: CreativeFormatId;
  imageUrl?: string;
}

export function MetaPreview({
  copyBlock,
  brandIdentity,
  creativeFormat,
  imageUrl,
}: MetaPreviewProps) {
  const Template = getTemplate(creativeFormat);

  return (
    <div
      style={{
        fontFamily: 'Helvetica, Arial, sans-serif',
        backgroundColor: '#fff',
        border: '1px solid #dddfe2',
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: 500,
      }}
    >
      {/* Header: page name + sponsored label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
        {brandIdentity.logoUrl ? (
          <img
            src={brandIdentity.logoUrl}
            alt={brandIdentity.brandName}
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: brandIdentity.colorPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {brandIdentity.brandName.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#050505' }}>
            {brandIdentity.brandName}
          </div>
          <div style={{ fontSize: 12, color: '#65676b' }}>
            Sponsored · 🌐
          </div>
        </div>
      </div>

      {/* Template content */}
      <div>
        {Template ? (
          <Template
            copyBlock={copyBlock}
            brandIdentity={brandIdentity}
            platform="meta"
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
          borderTop: '1px solid #dddfe2',
        }}
      >
        {['👍 Like', '💬 Comment', '↗️ Share'].map((action) => (
          <button
            key={action}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: '#65676b',
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
