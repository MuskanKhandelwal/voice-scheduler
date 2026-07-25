"use client";

import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";

export default function LandingCta() {
  const { isSignedIn, isLoaded } = useUser();

  if (isLoaded && isSignedIn) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/plan"
          className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
        >
          Go to your planner
        </Link>
        <Link
          href="/settings"
          className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          Set up working hours
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SignInButton mode="modal">
        <button className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:brightness-110">
          Sign in to start planning
        </button>
      </SignInButton>
    </div>
  );
}
