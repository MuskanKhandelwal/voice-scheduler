import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { supabaseServer } from "@/lib/supabase";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { scheduleTasks } from "@/lib/scheduler";
import type { CalendarEvent, Task } from "@/lib/types";

const LOOKAHEAD_DAYS = 7;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "What to say back to the user. Normally a brief, upbeat acknowledgement (the exact schedule with times is appended automatically after this) — only make it a question if a task's title itself is too vague to act on.",
    },
    ready_tasks: {
      type: "array",
      description:
        "Every task the user mentioned, with your own best-guess estimates for duration/priority/energy filled in — do not wait for the user to specify these.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          estimated_minutes: { type: "integer" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          energy_requirement: {
            type: "string",
            enum: ["high", "low"],
            description: "'high' for deep-focus/demanding work, 'low' for light/routine work.",
          },
        },
        required: ["title", "estimated_minutes", "priority", "energy_requirement"],
        additionalProperties: false,
      },
    },
    busy_blocks: {
      type: "array",
      description:
        "Times the user says they're unavailable/busy (meetings, appointments, commutes, 'can't work then') even though no task is attached. Extract these whenever mentioned so tasks never get scheduled on top of them.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short label, e.g. 'Team meeting' or 'Unavailable'." },
          start_time: { type: "string", description: "24h HH:MM" },
          end_time: { type: "string", description: "24h HH:MM" },
        },
        required: ["label", "start_time", "end_time"],
        additionalProperties: false,
      },
    },
    event_changes: {
      type: "array",
      description:
        "Changes to events ALREADY on the calendar (listed in the system prompt). Use ONLY when the user asks to move, retime, or remove something already scheduled. Never use this to add new work — that goes in ready_tasks.",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["move", "delete"] },
          target_title: {
            type: "string",
            description: "The title of the existing event to change, copied as closely as possible from the calendar list in the system prompt.",
          },
          new_start_time: { type: ["string", "null"], description: "New 24h HH:MM start (move only; null for delete)." },
          new_end_time: {
            type: ["string", "null"],
            description: "New 24h HH:MM end (move only). If null on a move, keep the original duration.",
          },
        },
        required: ["action", "target_title", "new_start_time", "new_end_time"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "ready_tasks", "busy_blocks", "event_changes"],
  additionalProperties: false,
};

