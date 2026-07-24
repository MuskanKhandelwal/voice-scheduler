import Link from "next/link";

const FEATURES = [
  {
    title: "Just talk it out",
    body: "Tell it what's on your plate today. It asks the follow-ups that matter — duration, priority, focus needed — one at a time.",
    icon: "🎙",
  },
  {
    title: "Built around your energy",
    body: "Set your working hours and when you're sharpest or lowest. Deep-focus tasks land in your peak window automatically.",
    icon: "⚡",
  },
  {
    title: "Still your calendar",
    body: "Auto-scheduled or not, every event is yours to drag, resize, retitle, or delete on a real day/week/month view.",
    icon: "🗓",
  },
  {
    title: "Know what to improve",
    body: "Daily, weekly, and monthly insights on completion rate, time utilization, and energy alignment — with a plain-language takeaway.",
    icon: "📈",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 pt-20 pb-16 text-center">
        <span className="mb-5 rounded-full bg-[var(--accent-soft)] px-3.5 py-1 text-xs font-medium text-[var(--accent)]">
          Voice-first daily planning
        </span>
        <h1 className="mb-5 max-w-xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
          Say what you need to do. Cadence builds the day.
        </h1>
        <p className="mb-9 max-w-lg text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Speak your tasks, answer a couple of quick follow-ups, and watch them land on your calendar at the right
          time — matched to your working hours and your energy, not just whatever slot is free.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/plan"
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
          >
            Start planning your day
          </Link>
          <Link
            href="/settings"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          >
            Set up working hours
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-base">
                {f.icon}
              </span>
              <h3 className="mb-1.5 font-medium text-zinc-900 dark:text-zinc-50">{f.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-white py-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-black">
        Voice input works best in Chrome or Edge — other browsers fall back to typing.
      </section>
    </div>
  );
}
