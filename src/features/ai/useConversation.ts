import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
} from "react";
import type { Expense, MonthlyBudget } from "@/lib/types";
import { parseInsightResponse, type InsightResult } from "@/lib/aiSchema";
import { getLlmService } from "@/services/anna/llm";
import { refreshBadges } from "@/features/gamification/awardBadges";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { buildConversationContext } from "./conversationContext";
import { buildConversationMessages, buildConversationRepairMessages } from "./conversationPrompts";
import {
  loadConversation,
  saveConversation,
  clearConversation,
  makeUserMessage,
  makeAssistantMessage,
} from "./conversationStorage";
import { buildSuggestedQuestions } from "./suggestedQuestions";
/** Extract user message texts for suggestion filtering. */
function userTexts(messages: { role: string; text: string }[]): string[] {
  return messages.filter((m) => m.role === "user").map((m) => m.text);
}


import type { ConversationMessage } from "./conversationTypes";
import type { ConversationContext } from "./conversationContext";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export type ConversationStatus = "loading" | "ready" | "unavailable";

export interface ConversationState {
  status: ConversationStatus;
  messages: ConversationMessage[];
  sending: boolean;
  sendError: string | null;
  suggestions: string[];
  ctx: ConversationContext | null;
}

type Action =
  | { type: "load-done"; messages: ConversationMessage[]; suggestions: string[]; ctx: ConversationContext }
  | { type: "unavailable" }
  | { type: "append"; message: ConversationMessage }
  | { type: "send-start" }
  | { type: "send-ok"; reply: ConversationMessage; suggestions: string[] }
  | { type: "send-error"; error: string }
  | { type: "dismiss-error" }
  | { type: "clear" }
  | { type: "ctx-update"; ctx: ConversationContext; suggestions: string[] };

function reducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "load-done":
      return {
        ...state,
        status: "ready",
        messages: action.messages,
        suggestions: action.suggestions,
        ctx: action.ctx,
      };
    case "unavailable":
      return { ...state, status: "unavailable" };
    case "append":
      return { ...state, messages: [...state.messages, action.message] };
    case "send-start":
      return { ...state, sending: true, sendError: null };
    case "send-ok":
      return {
        ...state,
        sending: false,
        sendError: null,
        messages: [...state.messages, action.reply],
        suggestions: action.suggestions,
      };
    case "send-error":
      return { ...state, sending: false, sendError: action.error };
    case "dismiss-error":
      return { ...state, sendError: null };
    case "clear":
      return { ...state, messages: [], sendError: null };
    case "ctx-update":
      return { ...state, ctx: action.ctx, suggestions: action.suggestions };
  }
}

const INITIAL: ConversationState = {
  status: "loading",
  messages: [],
  sending: false,
  sendError: null,
  suggestions: [],
  ctx: null,
};

// ---------------------------------------------------------------------------
// LLM call helper
// ---------------------------------------------------------------------------
function isLlmDisabled(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const obj = err as Record<string, unknown>;
  const code = String(obj.code ?? "");
  const msg = String((err as Error).message ?? "");
  return code.includes("disabled") || msg.includes("disabled");
}

async function callLlm(
  userMessage: string,
  ctx: ConversationContext,
  history: ConversationMessage[]
): Promise<InsightResult> {
  const llm = await getLlmService();
  if (!llm.available) throw new Error("unavailable");

  const messages = buildConversationMessages(userMessage, ctx, history);

  // Attempt 1
  let rawText = "";
  try {
    const res = await llm.complete({ messages, maxTokens: 600, temperature: 0.8, json: true });
    rawText = res.text;
  } catch (err) {
    // Treat llm_disabled as a clean unavailable, not a transient error
    if ((err as Error).message === "unavailable" || isLlmDisabled(err)) {
      throw new Error("unavailable");
    }
    throw new Error("llm-error");
  }

  const parsed = parseInsightResponse(rawText);
  if (parsed) return { ...parsed, isFallback: false };

  // Repair attempt
  const repairMsgs = buildConversationRepairMessages(messages, rawText);
  try {
    const repairRes = await llm.complete({
      messages: repairMsgs,
      maxTokens: 500,
      temperature: 0.3,
      json: true,
    });
    const repaired = parseInsightResponse(repairRes.text);
    if (repaired) return { ...repaired, isFallback: false };
  } catch {
    // fall through
  }

  // Both attempts failed — throw so send-error is dispatched and nothing
  // gets stored in conversation history.
  throw new Error("llm-error");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useConversation(
  expenses: Expense[],
  budgets: MonthlyBudget[],
  activeExpense: Expense | null
): ConversationState & {
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => Promise<void>;
  dismissError: () => void;
  dispatch: Dispatch<Action>;
} {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const sendingRef = useRef(false);
  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY;

  // Build context whenever inputs change
  const buildCtx = useCallback(
    (monthKey?: string) =>
      buildConversationContext(expenses, budgets, currency, activeExpense, monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses.length, budgets.length, activeExpense?.id, currency]
  );

  // Load history + check LLM availability on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const llm = await getLlmService();
      if (!llm.available) {
        if (!cancelled) dispatch({ type: "unavailable" });
        return;
      }
      const saved = await loadConversation();
      if (!cancelled) {
        const ctx = buildCtx();
        const messages = saved?.messages ?? [];
        const suggestions = buildSuggestedQuestions(ctx, messages.length > 0, userTexts(messages), messages);
        dispatch({ type: "load-done", messages, suggestions, ctx });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update context/suggestions when expenses or budgets change
  useEffect(() => {
    if (state.status !== "ready") return;
    const ctx = buildCtx();
    const suggestions = buildSuggestedQuestions(ctx, state.messages.length > 0, userTexts(state.messages), state.messages);
    dispatch({ type: "ctx-update", ctx, suggestions });
  }, [buildCtx, state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;
      sendingRef.current = true;

      const ctx = state.ctx ?? buildCtx();
      const userMsg = makeUserMessage(trimmed, activeExpense?.id);
      dispatch({ type: "append", message: userMsg });
      dispatch({ type: "send-start" });

      const historyBeforeSend = state.messages;

      try {
        const result = await callLlm(trimmed, ctx, historyBeforeSend);
        const reply = makeAssistantMessage(result, activeExpense?.id);
        const allMessages = [...historyBeforeSend, userMsg, reply];
        const suggestions = buildSuggestedQuestions(ctx, true, userTexts(allMessages), allMessages);
        dispatch({ type: "send-ok", reply, suggestions });
        await saveConversation(allMessages);
        // Celebrate badge unlocks immediately (good talk, chatterbox…).
        await refreshBadges();
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "unavailable") {
          dispatch({
            type: "send-error",
            error:
              "The AI isn't available in this session. " +
              "In the harness, restart without --no-llm to enable Lucky Cat.",
          });
        } else {
          dispatch({ type: "send-error", error: "Something went sideways. Tap to retry." });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [state.ctx, state.messages, buildCtx, activeExpense?.id]
  );

  const clearMessages = useCallback(async () => {
    dispatch({ type: "clear" });
    await clearConversation();
    const ctx = buildCtx();
    const suggestions = buildSuggestedQuestions(ctx, false);
    dispatch({ type: "ctx-update", ctx, suggestions });
  }, [buildCtx]);

  const dismissError = useCallback(() => {
    dispatch({ type: "dismiss-error" });
  }, []);

  return { ...state, sendMessage, clearMessages, dismissError, dispatch };
}
