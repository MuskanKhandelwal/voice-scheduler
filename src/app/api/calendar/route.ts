import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const supabase = supabaseServer();
  let query = supabase.from("calendar_events").select("*").eq("user_id", userId).order("date").order("start_time");
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, error: qErr } = await query;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json();
  const supabase = supabaseServer();
  const { data, error: insErr } = await supabase
    .from("calendar_events")
    .insert({
      user_id: userId,
      task_id: body.task_id ?? null,
      title: body.title,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      is_manual: body.is_manual ?? true,
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  delete updates.user_id;
  const supabase = supabaseServer();
  // Any manual edit (move/resize/retitle) flips is_manual so it won't be
  // silently reshuffled by a future auto-schedule pass.
  const { data, error: upErr } = await supabase
    .from("calendar_events")
    .update({ ...updates, is_manual: true })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const supabase = supabaseServer();
  const { error: delErr } = await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
