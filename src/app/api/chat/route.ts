import { NextResponse } from "next/server";
import { format } from "date-fns";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { AGENT_TOOLS, executeTool, agentSystemPrompt, type AgentContext } from "@/lib/agentTools";

const MAX_TOOL_ROUNDS = 6;

// Tools whose successful execution means the calendar/preferences changed, so
// the client should refresh its view.
const MUTATING_TOOLS = new Set(["schedule_task", "add_busy_block", "move_event", "delete_event", "set_preferences"]);

export async function POST(req: Request) {
  const { userId, error: authError } = await requireUser();
  if (authError) return authError;

  const { sessionId, message, today: clientToday, nowMinutes: clientNowMinutes } = await req.json();
  if (!sessionId || !message) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const supabase = supabaseServer();

  const today: string = clientToday ?? format(new Date(), "yyyy-MM-dd");
  const nowMinutes: number =
    typeof clientNowMinutes === "number"
      ? Math.ceil(clientNowMinutes / 5) * 5
      : (() => {
          const n = new Date();
          return Math.ceil((n.getHours() * 60 + n.getMinutes()) / 5) * 5;
        })();
  const nowClock = `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`;

  const ctx: AgentContext = { supabase, userId, today, nowMinutes };

  // Load prior conversation for this session (user-scoped) and record the new turn.
  const { data: history } = await supabase
    .from("conversation_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  await supabase.from("conversation_messages").insert({ user_id: userId, session_id: sessionId, role: "user", content: message });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: agentSystemPrompt(today, nowClock) },
    ...((history ?? []) as { role: "user" | "assistant"; content: string }[]).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  // Agentic loop: let the model call tools until it produces a final text reply.
  let calendarChanged = false;
  let finalReply = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    });
    const choice = completion.choices[0].message;
    messages.push(choice);

    if (!choice.tool_calls?.length) {
      finalReply = choice.content ?? "";
      break;
    }

    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }
      const result = await executeTool(call.function.name, parsedArgs, ctx);
      if (MUTATING_TOOLS.has(call.function.name) && !("error" in result) && !("skipped" in result)) {
        calendarChanged = true;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  if (!finalReply) finalReply = "Done.";

  await supabase.from("conversation_messages").insert({ user_id: userId, session_id: sessionId, role: "assistant", content: finalReply });

  return NextResponse.json({ reply: finalReply, calendarChanged });
}
