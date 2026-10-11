export interface ReadyCheck {
  ready: boolean;
  missing: string[];
}

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function getReadyCheck(
  env: Record<string, string | undefined> = process.env,
): ReadyCheck {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  return { ready: missing.length === 0, missing };
}
