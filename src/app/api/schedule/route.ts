import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { supabaseServer } from "@/lib/supabase";
import { scheduleTasks } from "@/lib/scheduler";
import type { CalendarEvent, Task } from "@/lib/types";

const LOOKAHEAD_DAYS = 7;

export async function POST(req: Request) {
  const { today: clientToday } = await req.json().catch(() => ({ today: undefined }));
  const supabase = supabaseServer();

  const { data: profile, error: profileError } = await supabase
    .from("profile")
    .select("*")
    .eq("id", 1)
    .single();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { data: pendingTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "pending");
  if (tasksError) return NextResponse.json({ error: tasksError.message }, { status: 500 });
  if (!pendingTasks?.length) return NextResponse.json({ placed: [] });

  const today = clientToday ? new Date(`${clientToday}T00:00:00`) : new Date();
  const dateRange = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => format(addDays(today, i), "yyyy-MM-dd"));

  const { data: existingEvents, error: eventsError } = await supabase
    .from("calendar_events")
    .select("*")
    .gte("date", dateRange[0])
    .lte("date", dateRange[dateRange.length - 1]);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const existingEventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of existingEvents ?? []) {
    (existingEventsByDate[ev.date] ??= []).push(ev);
  }

  const placements = scheduleTasks(pendingTasks as Task[], profile, dateRange, existingEventsByDate);

  const inserted = [];
  for (const placement of placements) {
    const { data: event, error: insertError } = await supabase
      .from("calendar_events")
      .insert({
        task_id: placement.task.id,
        title: placement.task.title,
        date: placement.date,
        start_time: placement.start_time,
        end_time: placement.end_time,
        is_manual: false,
      })
      .select()
      .single();
    if (insertError) continue;
    await supabase.from("tasks").update({ status: "scheduled" }).eq("id", placement.task.id);
    inserted.push(event);
  }

  const unscheduledCount = pendingTasks.length - inserted.length;
  return NextResponse.json({ placed: inserted, unscheduledCount });
}