function systemPrompt(
  profile: Record<string, string>,
  goalText: string,
  existingTaskTitles: string[],
  scheduledList: string
) {
  return `You are a voice scheduling assistant. The user describes tasks — often several in one message — and your job is to turn them into a concrete plan yourself, not interrogate them for details.

For EVERY task mentioned, put it straight into ready_tasks with your own best-guess estimates:
- estimated_minutes: use realistic real-world durations for that kind of task (a quick call ~10-15min, an errand ~20-30min, focused work like writing/research/practice ~45-90min, a project block ~60-120min). Never under 5.
- priority: infer from language and context ("need to", deadlines, or a task tied to the stated goal) → medium by default, high if it sounds urgent/important, low if it sounds minor/routine.
- energy_requirement: 'high' for anything requiring focus, learning, decision-making, or creativity; 'low' for routine/physical/administrative tasks.
Do NOT ask the user for these — decide and move on. Only ask a follow-up question if a task's title itself is too vague to even guess at (e.g. "handle the thing") — and even then, ask about the task's identity, never about duration/priority/energy.

"reply" should be a short, natural, spoken-friendly acknowledgement (this is read aloud via text-to-speech — no lists, bullet points, or markdown). Don't restate times or durations in it — the exact schedule is appended automatically after your reply once tasks are placed.

If the user mentions being busy, unavailable, or unable to work during some time range (a meeting, an appointment, "I can't work 2 to 4"), capture it in busy_blocks — it is NOT a task and must never appear in ready_tasks. Only put a busy block in busy_blocks on the turn where the user actually states it — if it was already mentioned earlier in this conversation, leave busy_blocks empty for it; never re-report the same busy time on later turns.

These tasks are already on today's calendar — do not re-create them if the user mentions something that's clearly the same task; treat it as an update to the existing one instead: ${existingTaskTitles.length ? existingTaskTitles.join(", ") : "(none yet)"}.

If the day is looking overloaded (many tasks piling into a short window, or a task's energy need doesn't match any open time in its preferred window), briefly mention that trade-off in your reply and suggest a concrete fix (e.g. moving something lower-priority to tomorrow) instead of silently cramming it in.

Events already on the calendar (you may move or delete these via event_changes):
${scheduledList || "(nothing scheduled yet)"}

When the user asks to MOVE, RETIME, or REMOVE something already on that list, use event_changes — match target_title to the listed event as closely as you can. For a move, give new_start_time (and new_end_time, or leave it null to keep the same duration). For a delete, set action "delete" with null times. Do NOT put an existing event into ready_tasks to "move" it — that just creates a duplicate. For anything genuinely new, use ready_tasks as normal. New-task placement times are chosen by the scheduler and appended to your reply automatically, so don't invent times for new tasks; but for an explicit move, you set the new time via event_changes.

User's working hours: ${profile.working_hours_start}-${profile.working_hours_end}. Peak energy window: ${profile.energy_high_start}-${profile.energy_high_end}. Low energy window: ${profile.energy_low_start}-${profile.energy_low_end}. Today's goal: ${goalText || "(not set)"}.`;
}

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, "0")}${period}`;
}

// Bag-of-significant-words for fuzzy title matching (dedupe + resolving which
// existing event a "move"/"delete" request refers to). Strips punctuation,
// short words, and common suffixes so "finding contacts" ≈ "find contact".
function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => w.replace(/(ing|ies|es|s)$/, ""))
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Add minutes-since-midnight helpers for move operations.
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minToHHMM(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export async function POST(req: Request) {
  const { sessionId, message, today: clientToday, nowMinutes: clientNowMinutes } = await req.json();
  if (!sessionId || !message) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Prefer the browser's local date over the server's — a serverless function
  // may run in a different timezone (e.g. UTC) than the user placing the call.
  const today: string = clientToday ?? format(new Date(), "yyyy-MM-dd");
  const todayDate = new Date(`${today}T00:00:00`);
  // Browser's local minutes-since-midnight, so we never schedule into the past.
  // Round up to the next 5 minutes so a task doesn't start "3 minutes ago".
  const nowMinutes: number =
    typeof clientNowMinutes === "number"
      ? Math.ceil(clientNowMinutes / 5) * 5
      : (() => {
          const n = new Date();
          return Math.ceil((n.getHours() * 60 + n.getMinutes()) / 5) * 5;
        })();
  // Only recent tasks count as "already on the calendar" for de-dupe purposes —
  // a genuinely recurring daily task (e.g. "cooking") mentioned again tomorrow
  // shouldn't be blocked just because yesterday's instance is still "scheduled".
  const dedupeCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const dateRange = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => format(addDays(todayDate, i), "yyyy-MM-dd"));
  const [{ data: profile }, { data: goal }, { data: history }, { data: existingTasks }, { data: upcomingEvents }] = await Promise.all([
    supabase.from("profile").select("*").eq("id", 1).single(),
    supabase.from("daily_goals").select("goal_text").eq("date", today).maybeSingle(),
    supabase
      .from("conversation_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    supabase.from("tasks").select("title").in("status", ["pending", "scheduled"]).gte("created_at", dedupeCutoff),
    supabase
      .from("calendar_events")
      .select("*")
      .gte("date", dateRange[0])
      .lte("date", dateRange[dateRange.length - 1])
      .order("date")
      .order("start_time"),
  ]);

  await supabase.from("conversation_messages").insert({ session_id: sessionId, role: "user", content: message });

  const existingTaskTitles = (existingTasks ?? []).map((t: { title: string }) => t.title);
  const scheduledList = (upcomingEvents ?? [])
    .map((e: CalendarEvent) => {
      const dayLabel = e.date === today ? "today" : format(new Date(`${e.date}T00:00:00`), "EEE");
      return `- "${e.title}" ${dayLabel} ${formatClock(e.start_time.slice(0, 5))}–${formatClock(e.end_time.slice(0, 5))}`;
    })
    .join("\n");
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(profile ?? {}, goal?.goal_text ?? "", existingTaskTitles, scheduledList) },
    ...((history ?? []) as { role: "user" | "assistant"; content: string }[]),
    { role: "user", content: message },
  ];

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    response_format: { type: "json_schema", json_schema: { name: "chat_turn", schema: RESPONSE_SCHEMA, strict: true } },
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    reply: string;
    ready_tasks: { title: string; estimated_minutes: number; priority: string; energy_requirement: string }[];
    busy_blocks: { label: string; start_time: string; end_time: string }[];
    event_changes: { action: "move" | "delete"; target_title: string; new_start_time: string | null; new_end_time: string | null }[];
  };

  // Busy blocks are inserted as manual calendar events so the scheduler below
  // (which just reads all of today's calendar_events as "busy") avoids them
  // automatically, whether or not they fall inside working hours.
  //
  // The model sees the whole conversation history on every turn, so once a
  // busy block is mentioned it tends to keep re-reporting it in every later
  // reply too — without this guard that created a new duplicate row per turn.
  const { data: todaysManualBlocks } = await supabase
    .from("calendar_events")
    .select("start_time, end_time")
    .eq("date", today)
    .eq("is_manual", true)
    .is("task_id", null);
  const alreadyBlocked = (start: string, end: string) =>
    (todaysManualBlocks ?? []).some((b) => b.start_time.slice(0, 5) === start && b.end_time.slice(0, 5) === end);

  for (const block of parsed.busy_blocks) {
    if (alreadyBlocked(block.start_time, block.end_time)) continue;
    await supabase.from("calendar_events").insert({
      task_id: null,
      title: block.label || "Unavailable",
      date: today,
      start_time: block.start_time,
      end_time: block.end_time,
      is_manual: true,
    });
  }

  // Apply moves/deletes to events already on the calendar. Match the model's
  // target_title against the upcoming events it was shown, by fuzzy token
  // overlap, and mutate the best match. is_manual is set on moves so a later
  // auto-schedule pass won't shove them back.
  const changeLines: string[] = [];
  for (const change of parsed.event_changes) {
    const targetTokens = titleTokens(change.target_title);
    let best: CalendarEvent | null = null;
    let bestScore = 0.5; // require a real match, not a coincidental single word
    for (const ev of (upcomingEvents ?? []) as CalendarEvent[]) {
      const score = tokenOverlap(targetTokens, titleTokens(ev.title));
      if (score > bestScore) {
        bestScore = score;
        best = ev;
      }
    }
    if (!best) continue;

    if (change.action === "delete") {
      await supabase.from("calendar_events").delete().eq("id", best.id);
      if (best.task_id) await supabase.from("tasks").update({ status: "pending" }).eq("id", best.task_id);
      changeLines.push(`removed ${best.title}`);
    } else if (change.action === "move" && change.new_start_time) {
      const durationMin = hhmmToMin(best.end_time.slice(0, 5)) - hhmmToMin(best.start_time.slice(0, 5));
      const newStart = change.new_start_time;
      const newEnd = change.new_end_time ?? minToHHMM(hhmmToMin(newStart) + durationMin);
      await supabase.from("calendar_events").update({ start_time: newStart, end_time: newEnd, is_manual: true }).eq("id", best.id);
      changeLines.push(`moved ${best.title} to ${formatClock(newStart)}–${formatClock(newEnd)}`);
    }
  }

  // Defensive de-dupe: even though the model is told what's already on the
  // calendar, don't rely on it alone — skip creating a task that's a close
  // match for one already pending/scheduled, so re-mentioning "finding
  // staffing contacts" as "find staffing company contacts" a moment later
  // doesn't create a second task that cascades onto a different day.
  const isNearDuplicate = (title: string, others: Set<string>[]) => {
    const a = titleTokens(title);
    if (!a.size) return false;
    return others.some((b) => tokenOverlap(a, b) >= 0.7);
  };

  const existingTokenSets = existingTaskTitles.map(titleTokens);

  const insertedTasks: Task[] = [];
  for (const draft of parsed.ready_tasks) {
    if (isNearDuplicate(draft.title, existingTokenSets)) continue;
    const { data: task } = await supabase
      .from("tasks")
      .insert({
        title: draft.title,
        estimated_minutes: Math.max(5, draft.estimated_minutes),
        priority: draft.priority,
        energy_requirement: draft.energy_requirement,
        status: "pending",
      })
      .select()
      .single();
    if (task) {
      insertedTasks.push(task as Task);
      existingTokenSets.push(titleTokens(draft.title));
    }
  }

  let placedCount = 0;
  const scheduledLines: string[] = [];
  const unscheduledTitles: string[] = [];
  if (insertedTasks.length && profile) {
    // Re-fetch: busy_blocks and event_changes above may have altered the
    // calendar since the initial load, and the scheduler must see current state.
    const { data: existingEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("date", dateRange[0])
      .lte("date", dateRange[dateRange.length - 1]);

    const existingEventsByDate: Record<string, CalendarEvent[]> = {};
    for (const ev of existingEvents ?? []) {
      (existingEventsByDate[ev.date] ??= []).push(ev);
    }

    const placements = scheduleTasks(insertedTasks, profile, dateRange, existingEventsByDate, nowMinutes);
    const placedTaskIds = new Set<string>();
    for (const placement of placements) {
      const { error: insertError } = await supabase.from("calendar_events").insert({
        task_id: placement.task.id,
        title: placement.task.title,
        date: placement.date,
        start_time: placement.start_time,
        end_time: placement.end_time,
        is_manual: false,
      });
      if (!insertError) {
        await supabase.from("tasks").update({ status: "scheduled" }).eq("id", placement.task.id);
        placedCount++;
        placedTaskIds.add(placement.task.id);
        const dayLabel = placement.date === today ? "" : ` on ${format(new Date(`${placement.date}T00:00:00`), "EEEE")}`;
        scheduledLines.push(`${placement.task.title} at ${formatClock(placement.start_time)}–${formatClock(placement.end_time)}${dayLabel}`);
      }
    }
    for (const t of insertedTasks) {
      if (!placedTaskIds.has(t.id)) unscheduledTitles.push(t.title);
    }
  }

  // The model can't know the actual times its estimates landed on — that's
  // decided afterward by the deterministic scheduler above — so the concrete
  // plan and any applied calendar changes are appended here in code rather
  // than trusted to the LLM's reply.
  let finalReply = parsed.reply;
  if (changeLines.length) {
    finalReply += ` Done — ${changeLines.join(", ")}.`;
  }
  if (scheduledLines.length) {
    finalReply += ` Here's the plan: ${scheduledLines.join(", ")}.`;
  }
  if (unscheduledTitles.length) {
    finalReply += ` I couldn't find room for ${unscheduledTitles.join(", ")} in the next week — want me to free up some time or drop something else?`;
  }

  await supabase.from("conversation_messages").insert({ session_id: sessionId, role: "assistant", content: finalReply });

  return NextResponse.json({
    reply: finalReply,
    tasksCreated: insertedTasks.length,
    tasksScheduled: placedCount,
    eventsChanged: changeLines.length,
  });
}
