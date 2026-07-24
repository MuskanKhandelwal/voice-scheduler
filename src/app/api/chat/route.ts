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
        "What to say back to the user: either one clarifying follow-up question, or a short confirmation once tasks are finalized.",
    },
    ready_tasks: {
      type: "array",
      description: "Tasks that are fully specified and ready to be scheduled. Leave empty until a task's fields are all known.",
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
  },
  required: ["reply", "ready_tasks"],
  additionalProperties: false,
};

function systemPrompt(profile: Record<string, string>, goalText: string) {
  return `You are a concise voice scheduling assistant. The user tells you about tasks they need to do today; your job is to gather, for each task: a short title, an estimated duration in minutes, a priority (low/medium/high), and whether it needs high or low mental energy.

Ask about ONE missing field at a time, in a short, natural, spoken-friendly sentence (this will be read aloud via text-to-speech, so avoid lists, bullet points, or markdown). Infer fields yourself when reasonably obvious instead of asking (e.g. "quick email" implies low energy, short duration) — only ask about genuinely ambiguous fields.

Only include a task in ready_tasks once ALL of its fields are known. Never ask about more than one task at a time; finish one task's fields before starting the next. "reply" must never be empty: once every task the user mentioned is ready, put a brief spoken-friendly confirmation there (e.g. "Got it, that's on your calendar.") instead of a question.

User's working hours: ${profile.working_hours_start}-${profile.working_hours_end}. Peak energy window: ${profile.energy_high_start}-${profile.energy_high_end}. Low energy window: ${profile.energy_low_start}-${profile.energy_low_end}. Today's goal: ${goalText || "(not set)"}.`;
}

export async function POST(req: Request) {
  const { sessionId, message, today: clientToday } = await req.json();
  if (!sessionId || !message) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Prefer the browser's local date over the server's — a serverless function
  // may run in a different timezone (e.g. UTC) than the user placing the call.
  const today: string = clientToday ?? format(new Date(), "yyyy-MM-dd");
  const todayDate = new Date(`${today}T00:00:00`);
  const [{ data: profile }, { data: goal }, { data: history }] = await Promise.all([
    supabase.from("profile").select("*").eq("id", 1).single(),
    supabase.from("daily_goals").select("goal_text").eq("date", today).maybeSingle(),
    supabase
      .from("conversation_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  await supabase.from("conversation_messages").insert({ session_id: sessionId, role: "user", content: message });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(profile ?? {}, goal?.goal_text ?? "") },
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
  };

  await supabase.from("conversation_messages").insert({ session_id: sessionId, role: "assistant", content: parsed.reply });

  const insertedTasks: Task[] = [];
  for (const draft of parsed.ready_tasks) {
    const { data: task } = await supabase
      .from("tasks")
      .insert({
        title: draft.title,
        estimated_minutes: draft.estimated_minutes,
        priority: draft.priority,
        energy_requirement: draft.energy_requirement,
        status: "pending",
      })
      .select()
      .single();
    if (task) insertedTasks.push(task as Task);
  }

  let placedCount = 0;
  if (insertedTasks.length && profile) {
    const dateRange = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => format(addDays(todayDate, i), "yyyy-MM-dd"));
    const { data: existingEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("date", dateRange[0])
      .lte("date", dateRange[dateRange.length - 1]);

    const existingEventsByDate: Record<string, CalendarEvent[]> = {};
    for (const ev of existingEvents ?? []) {
      (existingEventsByDate[ev.date] ??= []).push(ev);
    }

    const placements = scheduleTasks(insertedTasks, profile, dateRange, existingEventsByDate);
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
      }
    }
  }

  return NextResponse.json({ reply: parsed.reply, tasksCreated: insertedTasks.length, tasksScheduled: placedCount });
}
