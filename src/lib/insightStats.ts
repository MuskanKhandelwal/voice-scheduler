import type { CalendarEvent, Profile } from "./types";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export interface PeriodStats {
  totalEvents: number;
  completedEvents: number;
  completionRate: number; // 0-1
  totalScheduledMinutes: number;
  workingMinutesAvailable: number;
  utilizationRate: number; // 0-1
  energyAlignmentRate: number; // 0-1, share of scheduled minutes that fall in the matching energy window
  daysInPeriod: number;
}

export function computeStats(events: CalendarEvent[], profile: Profile, daysInPeriod: number): PeriodStats {
  const workingMinutesPerDay = toMinutes(profile.working_hours_end) - toMinutes(profile.working_hours_start);
  const energyHigh = { start: toMinutes(profile.energy_high_start), end: toMinutes(profile.energy_high_end) };
  const energyLow = { start: toMinutes(profile.energy_low_start), end: toMinutes(profile.energy_low_end) };

  let totalScheduledMinutes = 0;
  let alignedMinutes = 0;
  let completedEvents = 0;

  for (const ev of events) {
    const start = toMinutes(ev.start_time);
    const end = toMinutes(ev.end_time);
    const duration = end - start;
    totalScheduledMinutes += duration;
    if (ev.completed) completedEvents++;

    // Without a stored "energy requirement" on manual events we treat the
    // longer-duration window (peak vs low) each event mostly overlaps as its
    // implied fit, giving a rough alignment signal for any event, not just
    // auto-scheduled ones.
    const highOverlap = overlapMinutes(start, end, energyHigh.start, energyHigh.end);
    const lowOverlap = overlapMinutes(start, end, energyLow.start, energyLow.end);
    alignedMinutes += Math.max(highOverlap, lowOverlap);
  }

  return {
    totalEvents: events.length,
    completedEvents,
    completionRate: events.length ? completedEvents / events.length : 0,
    totalScheduledMinutes,
    workingMinutesAvailable: workingMinutesPerDay * daysInPeriod,
    utilizationRate:
      workingMinutesPerDay * daysInPeriod > 0
        ? Math.min(1, totalScheduledMinutes / (workingMinutesPerDay * daysInPeriod))
        : 0,
    energyAlignmentRate: totalScheduledMinutes > 0 ? alignedMinutes / totalScheduledMinutes : 0,
    daysInPeriod,
  };
}
