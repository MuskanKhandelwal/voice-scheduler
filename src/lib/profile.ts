import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types";

export const DEFAULT_PROFILE = {
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  energy_high_start: "09:00",
  energy_high_end: "12:00",
  energy_low_start: "14:00",
  energy_low_end: "16:00",
};

/**
 * Return the user's profile row, creating a default one if it doesn't exist
 * yet. A `profile` row is otherwise only created on the first Settings visit,
 * so any other entry point (insights, chat, scheduling) must call this rather
 * than assume the row is there — a fresh user who opens Insights first used to
 * hit a "profile not found" 500.
 */
export async function ensureProfile(supabase: SupabaseClient, userId: string): Promise<Profile> {
  const { data } = await supabase.from("profile").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as Profile;

  const { data: created } = await supabase
    .from("profile")
    .insert({ user_id: userId, ...DEFAULT_PROFILE })
    .select()
    .single();
  // If a concurrent request already created it, fall back to reading it.
  if (created) return created as Profile;
  const { data: existing } = await supabase.from("profile").select("*").eq("user_id", userId).single();
  return existing as Profile;
}
