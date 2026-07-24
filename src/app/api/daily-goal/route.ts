import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date query param required" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("daily_goals").select("*").eq("date", date).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { date, goal_text: "" });
}

export async function PATCH(req: Request) {
  const { date, goal_text } = await req.json();
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("daily_goals")
    .upsert({ date, goal_text }, { onConflict: "date" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
