/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + dark-theme badge classes here so the template manager,
 * inbox picker, and broadcast picker stay aligned.
 */

import type { MessageTemplate, MessageTemplateStatus } from '@/types';

export interface TemplateStatusDisplay {
  label: string;
  classes: string;
}

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    label: 'Draft',
    classes: 'bg-slate-600/20 text-muted-foreground border-slate-600/30',
  },
  PENDING: {
    label: 'Pending',
    classes: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  },
  APPROVED: {
    label: 'Approved',
    classes: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30',
  },
  REJECTED: {
    label: 'Rejected',
    classes: 'bg-red-600/20 text-red-400 border-red-600/30',
  },
  PAUSED: {
    label: 'Paused',
    classes: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  },
  DISABLED: {
    label: 'Disabled',
    classes: 'bg-red-900/30 text-red-500 border-red-900/40',
  },
  IN_APPEAL: {
    label: 'In Appeal',
    classes: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  },
  PENDING_DELETION: {
    label: 'Pending Deletion',
    classes: 'bg-slate-700/30 text-muted-foreground border-slate-700/40',
  },
};

/** Buckets the Templates page counts and filters by. */
export type TemplateStatusGroup = 'approved' | 'pending' | 'attention' | 'draft';

/** Needs-attention first so problems surface above the approved bulk. */
export const TEMPLATE_STATUS_GROUP_ORDER: readonly TemplateStatusGroup[] = [
  'attention',
  'pending',
  'draft',
  'approved',
];

export function templateStatusGroup(
  status: MessageTemplateStatus | null | undefined,
): TemplateStatusGroup {
  switch (status) {
    case 'APPROVED':
      return 'approved';
    case 'PENDING':
    case 'IN_APPEAL':
      return 'pending';
    case 'REJECTED':
    case 'PAUSED':
    case 'DISABLED':
      return 'attention';
    default:
      return 'draft';
  }
}

export function countTemplatesByGroup(
  templates: Pick<MessageTemplate, 'status'>[],
): Record<TemplateStatusGroup | 'all', number> {
  const counts = { all: templates.length, approved: 0, pending: 0, attention: 0, draft: 0 };
  for (const t of templates) counts[templateStatusGroup(t.status)]++;
  return counts;
}

export function sortTemplatesForReview<
  T extends Pick<MessageTemplate, 'status' | 'name'> & {
    last_submitted_at?: string | null;
    created_at: string;
  },
>(templates: T[]): T[] {
  const rank = (t: T) => TEMPLATE_STATUS_GROUP_ORDER.indexOf(templateStatusGroup(t.status));
  const when = (t: T) => Date.parse(t.last_submitted_at || t.created_at) || 0;
  return [...templates].sort(
    (a, b) => rank(a) - rank(b) || when(b) - when(a) || a.name.localeCompare(b.name),
  );
}
