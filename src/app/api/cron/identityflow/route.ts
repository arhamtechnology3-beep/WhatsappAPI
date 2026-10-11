import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  reconcileTrialExpiry,
  runDataRetention,
} from "@/lib/ops/retention";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const supabase = supabaseAdmin();
  const expired = await reconcileTrialExpiry(supabase);
  const retention = await runDataRetention(supabase);

  return NextResponse.json({
    ok: true,
    trialsExpired: expired,
    retention,
  });
}
