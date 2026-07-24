"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { CalendarEvent } from "@/lib/types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: enUS }),
  getDay,
  locales: { "en-US": enUS },
});

const DnDCalendar = withDragAndDrop<RbcEvent>(Calendar);

interface RbcEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: CalendarEvent;
}

function toRbcEvent(ev: CalendarEvent): RbcEvent {
  const [sh, sm] = ev.start_time.split(":").map(Number);
  const [eh, em] = ev.end_time.split(":").map(Number);
  const [y, mo, d] = ev.date.split("-").map(Number);
  return {
    id: ev.id,
    title: ev.title,
    start: new Date(y, mo - 1, d, sh, sm),
    end: new Date(y, mo - 1, d, eh, em),
    resource: ev,
  };
}

function toHHMM(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}
function toYMD(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

export default function CalendarClient() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<View>("week");
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const load = useCallback(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then(setEvents);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rbcEvents = useMemo(() => events.map(toRbcEvent), [events]);

  async function persistMove(id: string, start: Date, end: Date) {
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, date: toYMD(start), start_time: toHHMM(start), end_time: toHHMM(end) }),
    });
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        title: editing.title,
        date: editing.date,
        start_time: editing.start_time,
        end_time: editing.end_time,
        completed: editing.completed,
      }),
    });
    setEditing(null);
    load();
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
    setEditing(null);
    load();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Calendar</h1>
      <p className="mb-4 text-sm text-zinc-500">Drag to move, resize to change duration, or click an event to edit it.</p>
      <div
        className="calendar-shell flex-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        style={{ height: 650 }}
      >
        <DnDCalendar
          localizer={localizer}
          events={rbcEvents}
          view={view}
          onView={setView}
          views={["month", "week", "day"]}
          defaultView="week"
          style={{ height: "100%" }}
          onEventDrop={(args: EventInteractionArgs<RbcEvent>) => persistMove(args.event.id, args.start as Date, args.end as Date)}
          onEventResize={(args: EventInteractionArgs<RbcEvent>) => persistMove(args.event.id, args.start as Date, args.end as Date)}
          onSelectEvent={(event: RbcEvent) => setEditing(event.resource)}
          resizable
          selectable
        />
      </div>

      {editing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">Edit event</h2>
            <label className="mb-3 flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Title</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Start</span>
                <input
                  type="time"
                  value={editing.start_time.slice(0, 5)}
                  onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">End</span>
                <input
                  type="time"
                  value={editing.end_time.slice(0, 5)}
                  onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
            </div>
            <label className="mb-5 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.completed}
                onChange={(e) => setEditing({ ...editing, completed: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-zinc-600 dark:text-zinc-400">Completed</span>
            </label>
            <div className="flex justify-between">
              <button onClick={() => deleteEvent(editing.id)} className="text-sm font-medium text-red-600 hover:text-red-700">
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
                  Cancel
                </button>
                <button onClick={saveEdit} className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
