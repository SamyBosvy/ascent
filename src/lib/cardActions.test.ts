import { describe, expect, it } from "vitest";
import { chunk } from "./cardActions";

describe("chunk", () => {
  it("0 items gives []", () => {
    expect(chunk([])).toEqual([]);
  });
  it("100 items gives 1 chunk", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    expect(chunk(items)).toHaveLength(1);
    expect(chunk(items)[0]).toHaveLength(100);
  });
  it("101 items gives 2 chunks", () => {
    const items = Array.from({ length: 101 }, (_, i) => i);
    const parts = chunk(items);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.length)).toEqual([100, 1]);
  });
  it("250 items gives chunk sizes 100, 100, 50", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunk(items).map((p) => p.length)).toEqual([100, 100, 50]);
  });
  it("preserves item order", () => {
    const items = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    expect(chunk(items).flat()).toEqual(items);
  });
});
