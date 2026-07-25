import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only (service role key) — used in API routes, which enforce per-user
// tenancy by filtering every query on user_id. The browser never talks to
// Supabase directly (it goes through our authenticated API routes), so there
// is deliberately no browser client exported here.
export function supabaseServer() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
