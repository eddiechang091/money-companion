import { Mic } from "lucide-react";
import type { DictationControls } from "./dictation";
import "./dictation.css";

/**
 * Microphone + language controls that sit inside a text field, WeChat-style.
 * Renders nothing where live dictation is unsupported (e.g. Firefox).
 * All visible strings stay English (app-wide UI rule); the EN/ZH toggle
 * switches the *spoken* language only.
 */
export function DictationButton({
  supported,
  listening,
  lang,
  error,
  toggle,
  toggleLang,
  disabled,
}: DictationControls & { disabled?: boolean }) {
  if (!supported) return null;
  return (
    <>
      <span className="dictation-controls">
        <button
          type="button"
          className="dictation-lang"
          onClick={toggleLang}
          disabled={disabled}
          aria-label={`Dictation language: ${lang === "en-US" ? "English" : "Chinese"}. Activate to switch.`}
          title="Dictation language"
        >
          {lang === "en-US" ? "EN" : "ZH"}
        </button>
        <button
          type="button"
          className={listening ? "dictation-mic listening" : "dictation-mic"}
          onClick={toggle}
          disabled={disabled}
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          aria-pressed={listening}
          title={listening ? "Stop dictation" : "Dictate"}
        >
          <Mic size={16} aria-hidden="true" />
        </button>
      </span>
      {error ? (
        <span className="dictation-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
