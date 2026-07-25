import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const status = new URL(req.url).searchParams.get("status");
  const supabase = supabaseServer();
  let query = supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
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
    .from("tasks")
    .insert({
      user_id: userId,
      title: body.title,
      estimated_minutes: body.estimated_minutes,
      priority: body.priority ?? "medium",
      energy_requirement: body.energy_requirement ?? "high",
      status: "pending",
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
  // The user_id filter ensures a user can only patch their own rows.
  const { data, error: upErr } = await supabase
    .from("tasks")
    .update(updates)
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
  const { error: delErr } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
