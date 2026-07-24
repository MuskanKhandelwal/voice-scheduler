import type { CalendarEvent, Profile, Task } from "./types";

interface TimeRange {
  start: number; // minutes since midnight
  end: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Subtract busy ranges from a working-hours range, returning sorted free ranges. */
function freeSlots(workingHours: TimeRange, busy: TimeRange[]): TimeRange[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const free: TimeRange[] = [];
  let cursor = workingHours.start;
  for (const b of sorted) {
    const start = Math.max(b.start, workingHours.start);
    const end = Math.min(b.end, workingHours.end);
    if (start > cursor) free.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < workingHours.end) free.push({ start: cursor, end: workingHours.end });
  return free.filter((r) => r.end > r.start);
}

function overlapMinutes(a: TimeRange, b: TimeRange): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

const PRIORITY_WEIGHT: Record<Task["priority"], number> = { high: 3, medium: 2, low: 1 };

export interface ScheduledPlacement {
  task: Task;
  date: string;
  start_time: string;
  end_time: string;
}

/**
 * Greedy placement: highest priority tasks get first pick of slots, and each
 * task prefers the slot that best overlaps its required energy window.
 * `existingEventsByDate` must already reflect events on days being considered.
 */
export function scheduleTasks(
  pendingTasks: Task[],
  profile: Profile,
  dateRange: string[], // dates to consider, in order, YYYY-MM-DD
  existingEventsByDate: Record<string, CalendarEvent[]>
): ScheduledPlacement[] {
  const workingHours: TimeRange = {
    start: toMinutes(profile.working_hours_start),
    end: toMinutes(profile.working_hours_end),
  };
  const energyHigh: TimeRange = {
    start: toMinutes(profile.energy_high_start),
    end: toMinutes(profile.energy_high_end),
  };
  const energyLow: TimeRange = {
    start: toMinutes(profile.energy_low_start),
    end: toMinutes(profile.energy_low_end),
  };

  // Working copy of free slots per date, mutated as we place tasks.
  const freeByDate: Record<string, TimeRange[]> = {};
  for (const date of dateRange) {
    const busy = (existingEventsByDate[date] ?? []).map((e) => ({
      start: toMinutes(e.start_time),
      end: toMinutes(e.end_time),
    }));
    freeByDate[date] = freeSlots(workingHours, busy);
  }

  const sortedTasks = [...pendingTasks].sort(
    (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  );

  const placements: ScheduledPlacement[] = [];

  for (const task of sortedTasks) {
    const preferredWindow = task.energy_requirement === "high" ? energyHigh : energyLow;
    let best: { date: string; slotIndex: number; start: number } | null = null;
    let bestScore = -1;

    for (const date of dateRange) {
      const slots = freeByDate[date];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.end - slot.start < task.estimated_minutes) continue;

        // Try to start the task at the point of maximum overlap with the
        // preferred energy window; fall back to the start of the slot.
        const candidateStart = Math.max(slot.start, Math.min(preferredWindow.start, slot.end - task.estimated_minutes));
        const candidateRange = { start: candidateStart, end: candidateStart + task.estimated_minutes };
        const score = overlapMinutes(candidateRange, preferredWindow);

        if (score > bestScore) {
          bestScore = score;
          best = { date, slotIndex: i, start: candidateStart };
        }
      }
    }

    if (!best) continue; // no room left anywhere in the range — leave unscheduled

    const { date, slotIndex, start } = best;
    const end = start + task.estimated_minutes;
    placements.push({ task, date, start_time: toHHMM(start), end_time: toHHMM(end) });

    // Split the consumed slot into remaining free fragments.
    const slot = freeByDate[date][slotIndex];
    const remaining: TimeRange[] = [];
    if (start > slot.start) remaining.push({ start: slot.start, end: start });
    if (end < slot.end) remaining.push({ start: end, end: slot.end });
    freeByDate[date].splice(slotIndex, 1, ...remaining);
  }

  return placements;
}
