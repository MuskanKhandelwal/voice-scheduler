import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import { freeSlots, toMinutes, toHHMM, type TimeRange } from "./scheduler";
import { titleTokens, tokenOverlap, isNearDuplicateTitle } from "./fuzzy";
import type { CalendarEvent, Profile } from "./types";

// Context every tool needs: a service-role Supabase client, the signed-in
// user's id (all queries are scoped to it), and the caller's local clock so
// the agent never schedules into the past.
export interface AgentContext {
  supabase: SupabaseClient;
  userId: string;
  today: string; // YYYY-MM-DD (browser-local)
  nowMinutes: number; // minutes since midnight, browser-local, rounded up to 5
}

const hhmm = (t: string) => t.slice(0, 5);

// The agent's instructions. Kept here (not in the route) so the test harness
// and the real endpoint share the exact same prompt.
export function agentSystemPrompt(today: string, nowClock: string): string {
  return `You are Cadence, a sharp, friendly time-management coach who plans the user's days by managing their calendar directly through tools. Today is ${today} and the current local time is ${nowClock}.

CRITICAL — ACT, DON'T NARRATE:
- The get_* tools only READ; they change nothing. Only schedule_task, add_busy_block, move_event, and delete_event actually change the calendar.
- You must CALL schedule_task (or add_busy_block) for every item before your reply. A plan you only describe in words does not exist on the calendar.
- NEVER say you scheduled, moved, added, or deleted something unless the matching tool call returned success in THIS turn. Claiming an action you didn't perform via a tool is a serious error. If you haven't called the tool yet, call it now instead of replying.
- Do not end your turn with a proposed timetable and no tool calls. Read what you need, then place everything actionable with tool calls, THEN write a short summary of what the tools actually did.

HOW TO PLAN
- Call get_preferences early so you know working hours, the peak/low energy windows, and today's goal.
- Call get_free_slots (or get_schedule) before placing anything so you use real openings, never double-book, and never place before the current time today.
- For each concrete task the user names, pick a specific slot and call schedule_task. Put demanding, deep-focus work (energy_requirement "high") in the peak-energy window; put routine/admin work ("low") in the low-energy window or leftover time.
- Use realistic durations and leave short buffers between blocks — don't chain hours of focus back-to-back; include breaks.
- Schedule the task tied to today's goal, and the single most important task, into the peak-energy window FIRST — before you let anything else fill that window.
- Don't overload a day. If everything won't fit sensibly, place what fits and schedule the overflow on later days (call schedule_task with a later date), then say what you moved.
- Use add_busy_block for meetings/appointments the user can't work through.

CLARIFYING (rarely)
- Infer sensible duration/priority/energy yourself — never interrogate the user field-by-field.
- A meeting or appointment has a real fixed time only the user knows. If they mention one without a time, do NOT invent a time or block one out — briefly ask when it is. (Flexible tasks, where the timing is yours to decide, you should just schedule.)
- Schedule everything you CAN act on now, then ask one short question for whatever's genuinely missing. Don't ask permission for tasks you can already place.

STYLE
- Replies are shown as text in a chat (never read aloud). After acting, briefly state what you scheduled and when. Keep it to a sentence or two — no markdown headers or long numbered timetables.`;
}

