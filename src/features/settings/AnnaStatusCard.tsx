import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { connectAnna } from "@/services/anna/runtime";
import { getKvStore } from "@/services/anna/storage";
import { getLlmService } from "@/services/anna/llm";
import type { AnnaStatus } from "@/lib/types";

const INITIAL: AnnaStatus = {
  state: "connecting",
  isHosted: false,
  storageKind: "unknown",
  llmAvailable: false,
};

export function AnnaStatusCard() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<AnnaStatus>(INITIAL);
  const [roundTrip, setRoundTrip] = useState("checking");

  useEffect(() => {
    let active = true;
    (async () => {
      const runtime = await connectAnna();
      const store = await getKvStore();
      const llm = await getLlmService();
      if (!active) return;
      setStatus({
        state: runtime.state,
        isHosted: runtime.isHosted,
        storageKind: store.kind,
        llmAvailable: llm.available,
      });
      try {
        const key = "diagnostics:ping";
        await store.set(key, { at: new Date().toISOString() });
        const value = await store.get<{ at: string }>(key);
        if (active) setRoundTrip(value && value.at ? "ok" : "empty");
      } catch {
        if (active) setRoundTrip("failed");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card title={t("anna.connection")}>
      <ul className="stack" style={{ gap: 8 }}>
        <li>
          {t("anna.runtime")}: <strong>{status.state}</strong>
          {status.isHosted ? ` ${t("anna.insideHost")}` : ` ${t("anna.standalone")}`}
        </li>
        <li>
          {t("anna.storageBackend")}: <strong>{status.storageKind}</strong>
        </li>
        <li>
          {t("anna.llmAvailable")}: <strong>{status.llmAvailable ? t("common.yes") : t("common.no")}</strong>
        </li>
        <li>
          {t("anna.roundTrip")}: <strong>{roundTrip}</strong>
        </li>
      </ul>
    </Card>
  );
}
