import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { useLanguage } from "@/lib/i18n";

export function InsightsPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader title={t("insights.title")} lede={t("insights.lede")} />
      <Card>
        <EmptyState emoji={"\u2728"} title={t("insights.none")}>
          {t("insights.noneBody")}
        </EmptyState>
      </Card>
    </>
  );
}
