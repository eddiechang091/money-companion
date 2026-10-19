import { useRef, useState, useEffect } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

export function ChatComposer({
  suggestions,
  sending,
  disabled,
  onSend,
  onSuggestion,
}: {
  suggestions: string[];
  sending: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
  onSuggestion: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to 120px
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setText("");
    // Reset height after clearing
    if (inputRef.current) inputRef.current.style.height = "auto";
    onSend(trimmed);
    inputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(text);
    }
  }

  return (
    <div className="chat-composer">
      {suggestions.length > 0 ? (
        <div className="suggestion-chips" role="list" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              role="listitem"
              className="suggestion-chip"
              disabled={sending || disabled}
              onClick={() => {
                onSuggestion(q);
                inputRef.current?.focus();
              }}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
      <form className="composer-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="composer-input"
          value={text}
          rows={1}
          placeholder="Ask Lucky Cat…"
          disabled={disabled}
          aria-label="Message to Lucky Cat"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          size="sm"
          disabled={sending || disabled || text.trim().length === 0}
          aria-label={sending ? "Sending…" : "Send message"}
        >
          {sending ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

