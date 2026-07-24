"use client";

import { useEffect, useState } from "react";
import { localISODate } from "@/lib/date";
import type { Profile } from "@/lib/types";

const FIELDS: { key: keyof Omit<Profile, "id" | "updated_at">; label: string }[] = [
  { key: "working_hours_start", label: "Working hours start" },
  { key: "working_hours_end", label: "Working hours end" },
  { key: "energy_high_start", label: "Peak energy start" },
  { key: "energy_high_end", label: "Peak energy end" },
  { key: "energy_low_start", label: "Low energy start" },
  { key: "energy_low_end", label: "Low energy end" },
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile);
    fetch(`/api/daily-goal?date=${localISODate()}`)
      .then((r) => r.json())
      .then((g) => setGoal(g.goal_text ?? ""));
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    const { id, updated_at, ...rest } = profile;
    void id;
    void updated_at;
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    await fetch("/api/daily-goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: localISODate(), goal_text: goal }),
    });
    setSaving(false);
    setSaved(true);
  }

  if (!profile) {
    return <div className="mx-auto max-w-xl px-6 py-10 text-zinc-500">Loading settings…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">
        These drive auto-scheduling: tasks land in your working hours, and high-focus tasks are
        placed in your peak-energy window.
      </p>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Hours &amp; energy</h2>
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">{field.label}</span>
              <input
                type="time"
                value={profile[field.key]?.slice(0, 5) ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Today&apos;s goal</span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            placeholder="What's the one thing that would make today a win?"
            className="mt-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
