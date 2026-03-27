import type { CopyBlockFields, BrandIdentity, SocialPlatform } from '../types';

export interface TemplateProps {
  copyBlock: CopyBlockFields;
  brandIdentity: BrandIdentity;
  platform: SocialPlatform;
  imageUrl?: string;
  aspectRatio?: string;
}
