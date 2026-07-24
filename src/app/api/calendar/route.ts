import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const supabase = supabaseServer();
  let query = supabase.from("calendar_events").select("*").order("date").order("start_time");
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      task_id: body.task_id ?? null,
      title: body.title,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      is_manual: body.is_manual ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const supabase = supabaseServer();
  // Any manual edit (move/resize/retitle) flips is_manual so it won't be
  // silently reshuffled by a future auto-schedule pass.
  const { data, error } = await supabase
    .from("calendar_events")
    .update({ ...updates, is_manual: true })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const supabase = supabaseServer();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
