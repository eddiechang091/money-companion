import { useLanguage } from "@/lib/i18n";
import { useState } from "react";
import { CURRENCIES, currencyLabel } from "@/lib/currencies";
import { useProfile } from "@/services/profile/useProfile";
import { Button } from "@/components/ui/Button";

/**
 * First-run gate: if the user hasn't chosen a default currency yet,
 * block the app with a picker. No silent default.
 */
export function CurrencyGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const { profile, loaded, update } = useProfile();
  const [picked, setPicked] = useState("USD");

  if (!loaded) return null;

  if (profile.currency) return <>{children}</>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("auth.chooseCurrency")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 24, textAlign: "center" }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>💱</div>
        <h2 style={{ margin: "0 0 8px" }}>{t("auth.chooseCurrency")}</h2>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 16px" }}>
          This will be used for expenses, budgets, and reports. You can change
          it anytime in Settings.
        </p>
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="input"
          style={{ width: "100%", marginBottom: 16, fontSize: 16 }}
          aria-label={t("settings.defaultCurrency")}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {currencyLabel(c.code)} ({c.symbol})
            </option>
          ))}
        </select>
        <Button
          type="button"
          style={{ width: "100%" }}
          onClick={() => update({ currency: picked })}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
