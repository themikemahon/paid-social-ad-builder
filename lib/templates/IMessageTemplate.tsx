import React from 'react';
import type { TemplateProps } from './types';

export function IMessageTemplate({ copyBlock, brandIdentity }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, backgroundColor: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: brandIdentity.colorPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {brandIdentity.logoUrl ? (
            <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 28, width: 28, borderRadius: '50%' }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{brandIdentity.brandName.charAt(0)}</span>
          )}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{brandIdentity.brandName}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: '#e5e7eb', borderRadius: '16px 16px 16px 4px', padding: '8px 14px' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>{copyBlock.headline}</p>
        </div>
        {copyBlock.subhead && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: '#e5e7eb', borderRadius: '16px 16px 16px 4px', padding: '8px 14px' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>{copyBlock.subhead}</p>
          </div>
        )}
        {copyBlock.primaryCta && (
          <div style={{ alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: brandIdentity.colorPrimary, borderRadius: '16px 16px 4px 16px', padding: '8px 14px' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{copyBlock.primaryCta}</p>
          </div>
        )}
        {copyBlock.secondaryCta && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: '#e5e7eb', borderRadius: '16px 16px 16px 4px', padding: '8px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{copyBlock.secondaryCta}</p>
          </div>
        )}
      </div>
    </div>
  );
}
