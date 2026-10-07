import { afterEach, describe, expect, it, vi } from "vitest";
import { orderQueue, shuffle } from "./reviewOrdering";
const c = (id: string, day: number, hour = 12) => ({ id, due_at: new Date(2026, 9, day, hour).toISOString() });
afterEach(() => vi.restoreAllMocks());
describe("review ordering", () => {
  it("earlier due days always precede later days", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(orderQueue([c("today", 7), c("old", 1), c("yesterday", 6)]).map(x => x.id)).toEqual(["old", "yesterday", "today"]);
  });
  it("shuffles within each day but never across days", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(orderQueue([c("b", 1, 13), c("d", 2, 13), c("a", 1, 10), c("c", 2, 10)]).map(x => x.id)).toEqual(["b", "a", "d", "c"]);
  });
  it("groups by local calendar day, not exact timestamp", () => expect(orderQueue([c("a", 7, 0), c("b", 7, 23)], () => 0).map(x => x.id)).toEqual(["b", "a"]));
  it("does not mutate input or lose/duplicate cards", () => {
    const input = [c("c", 7), c("a", 1), c("b", 1)]; const before = [...input];
    const result = orderQueue(input, () => .9); expect(input).toEqual(before); expect(result).not.toBe(input); expect(new Set(result).size).toBe(3);
  });
  it("handles empty and singleton queues without random samples", () => {
    const random = vi.fn(() => 0); expect(orderQueue([], random)).toEqual([]); expect(orderQueue([c("a", 7)], random)).toEqual([c("a", 7)]); expect(random).not.toHaveBeenCalled();
  });
  it("shuffle supports both extreme samples and preserves input", () => {
    const input = [1, 2, 3]; expect(shuffle(input, () => 0)).toEqual([2, 3, 1]); expect(shuffle(input, () => 1 - Number.EPSILON)).toEqual([1, 2, 3]); expect(input).toEqual([1, 2, 3]);
  });
});