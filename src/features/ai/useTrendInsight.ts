import { useCallback, useRef, useState } from "react";
import type { TrendInsightContext } from "@/lib/aiContext";
import type { InsightResult } from "@/lib/aiSchema";
import { getLlmService } from "@/services/anna/llm";
import { createTrendInsightService } from "./trendInsight";
import { buildTrendFallbackResponse } from "./fallback";

export type TrendInsightStatus = "idle" | "loading" | "ready" | "error";

export interface TrendInsightState {
  status: TrendInsightStatus;
  result: InsightResult | null;
}

/**
 * Opt-in trend analysis: the user taps "Analyze trends" and Lucky Cat
 * looks at the aggregates for the range on screen. When the LLM can't
 * be reached, the local summary is shown instead, so the button always
 * produces something honest.
 */
export function useTrendInsight() {
  const [state, setState] = useState<TrendInsightState>({ status: "idle", result: null });
  const requestId = useRef(0);

  const analyze = useCallback(async (ctx: TrendInsightContext) => {
    const id = ++requestId.current;
    setState({ status: "loading", result: null });
    try {
      const llm = await getLlmService();
      let result: InsightResult;
      if (!llm || !llm.available) {
        result = buildTrendFallbackResponse(ctx);
      } else {
        const service = createTrendInsightService(llm);
        result = await service.getTrendInsight(ctx);
      }
      if (requestId.current === id) setState({ status: "ready", result });
    } catch {
      if (requestId.current === id) setState({ status: "error", result: null });
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: "idle", result: null });
  }, []);

  return { ...state, analyze, reset };
}
