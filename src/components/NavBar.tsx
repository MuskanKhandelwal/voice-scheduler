"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";

const LINKS = [
  { href: "/plan", label: "Plan" },
  { href: "/calendar", label: "Calendar" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useUser();
  return (
    <nav className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-black/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-sm text-white">
            ◆
          </span>
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cadence</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {/* Nav links only make sense once signed in (routes are protected). */}
          {isSignedIn &&
            LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3.5 py-1.5 transition-colors ${
                    active
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          {isLoaded && !isSignedIn && (
            <SignInButton mode="modal">
              <button className="rounded-full bg-[var(--accent)] px-4 py-1.5 font-medium text-white transition hover:brightness-110">
                Sign in
              </button>
            </SignInButton>
          )}
          {isSignedIn && <UserButton />}
        </div>
      </div>
    </nav>
  );
}
