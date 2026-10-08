import { describe, expect, it } from "vitest";
import { deserializeCache, serializeCache } from "./cacheSerialization";

describe("persisted query Maps", () => {
  it("restores route-stat Maps instead of plain objects", () => {
    const original = { queries: [{ state: { data: new Map([["route", { minutes: 45 }]]) } }] };
    expect(deserializeCache(serializeCache(original))).toEqual(original);
  });
  it("retains nested maps and ordinary query values", () => {
    const original = { history: new Map([["route", ["2026-10-08"]]]), count: 3, rows: [{ color: 8 }], missing: null };
    expect(deserializeCache(serializeCache(original))).toEqual(original);
  });
});