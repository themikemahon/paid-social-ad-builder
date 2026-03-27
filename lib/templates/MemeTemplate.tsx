import React from 'react';
import type { TemplateProps } from './types';

export function MemeTemplate({ copyBlock, brandIdentity, imageUrl }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', textAlign: 'center' }}>
      <div style={{ padding: '12px 16px', backgroundColor: '#000' }}>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, textShadow: '2px 2px 0 #000' }}>
          {copyBlock.headline}
        </p>
      </div>
      <div style={{ position: 'relative', minHeight: 200 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: 200, backgroundColor: brandIdentity.colorSecondary }} />
        )}
        {brandIdentity.logoUrl && (
          <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ position: 'absolute', bottom: 8, right: 8, height: 20, opacity: 0.7 }} />
        )}
      </div>
      <div style={{ padding: '12px 16px', backgroundColor: '#000' }}>
        {copyBlock.subhead && (
          <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, textShadow: '2px 2px 0 #000' }}>
            {copyBlock.subhead}
          </p>
        )}
        {(copyBlock.primaryCta || copyBlock.secondaryCta) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            {copyBlock.primaryCta && (
              <span style={{ padding: '6px 12px', backgroundColor: brandIdentity.colorAccent, color: '#fff', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                {copyBlock.primaryCta}
              </span>
            )}
            {copyBlock.secondaryCta && (
              <span style={{ padding: '6px 12px', border: '1px solid #fff', color: '#fff', borderRadius: 4, fontSize: 12 }}>
                {copyBlock.secondaryCta}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
