import { describe, expect, it } from "vitest";
import {
  toMetaPhone,
  hasWhatsAppPhone,
  isRecipientNotAllowedError,
  isUndeliverableRecipientError,
  isValidE164,
  normalizePhone,
  phoneVariants,
  phonesMatch,
  sanitizePhoneForMeta,
  toMetaPhone,
} from "./phone-utils";

describe("sanitizePhoneForMeta", () => {
  it("strips +, spaces, and dashes leaving only digits", () => {
    expect(sanitizePhoneForMeta("+370 639 49836")).toBe("37063949836");
    expect(sanitizePhoneForMeta("+1 (415) 555-1212")).toBe("14155551212");
  });

  it("returns an empty string for falsy input", () => {
    expect(sanitizePhoneForMeta("")).toBe("");
    // Defensive: existing call sites occasionally pass through nullable
    // contact phones. The function early-returns on the falsy check.
    expect(sanitizePhoneForMeta(undefined as unknown as string)).toBe("");
  });

  it("is idempotent on already-sanitized input", () => {
    const cleaned = "14155551212";
    expect(sanitizePhoneForMeta(cleaned)).toBe(cleaned);
  });

  it("stores Indian numbers as Meta digits with country code", () => {
    expect(sanitizePhoneForMeta("+91 98203 68269")).toBe("919820368269");
    expect(sanitizePhoneForMeta("9820368269")).toBe("919820368269");
    expect(sanitizePhoneForMeta("09820368269")).toBe("919820368269");
    expect(sanitizePhoneForMeta("919820368269")).toBe("919820368269");
  });
});

describe("toMetaPhone", () => {
  it("leaves non-Indian international numbers as digits only", () => {
    expect(toMetaPhone("+370 639 49836")).toBe("37063949836");
  });

  it("returns empty for blank input", () => {
    expect(toMetaPhone(null)).toBe("");
    expect(toMetaPhone("   ")).toBe("");
  });
});

describe("toMetaPhone", () => {
  it("prepends 91 for Indian 10-digit mobiles", () => {
    expect(toMetaPhone("+91 98203 68269")).toBe("919820368269");
    expect(toMetaPhone("9820368269")).toBe("919820368269");
    expect(toMetaPhone("919820368269")).toBe("919820368269");
  });
});

describe("normalizePhone", () => {
  it("strips non-digits without adding a country code", () => {
    expect(normalizePhone("+370 12345")).toBe("37012345");
    expect(normalizePhone("abc-555-DEF")).toBe("555");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("0044 7000 0000 0000")).toBe("0044700000000000");
  });
});

describe("phonesMatch", () => {
  it("returns true for exact digit matches", () => {
    expect(phonesMatch("+37063949836", "37063949836")).toBe(true);
  });

  it("matches across trunk-prefix variants by last-8 fallback", () => {
    // Lithuanian trunk-0 variant. Last 8 digits ("63949836") collide.
    expect(phonesMatch("370063949836", "37063949836")).toBe(true);
  });

  it("matches Indian 10-digit local against 91-prefixed Meta form", () => {
    expect(phonesMatch("9820368269", "919820368269")).toBe(true);
    expect(phonesMatch("+91 98203 68269", "9820368269")).toBe(true);
  });

  it("rejects mismatched numbers", () => {
    expect(phonesMatch("+37063949836", "+37063949837")).toBe(false);
  });

  it("rejects very short inputs that would false-positive on tail match", () => {
    // Only 7 digits — the last-8 fallback is gated to len>=8 on both
    // sides to avoid declaring "12345" and "67890-12345" a match.
    expect(phonesMatch("1234567", "1234567")).toBe(true);
    expect(phonesMatch("1234567", "9991234567")).toBe(false);
  });

  it("treats spaced +91 and bare 10-digit Indian mobiles as the same number", () => {
    expect(phonesMatch("+91 98203 68269", "9820368269")).toBe(true);
    expect(phonesMatch("919820368269", "09820368269")).toBe(true);
  });
});

