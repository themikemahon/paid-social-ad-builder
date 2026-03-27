import React from 'react';
import type { TemplateProps } from './types';

export function StandardHeroTemplate({ copyBlock, brandIdentity, imageUrl }: TemplateProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 320,
        backgroundColor: brandIdentity.colorPrimary,
        fontFamily: brandIdentity.fontFamily,
        color: '#fff',
        overflow: 'hidden',
        borderRadius: 8,
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
        />
      )}
      <div style={{ position: 'relative', padding: 24, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 320, justifyContent: 'flex-end' }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 32, width: 'auto', marginBottom: 8 }} />}
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{copyBlock.headline}</h2>
        {copyBlock.subhead && <p style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>{copyBlock.subhead}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {copyBlock.primaryCta && (
            <span style={{ padding: '8px 16px', backgroundColor: brandIdentity.colorAccent, borderRadius: 4, fontSize: 14, fontWeight: 600 }}>
              {copyBlock.primaryCta}
            </span>
          )}
          {copyBlock.secondaryCta && (
            <span style={{ padding: '8px 16px', border: '1px solid #fff', borderRadius: 4, fontSize: 14 }}>
              {copyBlock.secondaryCta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