// ---- Tool schemas exposed to the OpenAI model ----
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_preferences",
      description: "Get the user's working hours, peak/low energy windows, and today's goal. Call this first when planning so placements respect their preferences.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedule",
      description: "List the events already on the calendar between two dates (inclusive). Returns each event's id, title, date, and times so you can reference, move, or delete them.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_free_slots",
      description: "Get open time windows within working hours (existing events subtracted) for each date in a range. Today's slots never start before the current time. Use this to decide where a task realistically fits.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
          min_minutes: { type: "integer", description: "Only return slots at least this long." },
        },
        required: ["from", "to", "min_minutes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "schedule_task",
      description: "Create a task AND place it on the calendar at a specific time you've chosen. Use this for real work the user needs to do. Pick times yourself using get_free_slots + the user's energy windows; leave buffers and avoid overloading.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { type: "string", description: "24h HH:MM" },
          end_time: { type: "string", description: "24h HH:MM" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          energy_requirement: { type: "string", enum: ["high", "low"], description: "'high' for deep focus, 'low' for routine/admin." },
        },
        required: ["title", "date", "start_time", "end_time", "priority", "energy_requirement"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_busy_block",
      description: "Mark a time as unavailable (a meeting, appointment, commute, or anything the user can't work during). This is not a task — nothing gets scheduled over it.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { type: "string", description: "24h HH:MM" },
          end_time: { type: "string", description: "24h HH:MM" },
        },
        required: ["label", "date", "start_time", "end_time"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_event",
      description: "Move an existing calendar event to a new time (and optionally a new date). Identify it by event_id from get_schedule, or by target_title if you don't have the id.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: ["string", "null"] },
          target_title: { type: ["string", "null"], description: "Used to fuzzy-match the event if event_id is null." },
          new_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null to keep the same date." },
          new_start_time: { type: "string", description: "24h HH:MM" },
          new_end_time: { type: ["string", "null"], description: "24h HH:MM, or null to keep the same duration." },
        },
        required: ["event_id", "target_title", "new_date", "new_start_time", "new_end_time"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Remove an event from the calendar. Identify it by event_id from get_schedule, or by target_title.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: ["string", "null"] },
          target_title: { type: ["string", "null"] },
        },
        required: ["event_id", "target_title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_preferences",
      description: "Update the user's working hours or energy windows when they tell you about them. All fields optional; only pass what changed. Times are 24h HH:MM.",
      parameters: {
        type: "object",
        properties: {
          working_hours_start: { type: ["string", "null"] },
          working_hours_end: { type: ["string", "null"] },
          energy_high_start: { type: ["string", "null"] },
          energy_high_end: { type: ["string", "null"] },
          energy_low_start: { type: ["string", "null"] },
          energy_low_end: { type: ["string", "null"] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// ---- Tool implementations ----

async function getProfile(ctx: AgentContext): Promise<Profile | null> {
  const { data } = await ctx.supabase.from("profile").select("*").eq("user_id", ctx.userId).maybeSingle();
  return (data as Profile) ?? null;
}

async function resolveEvent(
  ctx: AgentContext,
  eventId: string | null,
  targetTitle: string | null
): Promise<CalendarEvent | null> {
  if (eventId) {
    const { data } = await ctx.supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("id", eventId)
      .maybeSingle();
    if (data) return data as CalendarEvent;
  }
  if (targetTitle) {
    // Fuzzy-match against events from today forward.
    const { data } = await ctx.supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", ctx.userId)
      .gte("date", ctx.today)
      .order("date")
      .order("start_time");
    const wanted = titleTokens(targetTitle);
    let best: CalendarEvent | null = null;
    let bestScore = 0.5;
    for (const ev of (data ?? []) as CalendarEvent[]) {
      const score = tokenOverlap(wanted, titleTokens(ev.title));
      if (score > bestScore) {
        bestScore = score;
        best = ev;
      }
    }
    return best;
  }
  return null;
}

type ToolResult = Record<string, unknown>;

export async function executeTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  switch (name) {
    case "get_preferences": {
      const profile = await getProfile(ctx);
      const { data: goal } = await supabase
        .from("daily_goals")
        .select("goal_text")
        .eq("user_id", userId)
        .eq("date", ctx.today)
        .maybeSingle();
      if (!profile) return { error: "No profile found." };
      return {
        working_hours: `${hhmm(profile.working_hours_start)}-${hhmm(profile.working_hours_end)}`,
        peak_energy_window: `${hhmm(profile.energy_high_start)}-${hhmm(profile.energy_high_end)}`,
        low_energy_window: `${hhmm(profile.energy_low_start)}-${hhmm(profile.energy_low_end)}`,
        today: ctx.today,
        current_time: toHHMM(ctx.nowMinutes),
        todays_goal: goal?.goal_text || "(not set)",
      };
    }

    case "get_schedule": {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, date, start_time, end_time, is_manual, task_id, completed")
        .eq("user_id", userId)
        .gte("date", String(args.from))
        .lte("date", String(args.to))
        .order("date")
        .order("start_time");
      return {
        events: (data ?? []).map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          start: hhmm(e.start_time),
          end: hhmm(e.end_time),
          is_busy_block: e.task_id === null,
          completed: e.completed,
        })),
      };
    }

    case "get_free_slots": {
      const profile = await getProfile(ctx);
      if (!profile) return { error: "No profile found." };
      const from = String(args.from);
      const to = String(args.to);
      const minMinutes = Number(args.min_minutes) || 0;

      const { data: events } = await supabase
        .from("calendar_events")
        .select("date, start_time, end_time")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", to);
      const byDate: Record<string, TimeRange[]> = {};
      for (const e of events ?? []) {
        (byDate[e.date] ??= []).push({ start: toMinutes(e.start_time), end: toMinutes(e.end_time) });
      }

      // Walk each date in the range.
      const slots: { date: string; start: string; end: string; minutes: number }[] = [];
      let cursor = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      while (cursor <= end) {
        const date = format(cursor, "yyyy-MM-dd");
        const isToday = date === ctx.today;
        const dayStart = isToday ? Math.max(toMinutes(profile.working_hours_start), ctx.nowMinutes) : toMinutes(profile.working_hours_start);
        const wh: TimeRange = { start: dayStart, end: toMinutes(profile.working_hours_end) };
        if (wh.end > wh.start) {
          for (const s of freeSlots(wh, byDate[date] ?? [])) {
            const mins = s.end - s.start;
            if (mins >= minMinutes) slots.push({ date, start: toHHMM(s.start), end: toHHMM(s.end), minutes: mins });
          }
        }
        cursor = addDays(cursor, 1);
      }
      return { free_slots: slots };
    }

    case "schedule_task": {
      const title = String(args.title);
      // Dedupe against recent tasks so a re-mention doesn't double-book.
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("tasks")
        .select("title")
        .eq("user_id", userId)
        .in("status", ["pending", "scheduled"])
        .gte("created_at", cutoff);
      if (isNearDuplicateTitle(title, (recent ?? []).map((t) => titleTokens(t.title)))) {
        return { skipped: true, reason: `"${title}" looks like something already scheduled recently.` };
      }
      const { data: task } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title,
          estimated_minutes: Math.max(5, toMinutes(String(args.end_time)) - toMinutes(String(args.start_time))),
          priority: String(args.priority),
          energy_requirement: String(args.energy_requirement),
          status: "scheduled",
        })
        .select()
        .single();
      const { data: event, error } = await supabase
        .from("calendar_events")
        .insert({
          user_id: userId,
          task_id: task?.id ?? null,
          title,
          date: String(args.date),
          start_time: String(args.start_time),
          end_time: String(args.end_time),
          is_manual: false,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      return { scheduled: true, event_id: event?.id, title, date: args.date, start: args.start_time, end: args.end_time };
    }

    case "add_busy_block": {
      const { data: event, error } = await supabase
        .from("calendar_events")
        .insert({
          user_id: userId,
          task_id: null,
          title: String(args.label) || "Unavailable",
          date: String(args.date),
          start_time: String(args.start_time),
          end_time: String(args.end_time),
          is_manual: true,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      return { added: true, event_id: event?.id };
    }

    case "move_event": {
      const ev = await resolveEvent(ctx, (args.event_id as string) ?? null, (args.target_title as string) ?? null);
      if (!ev) return { error: "Couldn't find that event." };
      const duration = toMinutes(hhmm(ev.end_time)) - toMinutes(hhmm(ev.start_time));
      const newStart = String(args.new_start_time);
      const newEnd = args.new_end_time ? String(args.new_end_time) : toHHMM(toMinutes(newStart) + duration);
      const { error } = await supabase
        .from("calendar_events")
        .update({
          date: args.new_date ? String(args.new_date) : ev.date,
          start_time: newStart,
          end_time: newEnd,
          is_manual: true,
        })
        .eq("id", ev.id)
        .eq("user_id", userId);
      if (error) return { error: error.message };
      return { moved: true, title: ev.title, new_start: newStart, new_end: newEnd, new_date: args.new_date ?? ev.date };
    }

    case "delete_event": {
      const ev = await resolveEvent(ctx, (args.event_id as string) ?? null, (args.target_title as string) ?? null);
      if (!ev) return { error: "Couldn't find that event." };
      await supabase.from("calendar_events").delete().eq("id", ev.id).eq("user_id", userId);
      if (ev.task_id) await supabase.from("tasks").update({ status: "pending" }).eq("id", ev.task_id).eq("user_id", userId);
      return { deleted: true, title: ev.title };
    }

    case "set_preferences": {
      const fields = [
        "working_hours_start",
        "working_hours_end",
        "energy_high_start",
        "energy_high_end",
        "energy_low_start",
        "energy_low_end",
      ] as const;
      const updates: Record<string, string> = {};
      for (const f of fields) if (args[f]) updates[f] = String(args[f]);
      if (!Object.keys(updates).length) return { error: "No preference fields provided." };
      const { error } = await supabase
        .from("profile")
        .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) return { error: error.message };
      return { updated: true, changed: Object.keys(updates) };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
