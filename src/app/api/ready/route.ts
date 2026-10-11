import { NextResponse } from "next/server";
import { getReadyCheck } from "@/lib/observability/ready";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);
  const check = getReadyCheck();
  return NextResponse.json(
    { ready: check.ready, missing: check.missing },
    {
      status: check.ready ? 200 : 503,
      headers: { [REQUEST_ID_HEADER]: requestId },
    },
  );
}
