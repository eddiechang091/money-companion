import type { ReactNode } from "react";
import { translate } from "@/lib/i18n";

export function EmptyState({
  emoji = "\uD83C\uDF31",
  title,
  children,
  action,
}: {
  emoji?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state-emoji" aria-hidden="true">{emoji}</div>
      <p className="state-title">{title}</p>
      {children ? <p className="state-body">{children}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label = translate("states.loading") }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="state-body">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = translate("states.error"),
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state error" role="alert">
      <div className="state-emoji" aria-hidden="true">{"\uD83D\uDE05"}</div>
      <p className="state-title">{title}</p>
      {children ? <p className="state-body">{children}</p> : null}
      {action}
    </div>
  );
}
