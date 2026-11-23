import type { LlmService } from "@/services/anna/llm";
import type { TrendInsightContext } from "@/lib/aiContext";
import type { InsightResult } from "@/lib/aiSchema";
import { parseInsightResponse } from "@/lib/aiSchema";
import { buildRepairMessages, buildTrendInsightMessages } from "./prompts";
import { buildTrendFallbackResponse } from "./fallback";

const TREND_INSIGHT_MAX_TOKENS = 600;
const REPAIR_MAX_TOKENS = 500;
const TEMPERATURE = 0.8;

export interface TrendInsightService {
  getTrendInsight(ctx: TrendInsightContext): Promise<InsightResult>;
}

export function createTrendInsightService(llm: LlmService): TrendInsightService {
  return {
    async getTrendInsight(ctx): Promise<InsightResult> {
      const messages = buildTrendInsightMessages(ctx);

      // Attempt 1
      let rawText = "";
      try {
        const result = await llm.complete({
          messages,
          maxTokens: TREND_INSIGHT_MAX_TOKENS,
          temperature: TEMPERATURE,
          json: true,
        });
        rawText = result.text;
      } catch {
        return buildTrendFallbackResponse(ctx);
      }

      const parsed = parseInsightResponse(rawText);
      if (parsed) return { ...parsed, isFallback: false };

      // Repair attempt
      const repairMessages = buildRepairMessages(messages, rawText);
      try {
        const repairResult = await llm.complete({
          messages: repairMessages,
          maxTokens: REPAIR_MAX_TOKENS,
          temperature: 0.3,
          json: true,
        });
        const repaired = parseInsightResponse(repairResult.text);
        if (repaired) return { ...repaired, isFallback: false };
      } catch {
        // fall through to fallback
      }

      return buildTrendFallbackResponse(ctx);
    },
  };
}
