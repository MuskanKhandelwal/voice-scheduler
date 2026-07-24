"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSpeechRecognition, speak } from "@/lib/useSpeechRecognition";
import { localISODate } from "@/lib/date";
import type { CalendarEvent } from "@/lib/types";

interface ChatBubble {
  role: "user" | "assistant";
  content: string;
}

export default function PlanPage() {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const { isSupported, listening, transcript, error: micError, start, stop } = useSpeechRecognition();
  const [messages, setMessages] = useState<ChatBubble[]>([
    { role: "assistant", content: "Tell me what's on your plate today." },
  ]);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshToday = () => {
    const today = localISODate();
    fetch(`/api/calendar?from=${today}&to=${today}`)
      .then((r) => r.json())
      .then(setTodayEvents);
  };

  useEffect(() => {
    refreshToday();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, today: localISODate() }),
      });
      const data = await res.json();
      const reply = data.reply || (data.tasksScheduled > 0 ? "Done — that's on your calendar." : "Got it.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      speak(reply);
      if (data.tasksScheduled > 0) refreshToday();
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong reaching the server." }]);
    } finally {
      setSending(false);
    }
  }

  function handleMicClick() {
    if (listening) {
      stop();
      return;
    }
    start((finalText) => sendMessage(finalText));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Plan your day</h1>
        <p className="text-sm text-zinc-500">Talk through what&apos;s on your plate — I&apos;ll ask what I need to know and place it on your calendar.</p>
      </div>

      <div className="mb-6 flex flex-1 min-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                m.role === "user"
                  ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]"
              }`}
            >
              {m.role === "user" ? "You" : "◆"}
            </span>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {listening && transcript && (
          <div className="flex flex-row-reverse items-end gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              You
            </span>
            <div className="max-w-[75%] rounded-2xl bg-zinc-200/70 px-4 py-2.5 text-sm text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
              {transcript}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mb-3 flex items-center gap-3">
        {isSupported ? (
          <button
            onClick={handleMicClick}
            className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors ${
              listening ? "bg-red-500" : "bg-[var(--accent)] hover:brightness-110"
            }`}
            aria-label={listening ? "Stop listening" : "Start talking"}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/60" />}
            <span className="relative text-lg">🎙</span>
          </button>
        ) : null}
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage(textInput);
              setTextInput("");
            }
          }}
          placeholder={isSupported ? "Or type instead…" : "Voice input isn't supported in this browser — type here instead."}
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)] dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={() => {
            sendMessage(textInput);
            setTextInput("");
          }}
          disabled={sending}
          className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Send
        </button>
      </div>

      <div className="mb-8">
        {micError && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {micError}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Today&apos;s schedule</h2>
        {todayEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Nothing scheduled yet — tell me about a task above to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todayEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${ev.completed ? "bg-emerald-500" : "bg-[var(--accent)]"}`} />
                  {ev.title}
                </span>
                <span className="text-zinc-500">
                  {ev.start_time.slice(0, 5)}–{ev.end_time.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
