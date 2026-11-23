import { describe, expect, it } from "vitest";
import { normalizeHash, parseRoute } from "@/router";

describe("normalizeHash", () => {
  it("defaults to the dashboard", () => {
    expect(normalizeHash("")).toBe("/dashboard");
    expect(normalizeHash("#")).toBe("/dashboard");
  });
  it("normalizes bare paths", () => {
    expect(normalizeHash("#expenses")).toBe("/expenses");
  });
  it("keeps leading slashes", () => {
    expect(normalizeHash("#/settings")).toBe("/settings");
  });
});

describe("parseRoute", () => {
  it("splits path and query", () => {
    const { path, params } = parseRoute("/trends?category=groceries-fresh&kind=expense");
    expect(path).toBe("/trends");
    expect(params.get("category")).toBe("groceries-fresh");
    expect(params.get("kind")).toBe("expense");
  });
  it("returns empty params without a query", () => {
    const { path, params } = parseRoute("/dashboard");
    expect(path).toBe("/dashboard");
    expect(params.get("category")).toBeNull();
  });
  it("keeps the drill-down category usable as a trend key", () => {
    const { params } = parseRoute("/trends?category=uncategorized&kind=income");
    expect(params.get("category")).toBe("uncategorized");
  });
});
