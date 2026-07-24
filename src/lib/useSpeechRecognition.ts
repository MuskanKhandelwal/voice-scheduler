"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal shape of the Web Speech API surface we use; not in lib.dom.d.ts.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Check your browser's site permissions and allow the microphone.",
  "no-speech": "Didn't catch that — no speech detected. Try again.",
  "audio-capture": "No microphone was found. Check that one is connected and not in use by another app.",
  network: "A network error interrupted speech recognition. Try again.",
  aborted: "",
};

export function useSpeechRecognition() {
  const [isSupported, setIsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    // Must be set post-mount (not via lazy useState init) so the server-rendered
    // markup — which never sees `window` — matches the client's first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(!!Ctor);
  }, []);

  const start = useCallback((onFinalResult: (text: string) => void) => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i][0];
        if ((event.results[i] as unknown as { isFinal: boolean }).isFinal) {
          final += result.transcript;
        } else {
          interim += result.transcript;
        }
      }
      setTranscript(final || interim);
      if (final) onFinalResult(final.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const message = ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}`;
      if (message) setError(message);
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Couldn't start the microphone. Try again in a moment.");
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { isSupported, listening, transcript, error, start, stop };
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}
