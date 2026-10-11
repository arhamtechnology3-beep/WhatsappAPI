import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);
  return NextResponse.json(
    { status: "ok" },
    { headers: { [REQUEST_ID_HEADER]: requestId } },
  );
}
