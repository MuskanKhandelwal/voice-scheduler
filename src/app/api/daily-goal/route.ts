import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date query param required" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error: qErr } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json(data ?? { date, goal_text: "" });
}

export async function PATCH(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const { date, goal_text } = await req.json();
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error: upErr } = await supabase
    .from("daily_goals")
    .upsert({ user_id: userId, date, goal_text }, { onConflict: "user_id,date" })
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json(data);
}
