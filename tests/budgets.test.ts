import { beforeEach, describe, expect, it } from "vitest";
import type { KvStore } from "@/services/anna/storage";
import { createBudgetRepository, BudgetStoreError } from "@/services/budgets/repository";
import { resetBudgetMutationChain } from "@/services/budgets/store";

function memoryStore(initial: Record<string, unknown> = {}): KvStore & { data: Map<string, string> } {
  const data = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)])
  );
  return {
    kind: "local",
    data,
    async get<T>(key: string): Promise<T | null> {
      const namespaced = `expense-tracker:${key}`;
      const raw = data.get(namespaced);
      if (raw === undefined) return null;
      return JSON.parse(raw) as T;
    },
    async set<T>(key: string, value: T): Promise<void> {
      data.set(`expense-tracker:${key}`, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      data.delete(`expense-tracker:${key}`);
    },
    async keys(): Promise<string[]> {
      return [];
    },
  };
}

describe("budget repository", () => {
  beforeEach(() => {
    resetBudgetMutationChain();
  });

  it("creates, reads, updates, and deletes a budget", async () => {
    const repo = createBudgetRepository(memoryStore());

    const created = await repo.upsert({ categoryId: "food", amount: 200, currency: "CAD" });
    expect(created.id).toBeTruthy();
    expect(created.categoryId).toBe("dining-out"); // legacy id migrates on write
    expect(created.amount).toBe(200);
    expect(created.period).toBe("monthly");

    const listed = await repo.list();
    expect(listed).toHaveLength(1);

    const updated = await repo.upsert({ categoryId: "food", amount: 250 });
    expect(updated.id).toBe(created.id);
    expect(updated.amount).toBe(250);
    expect(updated.createdAt).toBe(created.createdAt);

    await repo.remove(created.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it("migrates retired category ids on read", async () => {
    const store = memoryStore({
      "expense-tracker:budgets:index": { version: 1, ids: ["b1", "b2"] },
      "expense-tracker:budgets:item:b1": {
        version: 1,
        budget: {
          id: "b1",
          categoryId: "food-dining",
          amount: 400,
          currency: "CAD",
          period: "monthly",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      },
      "expense-tracker:budgets:item:b2": {
        version: 1,
        budget: {
          id: "b2",
          categoryId: "cushion-taxes",
          amount: 300,
          currency: "CAD",
          period: "monthly",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
    const repo = createBudgetRepository(store);
    const listed = await repo.list();
    expect(listed).toHaveLength(2);
    expect(listed.find((b) => b.id === "b1")?.categoryId).toBe("dining-out");
    // No equivalent in the new taxonomy → uncategorized, like expenses.
    expect(listed.find((b) => b.id === "b2")?.categoryId).toBeNull();
  });

  it("stores an overall budget with null categoryId", async () => {
    const repo = createBudgetRepository(memoryStore());
    const overall = await repo.upsert({ categoryId: null, amount: 1500, currency: "CAD" });
    expect(overall.categoryId).toBeNull();
    expect(overall.amount).toBe(1500);
    const listed = await repo.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].categoryId).toBeNull();
  });

  it("versions stored objects and namespaces keys", async () => {
    const store = memoryStore();
    const repo = createBudgetRepository(store);
    const created = await repo.upsert({ categoryId: "transport", amount: 300, currency: "CAD" });

    const itemRaw = store.data.get(`expense-tracker:budgets:item:${created.id}`);
    expect(itemRaw).toBeTruthy();
    expect((JSON.parse(itemRaw as string) as { version: number }).version).toBe(1);

    const indexRaw = store.data.get("expense-tracker:budgets:index");
    expect(itemRaw).toBeTruthy();
    const index = JSON.parse(indexRaw as string) as { version: number; ids: string[] };
    expect(index.ids).toContain(created.id);
  });

  it("persists across repository instances", async () => {
    const store = memoryStore();
    const first = createBudgetRepository(store);
    const created = await first.upsert({ categoryId: "bills", amount: 500 });

    const second = createBudgetRepository(store);
    const listed = await second.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    expect(listed[0].amount).toBe(500);
  });

  it("upsert updates the amount for the same category without creating a duplicate", async () => {
    const repo = createBudgetRepository(memoryStore());
    await repo.upsert({ categoryId: "fun", amount: 100 });
    await repo.upsert({ categoryId: "fun", amount: 150 });
    await repo.upsert({ categoryId: "fun", amount: 200 });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(200);
  });

  it("allows separate budgets for different categories", async () => {
    const repo = createBudgetRepository(memoryStore());
    await repo.upsert({ categoryId: null, amount: 2000 });
    await repo.upsert({ categoryId: "food", amount: 400 });
    await repo.upsert({ categoryId: "transport", amount: 200 });
    const all = await repo.list();
    expect(all).toHaveLength(3);
  });

  it("throws not-found when removing a missing id", async () => {
    const repo = createBudgetRepository(memoryStore());
    await expect(repo.remove("ghost-id")).rejects.toMatchObject({ code: "not-found" });
  });

  it("surfaces storage failures on list", async () => {
    const failing: KvStore = {
      kind: "local",
      async get(): Promise<null> { throw new Error("boom"); },
      async set(): Promise<void> { throw new Error("boom"); },
      async remove(): Promise<void> { throw new Error("boom"); },
      async keys(): Promise<string[]> { return []; },
    };
    const repo = createBudgetRepository(failing);
    await expect(repo.list()).rejects.toBeInstanceOf(BudgetStoreError);
  });

  it("surfaces storage failures on upsert", async () => {
    const failing: KvStore = {
      kind: "local",
      async get(): Promise<null> { throw new Error("boom"); },
      async set(): Promise<void> { throw new Error("boom"); },
      async remove(): Promise<void> { throw new Error("boom"); },
      async keys(): Promise<string[]> { return []; },
    };
    const repo = createBudgetRepository(failing);
    await expect(
      repo.upsert({ categoryId: null, amount: 100 })
    ).rejects.toBeInstanceOf(BudgetStoreError);
  });

  it("serializes concurrent upserts so none are lost", async () => {
    const store = memoryStore();
    const repo = createBudgetRepository(store);
    const categories = ["food", "transport", "shopping", "bills", "fun"];
    const results = await Promise.all(
      categories.map((cat) => repo.upsert({ categoryId: cat, amount: 100 }))
    );
    expect(results).toHaveLength(5);
    const listed = await repo.list();
    expect(listed).toHaveLength(5);
  });

  it("rejects zero and negative amounts", async () => {
    const repo = createBudgetRepository(memoryStore());
    await expect(repo.upsert({ categoryId: null, amount: 0 })).rejects.toBeInstanceOf(BudgetStoreError);
    await expect(repo.upsert({ categoryId: null, amount: -50 })).rejects.toBeInstanceOf(BudgetStoreError);
  });

  it("silently tolerates stale ids in the index during list()", async () => {
    const store = memoryStore({
      "budgets:index": { version: 1, ids: ["ghost-id"] },
    });
    const repo = createBudgetRepository(store);
    const result = await repo.list();
    expect(result).toHaveLength(0);
  });
});
