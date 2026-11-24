import type { InsightResult } from "@/lib/aiSchema";
import type { Locale } from "@/lib/i18n";

export const CONVERSATION_STORAGE_VERSION = 1;

/** Maximum messages persisted to storage. Older messages are trimmed. */
export const MAX_STORED_MESSAGES = 20;

/** Maximum past turns sent to the LLM for conversational context. */
export const MAX_LLM_HISTORY_TURNS = 4;

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  /** Plain text representation shown in the UI. */
  text: string;
  /** Structured AI response (assistant messages only). */
  result?: InsightResult;
  /** UI language the reply was written in (assistant messages only). Absent on messages stored before replies were tagged. */
  locale?: Locale;
  /** Expense ID this message is linked to, if any. */
  expenseId?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  version: number;
  messages: ConversationMessage[];
  updatedAt: string;
}
