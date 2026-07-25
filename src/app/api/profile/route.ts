import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

const DEFAULT_PROFILE = {
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  energy_high_start: "09:00",
  energy_high_end: "12:00",
  energy_low_start: "14:00",
  energy_low_end: "16:00",
};

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const supabase = supabaseServer();
  const { data, error: selErr } = await supabase.from("profile").select("*").eq("user_id", userId).maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  // First visit for this user — seed a default profile row so the rest of the
  // app (settings, scheduler) always has something to read.
  if (!data) {
    const { data: created, error: insErr } = await supabase
      .from("profile")
      .insert({ user_id: userId, ...DEFAULT_PROFILE })
      .select()
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json(created);
  }
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { userId, error } = await requireUser();
  if (error) return error;

  const body = await req.json();
  // Never let the client change ownership or identity columns.
  delete body.user_id;
  delete body.id;

  const supabase = supabaseServer();
  const { data, error: upErr } = await supabase
    .from("profile")
    .upsert({ user_id: userId, ...body, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json(data);
}
