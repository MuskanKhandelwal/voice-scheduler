import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Returns the Clerk user id for the current request, or a 401 response.
 * Every data API route calls this and scopes its Supabase queries by the
 * returned userId — that's what keeps one user's tasks/calendar private from
 * another's (we use the service-role key server-side, which bypasses RLS, so
 * tenancy is enforced here in code rather than in the database).
 *
 * Usage:
 *   const { userId, error } = await requireUser();
 *   if (error) return error;
 */
export async function requireUser(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId, error: null };
}
