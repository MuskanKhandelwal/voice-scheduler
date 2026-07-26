"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { PeriodStats } from "@/lib/insightStats";

type Period = "daily" | "weekly" | "monthly";
const PERIODS: Period[] = ["daily", "weekly", "monthly"];

interface InsightResponse {
  periodStart: string;
  periodEnd: string;
  stats: PeriodStats;
  narrative: string;
}

export default function InsightsPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [loadedPeriod, setLoadedPeriod] = useState<Period | null>(null);
  const [data, setData] = useState<InsightResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const loading = loadedPeriod !== period && !errorMsg;

  useEffect(() => {
    let cancelled = false;
    // Clear any prior period's error before re-fetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrorMsg(null);
    fetch(`/api/insights/${period}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        // Guard against a malformed payload so the page can't crash on render.
        if (!json || !json.stats) throw new Error("Insights data was incomplete.");
        setData(json);
        setLoadedPeriod(period);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e.message || "Couldn't load insights.");
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const chartData = data
    ? [
        { name: "Completion", value: Math.round(data.stats.completionRate * 100) },
        { name: "Utilization", value: Math.round(data.stats.utilizationRate * 100) },
        { name: "Energy fit", value: Math.round(data.stats.energyAlignmentRate * 100) },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Insights</h1>
      <p className="mb-6 text-sm text-zinc-500">How your days are actually going, and what to adjust next.</p>

      <div className="mb-6 flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize transition-colors ${
              period === p
                ? "bg-[var(--accent)] text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {data && !loading && !errorMsg && (
        <>
          <p className="mb-4 text-xs text-zinc-500">
            {data.periodStart} – {data.periodEnd} · {data.stats.totalEvents} events, {data.stats.completedEvents} completed
          </p>

          <div className="mb-4 grid grid-cols-3 gap-3">
            {chartData.map((stat) => (
              <div
                key={stat.name}
                className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-2xl font-semibold text-[var(--accent)]">{stat.value}%</div>
                <div className="mt-1 text-xs text-zinc-500">{stat.name}</div>
              </div>
            ))}
          </div>

          <div className="mb-6 h-56 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip />
                <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs">💡</span>
              What to take from this
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{data.narrative}</p>
          </div>
        </>
      )}
    </div>
  );
}