describe("isValidE164", () => {
  it("accepts numbers 7–15 digits with optional + and non-zero start", () => {
    expect(isValidE164("+37063949836")).toBe(true);
    expect(isValidE164("37063949836")).toBe(true);
    expect(isValidE164("+1234567")).toBe(true); // 7 digits — lower bound
    expect(isValidE164("+123456789012345")).toBe(true); // 15 digits — upper bound
  });

  it("rejects numbers that start with 0 in international form", () => {
    expect(isValidE164("+0123456")).toBe(false);
    expect(isValidE164("0044700000000")).toBe(false);
  });

  it("rejects too-short and too-long inputs", () => {
    expect(isValidE164("+123456")).toBe(false); // 6 digits
    expect(isValidE164("+1234567890123456")).toBe(false); // 16 digits
  });

  it("rejects strings with non-digit characters", () => {
    expect(isValidE164("+1-415-555-1212")).toBe(false);
    expect(isValidE164("+1 4155551212")).toBe(false);
    expect(isValidE164("abc12345678")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidE164("")).toBe(false);
  });
});

describe("phoneVariants", () => {
  it("returns an empty list for empty input", () => {
    expect(phoneVariants("")).toEqual([]);
  });

  it("always lists the original number first", () => {
    const out = phoneVariants("37063949836");
    expect(out[0]).toBe("37063949836");
  });

  it("inserts a trunk 0 after each plausible country-code length", () => {
    // Input "37063949836" — CC-1 → "3" + "0" + "7063949836",
    //                       CC-3 → "370" + "0" + "63949836".
    // CC-2 is skipped because "063949836" already starts with 0.
    const out = phoneVariants("37063949836");
    expect(out).toEqual(
      expect.arrayContaining([
        "37063949836",
        "307063949836",
        "370063949836",
      ]),
    );
  });

  it("removes a leading 0 after the country code when present", () => {
    // Input "370063949836" — CC-2 strips one leading 0 from
    // "0063949836" → "37" + "063949836" = "37063949836". Only one zero
    // comes off per pass; that's what the live retry loop needs.
    const out = phoneVariants("370063949836");
    expect(out).toContain("370063949836");
    expect(out).toContain("37063949836");
  });

  it("deduplicates variants that collapse to the same digits", () => {
    const out = phoneVariants("37063949836");
    expect(new Set(out).size).toBe(out.length);
  });

  it("returns just the original when the number is too short for any CC slice", () => {
    // 1-char input is shorter than all ccLen values; both loops skip.
    expect(phoneVariants("1")).toEqual(["1"]);
  });
});

describe("isRecipientNotAllowedError", () => {
  it("matches Meta error code 131030", () => {
    expect(
      isRecipientNotAllowedError(
        "(#131030) Recipient phone number not in allowed list",
      ),
    ).toBe(true);
  });

  it("matches the human-readable English variants", () => {
    expect(isRecipientNotAllowedError("not in allowed list")).toBe(true);
    expect(isRecipientNotAllowedError("recipient not in the allowed list")).toBe(
      true,
    );
    // Case-insensitive on the human text.
    expect(isRecipientNotAllowedError("NOT IN ALLOWED LIST")).toBe(true);
  });

  it("does not false-positive on unrelated Meta errors", () => {
    expect(isRecipientNotAllowedError("(#100) Invalid parameter")).toBe(false);
    expect(isRecipientNotAllowedError("template name does not exist")).toBe(
      false,
    );
    expect(isRecipientNotAllowedError("")).toBe(false);
  });
});

describe("isUndeliverableRecipientError", () => {
  it("matches Meta error code 131026", () => {
    expect(
      isUndeliverableRecipientError(
        "(#131026) Message undeliverable",
      ),
    ).toBe(true);
  });

  it("does not match sandbox or unrelated errors", () => {
    expect(isUndeliverableRecipientError("(#131030) not in allowed list")).toBe(
      false,
    );
    expect(isUndeliverableRecipientError("(#100) Invalid parameter")).toBe(false);
  });
});

describe("hasWhatsAppPhone", () => {
  it("is false for blank / email-only placeholders", () => {
    expect(hasWhatsAppPhone("")).toBe(false);
    expect(hasWhatsAppPhone(null)).toBe(false);
    expect(hasWhatsAppPhone("   ")).toBe(false);
    expect(hasWhatsAppPhone("123")).toBe(false);
  });

  it("is true for a real E.164-like number", () => {
    expect(hasWhatsAppPhone("919769104020")).toBe(true);
    expect(hasWhatsAppPhone("+91 97691 04020")).toBe(true);
    expect(hasWhatsAppPhone("9769104020")).toBe(true);
  });
});
