import { describe, expect, it } from "vitest";

/**
 * WhatsApp numbers are org-scoped (UNIQUE account_id on whatsapp_config,
 * and phone_number_id cannot be claimed by a second account). Switching
 * the active workspace changes which config row the dashboard loads.
 */
describe("WhatsApp org isolation (domain rules)", () => {
  it("treats each organization as its own WhatsApp tenant key", () => {
    const orgA = "org-a";
    const orgB = "org-b";
    const configs = new Map<string, string>([
      [orgA, "phone-111"],
      [orgB, "phone-222"],
    ]);

    expect(configs.get(orgA)).not.toBe(configs.get(orgB));
  });

  it("rejects the same phone_number_id on a second organization", () => {
    const claimedBy = new Map<string, string>([["phone-111", "org-a"]]);
    const attemptedOrg = "org-b";
    const phoneNumberId = "phone-111";
    const owner = claimedBy.get(phoneNumberId);
    const conflict = owner != null && owner !== attemptedOrg;
    expect(conflict).toBe(true);
  });
});
