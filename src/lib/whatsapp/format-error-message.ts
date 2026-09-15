/**
 * Map common Meta WhatsApp error codes to actionable guidance for agents.
 * Falls back to the raw webhook string when the code is unknown.
 *
 * Official codes: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
 * 131050 = user stopped marketing. 131052/131053 are media download/upload — not opt-out.
 */
const META_ERROR_HINTS: Record<number, string> = {
  130472:
    "This recipient is in a Meta marketing experiment — the message was not sent. Retry later or use a utility template.",
  131048:
    "Your WhatsApp number has a quality restriction. Reduce marketing volume, check WhatsApp Manager quality rating, and do not retry marketing templates right now.",
  131049:
    "WhatsApp withheld this marketing template for this customer (engagement cap). Do not retry today — wait for them to message you, or send a utility/order template only.",
  131056:
    "Too many messages to this number in a short time. Wait before sending again.",
  131030:
    "Recipient is not in your Meta test number list (sandbox mode). Add them in Meta Developer Console → WhatsApp → API Setup.",
  131026:
    "Phone number is undeliverable in this format. Check the contact's number or try an alternate format.",
  131050:
    "This customer opted out of marketing messages from your WhatsApp number. Do not retry marketing templates until they opt in again.",
  131052:
    "WhatsApp could not download this media from the URL. Use a public HTTPS JPEG or PNG (Shopify images should request format=jpg).",
  131053:
    "WhatsApp could not process the template header image. Use a public JPEG/PNG under 5MB — Shopify WebP and oversized originals often fail.",
};

/** Meta #131050 — recipient asked to stop marketing templates. */
export function isMetaMarketingOptOutCode(code: number): boolean {
  return code === 131050;
}

/** Codes where retrying another marketing template makes delivery worse. */
export function isMetaMarketingHoldCode(code: number): boolean {
  return code === 131048 || code === 131049 || code === 131056;
}

/** Extract the first `#123456` code from a persisted error string. */
export function extractMetaErrorCode(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/#(\d{6})/);
  return match ? Number(match[1]) : null;
}

export type MetaStatusError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
};

/** Persist webhook status.errors as a single agent-visible string. */
export function formatMetaStatusErrors(errors: MetaStatusError[]): string {
  return errors
    .map((e) => {
      const parts = [
        e.code != null ? `#${e.code}` : null,
        e.title,
        e.message,
        e.error_data?.details,
      ]
        .filter((p): p is string => p != null && String(p).trim() !== "")
        .map((p) => String(p).trim());
      const unique: string[] = [];
      for (const part of parts) {
        if (unique.some((u) => u.toLowerCase() === part.toLowerCase())) continue;
        unique.push(part);
      }
      return unique.join(" — ");
    })
    .filter(Boolean)
    .join("; ");
}

export function formatWhatsAppErrorMessage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  const code = extractMetaErrorCode(raw);
  const hint = code != null ? META_ERROR_HINTS[code] : undefined;
  if (!hint) return raw.trim();

  // Keep the code visible for support tickets, add the friendly explanation.
  return `#${code} — ${hint}`;
}
