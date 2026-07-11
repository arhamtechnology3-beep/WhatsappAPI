import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    // Call RPC for current period
    const { data: currentData, error: currentError } = await ctx.supabase.rpc("ctwa_insights_summary", {
      tenant_id: ctx.accountId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    });

    if (currentError) {
      console.error("[GET /api/insights/ctwa/summary] RPC error:", currentError);
      return NextResponse.json({ error: "Failed to load summary stats" }, { status: 500 });
    }

    // Calculate previous period
    const durationMs = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - durationMs);
    const prevEndDate = new Date(startDate.getTime());

    // Call RPC for previous period
    const { data: previousData, error: previousError } = await ctx.supabase.rpc("ctwa_insights_summary", {
      tenant_id: ctx.accountId,
      start_date: prevStartDate.toISOString(),
      end_date: prevEndDate.toISOString(),
    });

    if (previousError) {
      console.error("[GET /api/insights/ctwa/summary] Previous RPC error:", previousError);
      // Fallback with empty array if previous period fetch fails to keep dashboard functional
    }

    // Map and compute percentage changes (deltas)
    const channels = ["instagram", "facebook_post", "facebook_ads", "google", "other"];
    const summary = channels.map((channel) => {
      const cur = (currentData || []).find((d: any) => d.source_channel === channel) || {
        total_conversations: 0,
        carts_recovered: 0,
        revenue_recovered: 0,
      };
      const prev = (previousData || []).find((d: any) => d.source_channel === channel) || {
        total_conversations: 0,
        carts_recovered: 0,
        revenue_recovered: 0,
      };

      const curConversations = Number(cur.total_conversations);
      const prevConversations = Number(prev.total_conversations);

      const conversation_change_pct =
        prevConversations === 0
          ? curConversations > 0
            ? 100
            : 0
          : Math.round(((curConversations - prevConversations) / prevConversations) * 100);

      return {
        source_channel: channel,
        total_conversations: curConversations,
        carts_recovered: Number(cur.carts_recovered),
        revenue_recovered: Number(cur.revenue_recovered),
        previous_conversations: prevConversations,
        conversation_change_pct,
      };
    });

    return NextResponse.json({ summary });
  } catch (err) {
    return toErrorResponse(err);
  }
}
