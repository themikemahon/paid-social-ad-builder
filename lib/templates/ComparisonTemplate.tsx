import React from 'react';
import type { TemplateProps } from './types';

export function ComparisonTemplate({ copyBlock, brandIdentity, imageUrl }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', border: '1px solid #e0e0e0' }}>
      <div style={{ padding: 16, backgroundColor: brandIdentity.colorPrimary, color: '#fff', textAlign: 'center' }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 24, marginBottom: 8 }} />}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{copyBlock.headline}</h2>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, padding: 16, borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>
          {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4, marginBottom: 8 }} />}
          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>{copyBlock.subhead || 'Before'}</p>
        </div>
        <div style={{ flex: 1, padding: 16, textAlign: 'center', backgroundColor: brandIdentity.colorSecondary + '11' }}>
          <p style={{ margin: 0, fontSize: 14, color: brandIdentity.colorPrimary, fontWeight: 600 }}>{copyBlock.primaryCta || 'After'}</p>
        </div>
      </div>
      {copyBlock.secondaryCta && (
        <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid #e0e0e0' }}>
          <span style={{ padding: '6px 14px', backgroundColor: brandIdentity.colorAccent, color: '#fff', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
            {copyBlock.secondaryCta}
          </span>
        </div>
      )}
    </div>
  );
}
