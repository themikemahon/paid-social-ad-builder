import type { CreativeFormat, CreativeFormatId } from '../types';
import type { TemplateProps } from './types';
import { StandardHeroTemplate } from './StandardHeroTemplate';
import { PhotoForwardTemplate } from './PhotoForwardTemplate';
import { QuestionHookTemplate } from './QuestionHookTemplate';
import { StatCalloutTemplate } from './StatCalloutTemplate';
import { TextPostTemplate } from './TextPostTemplate';
import { ComparisonTemplate } from './ComparisonTemplate';
import { NotesAppTemplate } from './NotesAppTemplate';
import { NotificationTemplate } from './NotificationTemplate';
import { IMessageTemplate } from './IMessageTemplate';
import { MemeTemplate } from './MemeTemplate';

type TemplateComponent = React.ComponentType<TemplateProps>;

const TEMPLATE_MAP: Record<CreativeFormatId, TemplateComponent> = {
  'standard-hero': StandardHeroTemplate,
  'photo-forward': PhotoForwardTemplate,
  'question-hook': QuestionHookTemplate,
  'stat-callout': StatCalloutTemplate,
  'text-post': TextPostTemplate,
  'comparison': ComparisonTemplate,
  'notes-app': NotesAppTemplate,
  'notification': NotificationTemplate,
  'imessage': IMessageTemplate,
  'meme': MemeTemplate,
};

const FORMAT_DEFINITIONS: CreativeFormat[] = [
  { id: 'standard-hero', name: 'Standard Hero', description: 'Classic hero image with headline overlay and CTA' },
  { id: 'photo-forward', name: 'Photo-Forward', description: 'Image-dominant layout with minimal text overlay' },
  { id: 'question-hook', name: 'Question Hook', description: 'Leads with a provocative question to drive engagement' },
  { id: 'stat-callout', name: 'Stat Callout', description: 'Highlights a key statistic or data point' },
  { id: 'text-post', name: 'Text Post', description: 'Text-only format optimized for organic feel' },
  { id: 'comparison', name: 'Comparison', description: 'Side-by-side before/after or versus layout' },
  { id: 'notes-app', name: 'Notes App', description: 'Styled as a mobile notes app screenshot' },
  { id: 'notification', name: 'Notification', description: 'Styled as a push notification alert' },
  { id: 'imessage', name: 'iMessage', description: 'Styled as an iMessage conversation' },
  { id: 'meme', name: 'Meme', description: 'Meme-style format with top/bottom text over image' },
];

export function getTemplate(formatId: string): TemplateComponent | null {
  return TEMPLATE_MAP[formatId as CreativeFormatId] ?? null;
}

export function getAllFormats(): CreativeFormat[] {
  return FORMAT_DEFINITIONS;
}

export type { TemplateProps } from './types';
