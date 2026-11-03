import { describe, expect, it, vi } from "vitest";
import {
  DictationSession,
  joinDictated,
  resolveDefaultDictationLang,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from "@/features/dictation/dictation";

/** Controllable fake SpeechRecognition. */
class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  start(): void {
    this.startCalls++;
    this.onstart?.();
  }
  stop(): void {
    this.stopCalls++;
  }
  abort(): void {}

  emitResult(results: Array<{ transcript: string; isFinal: boolean }>): void {
    this.onresult?.({
      resultIndex: 0,
      results: results.map((r) => ({
        isFinal: r.isFinal,
        length: 1,
        0: { transcript: r.transcript },
      })),
    });
  }
  emitError(error: string): void {
    this.onerror?.({ error });
  }
  emitEnd(): void {
    this.onend?.();
  }
}

describe("joinDictated", () => {
  it("puts a space between English words", () => {
    expect(joinDictated("hello", "world")).toBe("hello world");
    expect(joinDictated("", "hello")).toBe("hello");
    expect(joinDictated("hello ", "world")).toBe("hello world");
  });

  it("joins Chinese without spaces", () => {
    expect(joinDictated("今天", "天气很好")).toBe("今天天气很好");
    expect(joinDictated("hello", "你好")).toBe("hello你好");
    expect(joinDictated("你好", "world")).toBe("你好world");
  });

  it("trims leading space from dictated text", () => {
    expect(joinDictated("hi", " there")).toBe("hi there");
  });
});

describe("resolveDefaultDictationLang", () => {
  it("picks Chinese for Chinese locales, English otherwise", () => {
    expect(resolveDefaultDictationLang("zh-CN")).toBe("zh-CN");
    expect(resolveDefaultDictationLang("zh-Hant-HK")).toBe("zh-CN");
    expect(resolveDefaultDictationLang("en-US")).toBe("en-US");
    expect(resolveDefaultDictationLang(undefined)).toBe("en-US");
    expect(resolveDefaultDictationLang("")).toBe("en-US");
  });
});

describe("DictationSession", () => {
  it("streams interim text and accumulates finals", () => {
    const fake = new FakeRecognition();
    const onTranscript = vi.fn();
    const session = new DictationSession(() => fake, {
      onTranscript,
      onListeningChange: () => {},
      onError: () => {},
    });
    session.start("en-US");
    fake.emitResult([{ transcript: "hel", isFinal: false }]);
    expect(onTranscript).toHaveBeenLastCalledWith("", "hel");
    fake.emitResult([{ transcript: "hello ", isFinal: true }]);
    expect(onTranscript).toHaveBeenLastCalledWith("hello ", "");
    fake.emitResult([{ transcript: "world", isFinal: false }]);
    expect(onTranscript).toHaveBeenLastCalledWith("hello ", "world");
    session.stop();
    expect(fake.stopCalls).toBe(1);
  });

  it("restarts after the browser ends the session while armed", () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeRecognition();
      const session = new DictationSession(() => fake, {
        onTranscript: () => {},
        onListeningChange: () => {},
        onError: () => {},
      });
      session.start("zh-CN");
      expect(fake.startCalls).toBe(1);
      fake.emitEnd();
      vi.advanceTimersByTime(300);
      expect(fake.startCalls).toBe(2);
      session.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not restart after stop", () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeRecognition();
      const session = new DictationSession(() => fake, {
        onTranscript: () => {},
        onListeningChange: () => {},
        onError: () => {},
      });
      session.start("en-US");
      session.stop();
      fake.emitEnd();
      vi.advanceTimersByTime(1000);
      expect(fake.startCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps a denied microphone to the denied error and stops", () => {
    const fake = new FakeRecognition();
    const onError = vi.fn();
    const onListeningChange = vi.fn();
    const session = new DictationSession(() => fake, {
      onTranscript: () => {},
      onListeningChange,
      onError,
    });
    session.start("en-US");
    fake.emitError("not-allowed");
    expect(onError).toHaveBeenCalledWith("denied");
    expect(onListeningChange).toHaveBeenLastCalledWith(false);
    expect(session.listening).toBe(false);
  });

  it("ignores transient no-speech errors", () => {
    const fake = new FakeRecognition();
    const onError = vi.fn();
    const session = new DictationSession(() => fake, {
      onTranscript: () => {},
      onListeningChange: () => {},
      onError,
    });
    session.start("en-US");
    fake.emitError("no-speech");
    expect(onError).not.toHaveBeenCalled();
    expect(session.listening).toBe(true);
    session.stop();
  });

  it("stops restarting when the session keeps dying immediately", () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      // Every created instance ends immediately; the crash guard must stop.
      const instances: FakeRecognition[] = [];
      const crashing = new DictationSession(
        () => {
          const f = new FakeRecognition();
          instances.push(f);
          return f;
        },
        {
          onTranscript: () => {},
          onListeningChange: () => {},
          onError,
        }
      );
      crashing.start("en-US");
      for (let i = 0; i < 5; i++) {
        instances[instances.length - 1]?.emitEnd();
        vi.advanceTimersByTime(300);
      }
      expect(onError).toHaveBeenCalledWith("restart");
      expect(crashing.listening).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
