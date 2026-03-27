import React from 'react';
import type { TemplateProps } from './types';

export function NotificationTemplate({ copyBlock, brandIdentity }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily }}>
      <div style={{ backgroundColor: '#f3f4f6', borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: brandIdentity.colorPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {brandIdentity.logoUrl ? (
            <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 24, width: 24, borderRadius: 6 }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{brandIdentity.brandName.charAt(0)}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{brandIdentity.brandName}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>now</span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#111827' }}>{copyBlock.headline}</p>
          {copyBlock.subhead && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{copyBlock.subhead}</p>}
          {(copyBlock.primaryCta || copyBlock.secondaryCta) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {copyBlock.primaryCta && (
                <span style={{ padding: '4px 10px', backgroundColor: brandIdentity.colorAccent, color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  {copyBlock.primaryCta}
                </span>
              )}
              {copyBlock.secondaryCta && (
                <span style={{ padding: '4px 10px', backgroundColor: '#e5e7eb', color: '#374151', borderRadius: 6, fontSize: 12 }}>
                  {copyBlock.secondaryCta}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
