import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import type { InsightResult } from "@/lib/aiSchema";
import {
  CONVERSATION_STORAGE_VERSION,
  MAX_STORED_MESSAGES,
  type Conversation,
  type ConversationMessage,
} from "./conversationTypes";
import { newId } from "@/lib/utils";

function isConversationRecord(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    Array.isArray(obj.messages) &&
    typeof obj.updatedAt === "string"
  );
}

export async function loadConversation(): Promise<Conversation | null> {
  try {
    const store = await getKvStore();
    const doc = await store.get<{ version: number; conversation: unknown }>(
      STORAGE_KEYS.conversationActive
    );
    if (!doc || typeof doc !== "object") return null;
    const conv = (doc as { conversation: unknown }).conversation;
    return isConversationRecord(conv) ? conv : null;
  } catch {
    return null;
  }
}

export async function saveConversation(messages: ConversationMessage[]): Promise<void> {
  try {
    const store = await getKvStore();
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    const conversation: Conversation = {
      id: "active",
      version: CONVERSATION_STORAGE_VERSION,
      messages: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await store.set(STORAGE_KEYS.conversationActive, {
      version: CONVERSATION_STORAGE_VERSION,
      conversation,
    });
  } catch {
    console.warn("[conversation] could not persist conversation.");
  }
}

export async function clearConversation(): Promise<void> {
  try {
    const store = await getKvStore();
    await store.remove(STORAGE_KEYS.conversationActive);
  } catch {
    console.warn("[conversation] could not clear conversation.");
  }
}

export function makeUserMessage(text: string, expenseId?: string): ConversationMessage {
  return {
    id: newId(),
    role: "user",
    text: text.trim(),
    expenseId,
    createdAt: new Date().toISOString(),
  };
}

export function makeAssistantMessage(
  result: InsightResult,
  expenseId?: string
): ConversationMessage {
  // The follow-up question is deliberately NOT part of the displayed text:
  // it lives in the suggestion chips (see buildSuggestedQuestions, which
  // takes it from result.followUpQuestion). Including it here rendered the
  // same question twice — once as the closing line of the cat's reply and
  // once as a tappable chip underneath it.
  const parts = [
    result.headline,
    result.smallTalk,
    result.financialObservation,
    result.suggestion,
  ].filter(Boolean);
  return {
    id: newId(),
    role: "assistant",
    text: parts.join("\n\n"),
    result,
    expenseId,
    createdAt: new Date().toISOString(),
  };
}
