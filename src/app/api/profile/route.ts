import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

export async function GET() {
  const { userId, error } = await requireUser();
  if (error) return error;

  const supabase = supabaseServer();
  const profile = await ensureProfile(supabase, userId);
  return NextResponse.json(profile);
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
