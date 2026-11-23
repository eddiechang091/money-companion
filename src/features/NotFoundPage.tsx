import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { useLanguage } from "@/lib/i18n";

export function NotFoundPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader title={t("notFound.title")} />
      <Card>
        <EmptyState
          emoji={"\uD83E\uDDED"}
          title={t("notFound.body")}
          action={<Button onClick={() => onNavigate("/dashboard")}>{t("notFound.back")}</Button>}
        />
      </Card>
    </>
  );
}
