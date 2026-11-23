import { useDailyDelight } from "./useDailyDelight";
import { useLanguage } from "@/lib/i18n";

export function DailyDelightCard() {
  const { t } = useLanguage();
  const { status, delight } = useDailyDelight();

  if (status === "loading" || !delight) {
    return (
      <div className="delight-card" aria-busy="true">
        <p className="delight-label">{t("delight.title")}</p>
        <p className="delight-text muted">{t("delight.loading")}</p>
      </div>
    );
  }

  return (
    <div className="delight-card">
      <p className="delight-label">{t("delight.title")}</p>
      <p className="delight-text">“{delight.text}”</p>
    </div>
  );
}
