import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

// Returns the chat history for one session, scoped to the signed-in user.
// The browser used to read conversation_messages directly with the anon key,
// which (with RLS disabled) could expose other users' messages — so this now
// goes through the server where we can filter by user_id.
export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error: qErr } = await supabase
    .from("conversation_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
