import { describe, expect, it } from 'vitest';
import {
  countTemplatesByGroup,
  sortTemplatesForReview,
  templateStatusGroup,
} from './template-status';

describe('templateStatusGroup', () => {
  it('buckets every Meta status', () => {
    expect(templateStatusGroup('APPROVED')).toBe('approved');
    expect(templateStatusGroup('PENDING')).toBe('pending');
    expect(templateStatusGroup('IN_APPEAL')).toBe('pending');
    expect(templateStatusGroup('REJECTED')).toBe('attention');
    expect(templateStatusGroup('PAUSED')).toBe('attention');
    expect(templateStatusGroup('DISABLED')).toBe('attention');
    expect(templateStatusGroup('DRAFT')).toBe('draft');
    expect(templateStatusGroup(undefined)).toBe('draft');
  });
});

describe('countTemplatesByGroup', () => {
  it('counts each bucket and the total', () => {
    expect(
      countTemplatesByGroup([
        { status: 'APPROVED' },
        { status: 'APPROVED' },
        { status: 'PENDING' },
        { status: 'REJECTED' },
        { status: 'DRAFT' },
      ]),
    ).toEqual({ all: 5, approved: 2, pending: 1, attention: 1, draft: 1 });
  });
});

describe('sortTemplatesForReview', () => {
  it('puts problems and pending above approved, newest first within a bucket', () => {
    const sorted = sortTemplatesForReview([
      { name: 'a_approved', status: 'APPROVED', created_at: '2026-10-14T10:00:00Z' },
      { name: 'b_pending_old', status: 'PENDING', created_at: '2026-10-10T10:00:00Z' },
      { name: 'c_rejected', status: 'REJECTED', created_at: '2026-10-01T10:00:00Z' },
      {
        name: 'd_pending_new',
        status: 'PENDING',
        created_at: '2026-10-01T10:00:00Z',
        last_submitted_at: '2026-10-14T11:00:00Z',
      },
    ]);
    expect(sorted.map((t) => t.name)).toEqual([
      'c_rejected',
      'd_pending_new',
      'b_pending_old',
      'a_approved',
    ]);
  });
});
