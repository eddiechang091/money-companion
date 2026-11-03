/**
 * Live voice dictation for text fields (WeChat-style: speak, and text
 * streams into the field as you talk).
 *
 * Why the browser's Web Speech API and not Handy itself: Handy
 * (cjpais/Handy) is a Tauri/Rust *desktop* app — a global hotkey that
 * pastes into the focused native app. It has no web component and cannot
 * run inside a web page. The Web Speech API is the browser's equivalent:
 * streaming interim results, no keys, no model download. Dictation is
 * English-only, matching the chat input it serves. Trade-off vs Handy:
 * audio is routed to the browser vendor's recognition service (Google in
 * Chrome, Apple in Safari) instead of staying on-device, and Firefox
 * does not ship it — so the mic button only appears where the API exists.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Minimal SpeechRecognition shapes ───────────────────────────────────
 * Declared locally so this module does not depend on the TS DOM lib
 * shipping SpeechRecognition types.
 */
export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

type RecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, RecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when live dictation can run in this browser/context. */
export function isDictationSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

function defaultFactory(): SpeechRecognitionLike {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) throw new Error("Speech recognition is not supported in this browser.");
  return new Ctor();
}

/* ─── Dictation language ─────────────────────────────────────────────────
 * English-only: the chat input this serves only supports English.
 */
const DICTATION_LANG = "en-US";

/* ─── Transcript joining ───────────────────────────────────────────────── */

/** True for a CJK character (no space needed next to it). */
function isCjk(ch: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
}

/**
 * Join dictated text onto what was already in the field. English words
 * get a separating space; Chinese runs join directly, like WeChat.
 */
export function joinDictated(base: string, addition: string): string {
  const text = addition.replace(/^\s+/, "");
  if (!text) return base;
  if (!base) return text;
  const last = base[base.length - 1];
  if (last === " " || last === "\n") return base + text;
  if (isCjk(last) || isCjk(text[0])) return base + text;
  return `${base} ${text}`;
}

/* ─── Session ──────────────────────────────────────────────────────────── */

export type DictationErrorKind =
  | "denied"
  | "no-microphone"
  | "network"
  | "language"
  | "restart"
  | "unknown";

export const DICTATION_ERROR_MESSAGES: Record<DictationErrorKind, string> = {
  denied: "Microphone access was blocked. Allow microphone access in your browser and try again.",
  "no-microphone": "No microphone was found on this device.",
  network: "Dictation needs a network connection. Check your connection and try again.",
  language: "This language is not supported for dictation in this browser.",
  restart: "Dictation stopped unexpectedly. Tap the microphone to try again.",
  unknown: "Dictation stopped. Tap the microphone to try again.",
};

export interface DictationSessionCallbacks {
  /** Fired on every result event: accumulated finals + current interim. */
  onTranscript: (finalText: string, interimText: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (kind: DictationErrorKind) => void;
}

function errorKindOf(error: string): DictationErrorKind | null {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no-microphone";
    case "network":
      return "network";
    case "language-not-supported":
      return "language";
    case "no-speech":
    case "aborted":
      return null; // Transient — the onend restart keeps the session alive.
    default:
      return "unknown";
  }
}

/**
 * One dictation run. Keeps the recognition session alive across the
 * browser's own `onend` pauses (Chrome ends sessions after silence and
 * on network blips) while the user still wants to dictate, with a
 * crash guard so a persistently failing session stops instead of
 * restarting forever.
 */
export class DictationSession {
  private recognition: SpeechRecognitionLike | null = null;
  private armed = false;
  private finals = "";
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private recentStarts: number[] = [];

  constructor(
    private factory: SpeechRecognitionFactory,
    private callbacks: DictationSessionCallbacks
  ) {}

  get listening(): boolean {
    return this.armed;
  }

  start(): void {
    if (this.armed) return;
    this.armed = true;
    this.finals = "";
    this.recentStarts = [];
    this.startRecognition();
  }

  stop(): void {
    if (!this.armed && !this.recognition) return;
    this.armed = false;
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.recognition;
    this.recognition = null;
    try {
      rec?.stop();
    } catch {
      // Already stopped — nothing to do.
    }
    this.callbacks.onListeningChange(false);
  }

  private startRecognition(): void {
    const now = Date.now();
    this.recentStarts = this.recentStarts.filter((t) => now - t < 2000);
    this.recentStarts.push(now);
    if (this.recentStarts.length > 3) {
      this.armed = false;
      this.callbacks.onError("restart");
      this.callbacks.onListeningChange(false);
      return;
    }

    let rec: SpeechRecognitionLike;
    try {
      rec = this.factory();
    } catch {
      this.armed = false;
      this.callbacks.onError("unknown");
      this.callbacks.onListeningChange(false);
      return;
    }
    this.recognition = rec;
    rec.lang = DICTATION_LANG;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) this.finals += transcript;
        else interim += transcript;
      }
      this.callbacks.onTranscript(this.finals, interim);
    };
    rec.onerror = (event) => {
      const kind = errorKindOf(event.error);
      if (kind === null) return;
      this.armed = false;
      this.callbacks.onError(kind);
      this.callbacks.onListeningChange(false);
    };
    rec.onstart = () => {
      this.callbacks.onListeningChange(true);
    };
    rec.onend = () => {
      if (!this.armed) return;
      // The browser ended the session (pause, blip) — resume while armed.
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (this.armed) this.startRecognition();
      }, 250);
    };
    try {
      rec.start();
    } catch {
      // start() throws if a session is already running; treat as live.
      this.callbacks.onListeningChange(true);
    }
  }
}

/* ─── React hook ───────────────────────────────────────────────────────── */

export interface DictationControls {
  supported: boolean;
  listening: boolean;
  error: string | null;
  toggle: () => void;
  stop: () => void;
}

/**
 * Wire live dictation into a controlled text field. `value`/`onValueChange`
 * are the field's own state; dictated text streams in after the text that
 * was there when dictation started.
 */
export function useDictation(
  value: string,
  onValueChange: (next: string) => void
): DictationControls {
  const supported = isDictationSupported();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const baseRef = useRef("");
  const hadTranscriptRef = useRef(false);
  const sessionRef = useRef<DictationSession | null>(null);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (sessionRef.current?.listening) {
      stop();
      return;
    }
    setError(null);
    baseRef.current = valueRef.current;
    hadTranscriptRef.current = false;
    const session = new DictationSession(defaultFactory, {
      onTranscript: (finalText, interimText) => {
        const transcript = `${finalText}${interimText}`;
        if (transcript) hadTranscriptRef.current = true;
        onValueChangeRef.current(joinDictated(baseRef.current, transcript));
      },
      onListeningChange: (next) => setListening(next),
      onError: (kind) => {
        setError(DICTATION_ERROR_MESSAGES[kind]);
        sessionRef.current = null;
      },
    });
    sessionRef.current = session;
    session.start();
  }, [supported, stop]);

  // Stop when the field is cleared externally (e.g. the message was sent).
  useEffect(() => {
    if (listening && value === "" && hadTranscriptRef.current) stop();
  }, [value, listening, stop]);

  // Stop on unmount.
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    },
    []
  );

  // Auto-clear errors.
  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  return { supported, listening, error, toggle, stop };
}
