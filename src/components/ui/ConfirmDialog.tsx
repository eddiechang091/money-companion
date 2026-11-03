import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Portal to <body>: rendered inside a list row, the fixed backdrop would
  // otherwise be trapped by an ancestor stacking context (e.g. the row's
  // entrance animation) and painted over by the rows below it.
  return createPortal(
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="dialog-title">{title}</p>
        {body ? <p className="dialog-body">{body}</p> : null}
        <div className="row dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" ref={confirmRef} className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
