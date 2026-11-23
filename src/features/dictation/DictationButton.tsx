import { Mic } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import type { DictationControls } from "./dictation";
import "./dictation.css";

/**
 * Microphone control that sits inside a text field, WeChat-style.
 * Renders nothing where live dictation is unsupported (e.g. Firefox).
 * English-only, matching the chat input it serves.
 */
export function DictationButton({
  supported,
  listening,
  error,
  toggle,
  disabled,
}: DictationControls & { disabled?: boolean }) {
  const { t } = useLanguage();
  if (!supported) return null;
  return (
    <>
      <span className="dictation-controls">
        <button
          type="button"
          className={listening ? "dictation-mic listening" : "dictation-mic"}
          onClick={toggle}
          disabled={disabled}
          aria-label={listening ? t("dictation.stop") : t("dictation.start")}
          aria-pressed={listening}
          title={listening ? t("dictation.stop") : t("dictation.dictate")}
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
