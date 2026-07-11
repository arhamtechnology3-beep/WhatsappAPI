import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { localDayKey } from "@/lib/dashboard/date-utils";

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

    const { data: dbTrendData, error: trendError } = await ctx.supabase.rpc("ctwa_daily_trend", {
      tenant_id: ctx.accountId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    });

    if (trendError) {
      console.error("[GET /api/insights/ctwa/trend] RPC error:", trendError);
      return NextResponse.json({ error: "Failed to load trend stats" }, { status: 500 });
    }

    // Generate all dates in the range to fill in zeros
    const trend: any[] = [];
    const cur = new Date(startDate);

    // Guard against infinite loop if dates are invalid
    let iterations = 0;
    while (cur <= endDate && iterations < 366) {
      const dateStr = localDayKey(cur);
      const points = (dbTrendData || []).filter((d: any) => d.trend_date === dateStr);

      const item: Record<string, any> = { date: dateStr };
      const channels = ["instagram", "facebook_post", "facebook_ads", "google", "other"];

      for (const ch of channels) {
        item[ch] = 0;
      }

      for (const p of points) {
        item[p.source_channel] = Number(p.conversation_count);
      }

      trend.push(item);
      cur.setDate(cur.getDate() + 1);
      iterations++;
    }

    return NextResponse.json({ trend });
  } catch (err) {
    return toErrorResponse(err);
  }
}
