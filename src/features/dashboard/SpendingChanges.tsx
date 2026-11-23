import type { SpendingChange } from "@/lib/analytics";
import { categoryName, getCategoryById } from "@/lib/categories";
import { useLanguage } from "@/lib/i18n";
import type { TranslateVars } from "@/lib/i18n";
import { money } from "@/lib/utils";

const KIND_EMOJI: Record<string, string> = {
  increase: "↑",
  decrease: "↓",
  new: "✨",
  gone: "✅",
};

type T = (key: string, vars?: TranslateVars) => string;

function friendlyMessage(t: T, change: SpendingChange, currency: string): string {
  const name = categoryName(change.categoryId);
  const delta = money(Math.abs(change.delta), currency);
  switch (change.kind) {
    case "increase":
      return t("dashboard.higherThisMonth", { name, delta });
    case "decrease":
      return t("dashboard.lowerThisMonth", { name, delta });
    case "new":
      return t("dashboard.newSpending", { name });
    case "gone":
      return t("dashboard.goneSpending", { name });
  }
}

export function SpendingChanges({
  changes,
  currency,
}: {
  changes: SpendingChange[];
  currency: string;
}) {
  const { t } = useLanguage();
  if (changes.length === 0) return null;
  return (
    <ul className="changes-list stack" style={{ gap: 10 }} aria-label={t("dashboard.spendingChanges")}>
      {changes.map((change) => {
        const cat = getCategoryById(change.categoryId);
        const emoji = cat?.icon ?? KIND_EMOJI[change.kind] ?? "•";
        return (
          <li key={change.id} className="change-item">
            <span className="change-icon" aria-hidden="true">{emoji}</span>
            <span className="change-text">{friendlyMessage(t, change, currency)}</span>
          </li>
        );
      })}
    </ul>
  );
}
