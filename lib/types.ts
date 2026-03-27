// ============================================================
// Type Unions
// ============================================================

export type UserRole = 'admin' | 'editor' | 'reviewer' | 'viewer';
export type SocialPlatform = 'linkedin' | 'meta' | 'reddit';
export type ApprovalStatus = 'pending' | 'approved';
export type StrategyDocType = 'pdf' | 'docx' | 'txt';

export type CreativeFormatId =
  | 'standard-hero'
  | 'photo-forward'
  | 'question-hook'
  | 'stat-callout'
  | 'text-post'
  | 'comparison'
  | 'notes-app'
  | 'notification'
  | 'imessage'
  | 'meme';

// ============================================================
// Domain Interfaces
// ============================================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  brandName: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent: string | null;
  fontFamily: string | null;
  brandUrls: string[];
  adologyBrandId: string | null;
  adologyCustomLabels: Record<string, string>;
  createdAt: string;
}

export interface BrandIdentity {
  brandName: string;
  logoUrl: string | null;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontFamily: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  user?: User;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  brief: string | null;
  objectives: string | null;
  strategyOverrides: Record<string, unknown>;
  createdAt: string;
}

export interface AudiencePersona {
  id: string;
  workspaceId: string;
  name: string;
  demographics: Record<string, unknown>;
  painPoints: string[];
  motivations: string[];
  platformBehavior: Record<SocialPlatform, string>;
}

export interface StrategyDocument {
  id: string;
  workspaceId: string;
  projectId: string | null;
  filename: string;
  fileType: StrategyDocType;
  blobUrl: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface CopySet {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  copyBlocks?: CopyBlock[];
}

export interface CopyBlock {
  id: string;
  copySetId: string;
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta: string;
  creativeFormat: CreativeFormatId;
  sortOrder: number;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface CopyBlockFields {
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta: string;
}

export interface Comment {
  id: string;
  copyBlockId: string;
  authorId: string;
  authorName?: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

export interface CopyBlockImage {
  id: string;
  copyBlockId: string;
  blobUrl: string;
  aspectRatio: string | null;
  platform: SocialPlatform | null;
}

export interface CreativeFormat {
  id: CreativeFormatId;
  name: string;
  description: string;
}

export interface AdologyInsight {
  voice: string;
  data: Record<string, unknown>;
  distributions?: unknown[];
  comparisons?: unknown[];
  gaps?: unknown[];
  trends?: unknown[];
}

export interface FormatRanking {
  formatId: CreativeFormatId;
  score: number;
  reason: string;
}

export interface GenerationContext {
  adologyInsights: AdologyInsight[];
  strategyDocuments: StrategyDocument[];
  brandIdentity: BrandIdentity;
  persona: AudiencePersona | null;
  creativeFormat: CreativeFormatId;
  targetPlatform: SocialPlatform;
  existingCopy: CopyBlockFields | null;
}

export interface CsvError {
  row: number;
  column: string;
  message: string;
}

export interface CsvImportResult {
  blocks: CopyBlockFields[];
  errors: CsvError[];
  successCount: number;
  errorCount: number;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

// ============================================================
// Constants
// ============================================================

export const PLATFORM_ASPECT_RATIOS: Record<SocialPlatform, string[]> = {
  linkedin: ['1.91/1', '1/1', '9/16'],
  meta: ['1/1', '1.91/1', '9/16'],
  reddit: ['4/3', '1/1', '1.91/1'],
};
