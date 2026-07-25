import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { computeStats } from "@/lib/insightStats";
import { openai, CHAT_MODEL } from "@/lib/openai";
import type { CalendarEvent, InsightPeriod, Profile } from "@/lib/types";

const PERIOD_DAYS: Record<InsightPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };

async function narrativeFor(period: InsightPeriod, stats: ReturnType<typeof computeStats>, goalText: string) {
  const prompt = `Period: ${period}. Completion rate: ${(stats.completionRate * 100).toFixed(0)}%. Time utilization: ${(
    stats.utilizationRate * 100
  ).toFixed(0)}% of available working hours scheduled. Energy alignment: ${(stats.energyAlignmentRate * 100).toFixed(
    0
  )}% of scheduled time fell in the matching peak/low energy window. Goal on file: ${goalText || "none"}.
Write 2-3 short, specific, encouraging sentences on what went well and what could be improved next ${period === "daily" ? "day" : period === "weekly" ? "week" : "month"}. No markdown, no lists.`;

  const completionResp = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  return completionResp.choices[0].message.content ?? "";
}

export async function GET(_req: Request, context: { params: Promise<{ period: string }> }) {
  const { userId, error: authError } = await requireUser();
  if (authError) return authError;

  const { period } = await context.params;
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }
  const p = period as InsightPeriod;
  const days = PERIOD_DAYS[p];

  const today = new Date();
  const periodStart = format(subDays(today, days - 1), "yyyy-MM-dd");
  const periodEnd = format(today, "yyyy-MM-dd");

  const supabase = supabaseServer();
  const [{ data: profile }, { data: events }, { data: goal }] = await Promise.all([
    supabase.from("profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("calendar_events").select("*").eq("user_id", userId).gte("date", periodStart).lte("date", periodEnd),
    supabase.from("daily_goals").select("goal_text").eq("user_id", userId).eq("date", periodEnd).maybeSingle(),
  ]);

  if (!profile) return NextResponse.json({ error: "profile not found" }, { status: 500 });

  const stats = computeStats((events ?? []) as CalendarEvent[], profile as Profile, days);
  const narrative = await narrativeFor(p, stats, goal?.goal_text ?? "");

  await supabase.from("insights").upsert(
    {
      user_id: userId,
      period_type: p,
      period_start: periodStart,
      period_end: periodEnd,
      stats_json: stats,
      narrative_text: narrative,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_type,period_start" }
  );

  return NextResponse.json({ periodStart, periodEnd, stats, narrative });
}
