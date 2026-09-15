/**
 * Fill WhatsApp template `{{n}}` placeholders (1-indexed) from body params.
 * Unknown indexes are left as `{{n}}` so the inbox still shows the slot.
 */
export function renderTemplateBody(
  body: string | null | undefined,
  params: string[] | null | undefined,
): string {
  const source = body ?? "";
  const list = params ?? [];
  return source.replace(/\{\{(\d+)\}\}/g, (_, raw: string) => {
    const idx = Number(raw) - 1;
    return list[idx] ?? `{{${raw}}}`;
  });
}
