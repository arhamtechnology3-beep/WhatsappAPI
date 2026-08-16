'use client';

import { useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageTemplate, TemplateButton } from '@/types';
import {
  defaultHeaderImageUrl,
  recipeByName,
  fillTemplatePlaceholders,
} from '@/lib/shopify/whatsapp-template-library';

export { fillTemplatePlaceholders } from '@/lib/shopify/whatsapp-template-library';

export function resolveTemplatePreview(template: {
  name: string;
  header_type?: MessageTemplate['header_type'] | null;
  header_content?: string | null;
  header_media_url?: string | null;
  body_text: string;
  footer_text?: string | null;
  buttons?: TemplateButton[] | null;
  sample_values?: { body?: string[]; header?: string[] } | null;
}): {
  headerType?: MessageTemplate['header_type'];
  headerMediaUrl?: string;
  headerText?: string;
  body: string;
  footer?: string;
  buttons?: TemplateButton[];
} {
  const recipe = recipeByName(template.name);
  const headerType = template.header_type || recipe?.header_type;
  const buttons =
    template.buttons?.length ? template.buttons : recipe?.buttons;
  const imageUrl =
    template.header_media_url ||
    (headerType === 'image' || headerType === 'video' || headerType === 'document'
      ? defaultHeaderImageUrl()
      : undefined);
  return {
    headerType,
    headerMediaUrl: imageUrl,
    headerText: template.header_content || undefined,
    body: fillTemplatePlaceholders(
      template.body_text,
      template.sample_values?.body,
    ),
    footer: template.footer_text || recipe?.footer_text,
    buttons,
  };
}

function HeaderImage({ url, compact }: { url: string; compact?: boolean }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div
        className={cn(
          'flex w-full items-center justify-center bg-muted',
          compact ? 'h-24' : 'h-36',
        )}
      >
        <ImageOff className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Template header"
      className={cn(
        'w-full object-cover',
        compact ? 'max-h-24' : 'max-h-40',
      )}
      onError={() => setError(true)}
    />
  );
}

function CtaRows({
  buttons,
  onAgent,
}: {
  buttons: TemplateButton[];
  onAgent?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-2 flex w-full flex-col overflow-hidden rounded-md border',
        onAgent ? 'border-primary-foreground/25' : 'border-border',
      )}
    >
      {buttons.map((btn, i) => {
        const href = btn.type === 'URL' && !btn.url.includes('{{') ? btn.url : undefined;
        const className = cn(
          'flex items-center justify-center gap-1.5 px-3 py-2 text-center text-xs font-medium',
          i > 0 && 'border-t',
          onAgent
            ? 'border-primary-foreground/25 text-primary-foreground'
            : 'border-border text-sky-400',
        );
        if (href) {
          return (
            <a
              key={`${btn.type}-${i}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
              onClick={(e) => e.stopPropagation()}
            >
              {btn.text}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
            </a>
          );
        }
        return (
          <div key={`${btn.type}-${i}`} className={className}>
            {btn.text}
          </div>
        );
      })}
    </div>
  );
}

interface WhatsAppTemplatePreviewProps {
  template: Parameters<typeof resolveTemplatePreview>[0];
  /** Already-interpolated body (inbox / send picker). */
  bodyText?: string;
  headerMediaUrl?: string;
  headerText?: string;
  buttons?: TemplateButton[];
  /** Outgoing agent bubble (purple) vs customer-style card. */
  variant?: 'customer' | 'agent';
  compact?: boolean;
  className?: string;
}

/**
 * WhatsApp-like template chrome: header media, body, footer, CTA buttons.
 * Used in Settings, the inbox send picker, and inbox bubbles.
 */
export function WhatsAppTemplatePreview({
  template,
  bodyText,
  headerMediaUrl,
  headerText,
  buttons,
  variant = 'customer',
  compact,
  className,
}: WhatsAppTemplatePreviewProps) {
  const resolved = resolveTemplatePreview(template);
  const image = headerMediaUrl || resolved.headerMediaUrl;
  const body =
    bodyText && bodyText.trim().length > 0 ? bodyText : resolved.body;
  const header = headerText || resolved.headerText;
  const footer = resolved.footer;
  const ctas = buttons?.length ? buttons : resolved.buttons;
  const onAgent = variant === 'agent';

  return (
    <div
      className={cn(
        'overflow-hidden text-left',
        onAgent ? 'rounded-t-2xl' : 'rounded-lg border border-border bg-[#0b141a]',
        className,
      )}
    >
      {resolved.headerType === 'image' && image && (
        <HeaderImage url={image} compact={compact} />
      )}
      <div className={cn('px-3 py-2', onAgent ? '' : 'text-[#e9edef]')}>
        {resolved.headerType === 'text' && header && (
          <p className="mb-1 text-sm font-semibold">{header}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-snug">
          {body}
        </p>
        {footer && (
          <p
            className={cn(
              'mt-1 text-[11px]',
              onAgent ? 'text-primary-foreground/60' : 'text-[#8696a0]',
            )}
          >
            {footer}
          </p>
        )}
        {ctas && ctas.length > 0 && (
          <CtaRows buttons={ctas} onAgent={onAgent} />
        )}
      </div>
    </div>
  );
}
