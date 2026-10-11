import { describe, expect, it } from "vitest";
import { getReadyCheck } from "./ready";

describe("getReadyCheck", () => {
  it("is not ready when Supabase env is missing", () => {
    const check = getReadyCheck({});
    expect(check.ready).toBe(false);
    expect(check.missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("is ready when required env is set", () => {
    const check = getReadyCheck({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(check.ready).toBe(true);
    expect(check.missing).toEqual([]);
  });
});
