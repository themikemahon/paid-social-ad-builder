'use client';

import React, { useState } from 'react';
import type { CopyBlockFields, BrandIdentity, CreativeFormatId, SocialPlatform } from '@/lib/types';
import { LinkedInPreview } from './previews/LinkedInPreview';
import { MetaPreview } from './previews/MetaPreview';
import { RedditPreview } from './previews/RedditPreview';

export interface ThreeColumnPreviewProps {
  copyBlock: CopyBlockFields;
  brandIdentity: BrandIdentity;
  creativeFormat: CreativeFormatId;
  imageUrl?: string;
}

interface ColumnConfig {
  platform: SocialPlatform;
  label: string;
  component: React.ComponentType<{
    copyBlock: CopyBlockFields;
    brandIdentity: BrandIdentity;
    creativeFormat: CreativeFormatId;
    imageUrl?: string;
  }>;
}

const COLUMNS: ColumnConfig[] = [
  { platform: 'linkedin', label: 'LinkedIn', component: LinkedInPreview },
  { platform: 'meta', label: 'Meta', component: MetaPreview },
  { platform: 'reddit', label: 'Reddit', component: RedditPreview },
];

export function ThreeColumnPreview({
  copyBlock,
  brandIdentity,
  creativeFormat,
  imageUrl,
}: ThreeColumnPreviewProps) {
  const [collapsed, setCollapsed] = useState<Record<SocialPlatform, boolean>>({
    linkedin: false,
    meta: false,
    reddit: false,
  });

  const visibleColumns = COLUMNS.filter((col) => !collapsed[col.platform]);

  const toggleColumn = (platform: SocialPlatform) => {
    setCollapsed((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {/* Collapsed column restore buttons */}
      {COLUMNS.some((col) => collapsed[col.platform]) && (
        <div style={{ display: 'flex', gap: 8 }}>
          {COLUMNS.filter((col) => collapsed[col.platform]).map((col) => (
            <button
              key={col.platform}
              type="button"
              onClick={() => toggleColumn(col.platform)}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#f9fafb',
                cursor: 'pointer',
              }}
              aria-label={`Expand ${col.label} column`}
            >
              + {col.label}
            </button>
          ))}
        </div>
      )}

      {/* Visible columns */}
      <div style={{ display: 'flex', gap: 16, width: '100%' }}>
        {visibleColumns.map((col) => {
          const Preview = col.component;
          return (
            <div
              key={col.platform}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{col.label}</span>
                <button
                  type="button"
                  onClick={() => toggleColumn(col.platform)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    background: '#f9fafb',
                    cursor: 'pointer',
                  }}
                  aria-label={`Collapse ${col.label} column`}
                >
                  −
                </button>
              </div>

              {/* Preview */}
              <Preview
                copyBlock={copyBlock}
                brandIdentity={brandIdentity}
                creativeFormat={creativeFormat}
                imageUrl={imageUrl}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
