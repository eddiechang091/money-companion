import { describe, expect, it, vi } from "vitest";
import {
  SUGGEST_BATCH_SIZE,
  buildSuggestMessages,
  parseSuggestResponse,
  suggestCategories,
  suggestionKey,
  type SuggestItem,
} from "@/features/import/suggest";

const ITEMS: SuggestItem[] = [
  { description: "TIM HORTONS #1234", kind: "expense" },
  { description: "CANADA", kind: "income" },
  { description: "UNKNOWN XYZ", kind: "expense" },
];

describe("buildSuggestMessages", () => {
  it("lists the taxonomy and the descriptions verbatim", () => {
    const messages = buildSuggestMessages(ITEMS);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("coffee-brew");
    expect(messages[0].content).toContain("reimbursements-refunds");
    expect(messages[1].content).toContain("[expense] TIM HORTONS #1234");
    expect(messages[1].content).toContain("[income] CANADA");
  });
});

describe("parseSuggestResponse", () => {
  it("maps valid suggestions by exact description", () => {
    const text = JSON.stringify({
      suggestions: [
        { description: "TIM HORTONS #1234", categoryId: "coffee-brew" },
        { description: "CANADA", categoryId: "reimbursements-refunds" },
        { description: "UNKNOWN XYZ", categoryId: null },
      ],
    });
    expect(parseSuggestResponse(text, ITEMS)).toEqual({
      [suggestionKey("TIM HORTONS #1234", "expense")]: "coffee-brew",
      [suggestionKey("CANADA", "income")]: "reimbursements-refunds",
    });
  });

  it("matches by description alone when a kind is not echoed", () => {
    const text = JSON.stringify({
      suggestions: [{ description: "CANADA", categoryId: "reimbursements-refunds" }],
    });
    expect(parseSuggestResponse(text, [{ description: "CANADA", kind: "income" }])).toEqual({
      [suggestionKey("CANADA", "income")]: "reimbursements-refunds",
    });
  });

  it("tolerates code fences", () => {
    const text = "```json\n" + JSON.stringify({
      suggestions: [{ description: "CANADA", categoryId: "reimbursements-refunds" }],
    }) + "\n```";
    expect(parseSuggestResponse(text, ITEMS)).toEqual({
      [suggestionKey("CANADA", "income")]: "reimbursements-refunds",
    });
  });

  it("drops unknown ids, wrong-kind ids, and undescribed rows", () => {
    const text = JSON.stringify({
      suggestions: [
        { description: "TIM HORTONS #1234", categoryId: "not-a-category" },
        { description: "CANADA", categoryId: "coffee-brew" },
        { description: "NEVER SENT", categoryId: "dining-out" },
        { description: "UNKNOWN XYZ", categoryId: "dining-out" },
      ],
    });
    expect(parseSuggestResponse(text, ITEMS)).toEqual({
      [suggestionKey("UNKNOWN XYZ", "expense")]: "dining-out",
    });
  });

  it("returns empty for garbage", () => {
    expect(parseSuggestResponse("not json at all", ITEMS)).toEqual({});
    expect(parseSuggestResponse('{"nope": true}', ITEMS)).toEqual({});
  });
});

describe("suggestCategories", () => {
  it("dedupes by kind + description and sends one batch", async () => {
    const complete = vi.fn(async () => ({
      text: JSON.stringify({
        suggestions: [{ description: "CANADA", kind: "income", categoryId: "reimbursements-refunds" }],
      }),
    }));
    const out = await suggestCategories(
      [
        { description: "CANADA", kind: "income" },
        { description: "CANADA", kind: "income" },
        { description: "CANADA", kind: "expense" },
      ],
      complete
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ [suggestionKey("CANADA", "income")]: "reimbursements-refunds" });
  });

  it("chunks large lists", async () => {
    const complete = vi.fn(async () => ({ text: '{"suggestions": []}' }));
    const items: SuggestItem[] = Array.from({ length: SUGGEST_BATCH_SIZE + 1 }, (_, i) => ({
      description: `MERCHANT ${i}`,
      kind: "expense" as const,
    }));
    await suggestCategories(items, complete);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("returns empty without calling for no items", async () => {
    const complete = vi.fn(async () => ({ text: '{"suggestions": []}' }));
    await expect(suggestCategories([], complete)).resolves.toEqual({});
    expect(complete).not.toHaveBeenCalled();
  });

  it("propagates LLM failures to the caller", async () => {
    const complete = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(suggestCategories(ITEMS, complete)).rejects.toThrow("offline");
  });
});
