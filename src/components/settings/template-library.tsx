'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Clock,
  Eye,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { WhatsAppTemplatePreview } from '@/components/whatsapp/whatsapp-template-preview';
import {
  countTemplatesByGroup,
  sortTemplatesForReview,
  templateStatusConfig,
  templateStatusGroup,
  type TemplateStatusGroup,
} from '@/lib/template-status';
import type { MessageTemplate } from '@/types';

type GroupFilter = TemplateStatusGroup | 'all';
type CategoryFilter = 'all' | MessageTemplate['category'];

const GROUPS: {
  key: GroupFilter;
  label: string;
  hint: string;
  dot: string;
  bar: string;
}[] = [
  { key: 'all', label: 'All templates', hint: 'In this workspace', dot: 'bg-foreground/60', bar: '' },
  { key: 'approved', label: 'Approved', hint: 'Ready to send', dot: 'bg-emerald-400', bar: 'bg-emerald-500' },
  { key: 'pending', label: 'Pending', hint: 'Waiting for Meta review', dot: 'bg-yellow-400', bar: 'bg-yellow-500' },
  { key: 'attention', label: 'Needs attention', hint: 'Rejected, paused or disabled', dot: 'bg-red-400', bar: 'bg-red-500' },
  { key: 'draft', label: 'Drafts', hint: 'Not submitted yet', dot: 'bg-slate-400', bar: 'bg-slate-500' },
];

const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<
  GroupFilter,
  (typeof GROUPS)[number]
>;

const CATEGORY_FILTERS: CategoryFilter[] = ['all', 'Marketing', 'Utility', 'Authentication'];

function timeAgo(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? formatDistanceToNow(at, { addSuffix: true }) : '';
}

function bodySnippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export function TemplateLibrary({
  templates,
  deletingId,
  onEdit,
  onDelete,
}: {
  templates: MessageTemplate[];
  deletingId: string | null;
  onEdit: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
}) {
  const [group, setGroup] = useState<GroupFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const counts = useMemo(() => countTemplatesByGroup(templates), [templates]);
  const categoriesPresent = useMemo(
    () => new Set(templates.map((t) => t.category)),
    [templates],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTemplatesForReview(
      templates.filter(
        (t) =>
          (group === 'all' || templateStatusGroup(t.status) === group) &&
          (category === 'all' || t.category === category) &&
          (!q || t.name.toLowerCase().includes(q) || t.body_text.toLowerCase().includes(q)),
      ),
    );
  }, [templates, group, category, query]);

  const preview = templates.find((t) => t.id === previewId) ?? null;
  const filtered = group !== 'all' || category !== 'all' || query.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Status ledger: counts double as the status filter. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
          {GROUPS.map((g) => {
            const active = group === g.key;
            const count = counts[g.key];
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(active && g.key !== 'all' ? 'all' : g.key)}
                aria-pressed={active}
                className={cn(
                  'group relative px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  active ? 'bg-muted/70' : 'hover:bg-muted/40',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', g.dot)} aria-hidden />
                  {g.label}
                </span>
                <span
                  className={cn(
                    'mt-1 block text-2xl font-semibold tabular-nums tracking-tight',
                    count === 0 && g.key !== 'all' ? 'text-muted-foreground/50' : 'text-foreground',
                  )}
                >
                  {count}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{g.hint}</span>
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
        {counts.all > 0 && (
          <div className="flex h-1 w-full bg-muted" aria-hidden>
            {GROUPS.slice(1).map((g) =>
              counts[g.key] > 0 ? (
                <div
                  key={g.key}
                  className={g.bar}
                  style={{ width: `${(counts[g.key] / counts.all) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      {counts.pending > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5 text-yellow-400" />
          {counts.pending} waiting for Meta. Status is checked automatically every 15 minutes —
          approved templates start sending on their own.
        </p>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or message text"
            aria-label="Search templates"
            className="h-9 bg-muted pl-8 pr-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Category">
          {CATEGORY_FILTERS.filter((c) => c === 'all' || categoriesPresent.has(c)).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                category === c
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c === 'all' ? 'All categories' : c}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_132px] gap-4 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Template</span>
          <span>Status</span>
          <span>Updated</span>
          <span className="text-right">Actions</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {filtered ? 'No templates match these filters.' : 'No templates yet.'}
            </p>
            {filtered && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGroup('all');
                  setCategory('all');
                  setQuery('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((t) => {
              const statusKey = t.status || 'DRAFT';
              const status = templateStatusConfig[statusKey];
              const g = GROUP_BY_KEY[templateStatusGroup(t.status)];
              const problem = t.rejection_reason || t.submission_error;
              const canEdit = statusKey === 'APPROVED' || statusKey === 'DRAFT';
              const canResubmit = statusKey === 'REJECTED' || statusKey === 'PAUSED';
              return (
                <li
                  key={t.id}
                  className="grid gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_110px_120px_132px] md:items-center"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(t.id)}
                    className="min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('size-2 shrink-0 rounded-full', g.dot)} aria-hidden />
                      <span className="truncate font-mono text-[13px] font-medium text-foreground">
                        {t.name}
                      </span>
                      {t.header_type === 'image' && (
                        <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has image" />
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
                      <span>{t.category}</span>
                      {t.language && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="uppercase">{t.language}</span>
                        </>
                      )}
                      {t.buttons?.length ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            {t.buttons.length} button{t.buttons.length === 1 ? '' : 's'}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-1 pl-4 text-xs text-muted-foreground/80">
                      {bodySnippet(t.body_text)}
                    </span>
                    {problem && (
                      <span className="mt-1.5 ml-4 flex items-start gap-1.5 rounded border border-red-900/40 bg-red-950/20 px-2 py-1 text-[11px] text-red-400">
                        <AlertCircle className="mt-px size-3 shrink-0" />
                        <span className="line-clamp-2">{problem}</span>
                      </span>
                    )}
                  </button>

                  <div className="pl-4 md:pl-0">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        status.classes,
                      )}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="hidden text-xs text-muted-foreground md:block">
                    {timeAgo(t.last_submitted_at || t.created_at)}
                  </div>

                  <div className="flex items-center gap-1 pl-4 md:justify-end md:pl-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewId(t.id)}
                      aria-label={`Preview ${t.name}`}
                      title="Preview"
                      className="size-8 text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="size-4" />
                    </Button>
                    {(canEdit || canResubmit) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(t)}
                        aria-label={canResubmit ? `Edit and resubmit ${t.name}` : `Edit ${t.name}`}
                        title={
                          canResubmit
                            ? 'Edit and resubmit to Meta'
                            : statusKey === 'DRAFT'
                              ? 'Edit and submit draft'
                              : 'Edit (Meta re-reviews — status goes to Pending)'
                        }
                        className="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        {canResubmit ? <RotateCcw className="size-4" /> : <Pencil className="size-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(t)}
                      disabled={deletingId === t.id}
                      aria-label={`Delete ${t.name}`}
                      title={t.meta_template_id ? 'Delete from Meta and locally' : 'Delete locally'}
                      className="size-8 text-muted-foreground hover:bg-red-950/30 hover:text-red-400"
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {filtered && visible.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {counts.all}
        </p>
      )}

      <Sheet open={preview !== null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {preview && (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle className="break-all font-mono text-sm">{preview.name}</SheetTitle>
                <SheetDescription>
                  {preview.category} · {preview.language?.toUpperCase() || '—'}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-1">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          templateStatusConfig[preview.status || 'DRAFT'].classes,
                        )}
                      >
                        {templateStatusConfig[preview.status || 'DRAFT'].label}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {preview.last_submitted_at ? 'Submitted' : 'Created'}
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {timeAgo(preview.last_submitted_at || preview.created_at)}
                    </dd>
                  </div>
                  {preview.quality_score && (
                    <div>
                      <dt className="text-muted-foreground">Meta quality</dt>
                      <dd
                        className={cn(
                          'mt-1 font-medium',
                          preview.quality_score === 'GREEN'
                            ? 'text-emerald-400'
                            : preview.quality_score === 'YELLOW'
                              ? 'text-yellow-400'
                              : 'text-red-400',
                        )}
                      >
                        {preview.quality_score}
                      </dd>
                    </div>
                  )}
                  {preview.meta_template_id && (
                    <div>
                      <dt className="text-muted-foreground">Meta ID</dt>
                      <dd className="mt-1 break-all font-mono text-foreground">
                        {preview.meta_template_id}
                      </dd>
                    </div>
                  )}
                </dl>

                {(preview.rejection_reason || preview.submission_error) && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{preview.rejection_reason || preview.submission_error}</span>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    What the customer sees
                  </p>
                  <WhatsAppTemplatePreview template={preview} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
