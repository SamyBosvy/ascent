import { describe, expect, it } from "vitest";
import { leastUsedColour, routeColour, routeColourClass, routeColourToken, ROUTE_COLOURS } from "./routeColours";
import { parseBackup, planImport } from "./backup";

describe("stable route colours", () => {
  it("has ten distinct named colours", () => {
    expect(ROUTE_COLOURS).toHaveLength(10);
    expect(new Set(ROUTE_COLOURS).size).toBe(10);
  });
  it.each(Array.from({ length: 10 }, (_, i) => i + 1))("respects stored colour %i", (color) => {
    expect(routeColour({ id: "same-id", color })).toBe(color);
  });
  it("is deterministic and insensitive to UUID letter case", () => {
    expect(routeColour({ id: "abcd-1234" })).toBe(routeColour({ id: "ABCD-1234" }));
    expect(routeColour({ id: "abcd-1234" })).toBe(6);
  });
  it("keeps colours on reorder, removal, insertion and rename", () => {
    const routes = Array.from({ length: 30 }, (_, i) => ({ id: `route-${i}`, name: `Name ${i}` }));
    const before = new Map(routes.map((r) => [r.id, routeColour(r)]));
    for (const r of [...routes].reverse().slice(5)) expect(routeColour({ ...r, name: "Renamed" })).toBe(before.get(r.id));
  });
  it("stays in range and uses all ten slots for varied ids", () => {
    const slots = Array.from({ length: 1000 }, (_, i) => routeColour({ id: `route-${i}` }));
    expect(slots.every((n) => n >= 1 && n <= 10)).toBe(true);
    expect(new Set(slots).size).toBe(10);
  });
  it.each([null, undefined, 0, 11, -1, 1.5, NaN])("falls back for invalid slot %s", (color) => {
    expect(routeColour({ id: "id", color })).toBe(routeColour({ id: "id" }));
  });
  it("allocates all ten colours before repeating", () => {
    const routes: { id: string; color: number }[] = [];
    for (let i = 1; i <= 10; i++) {
      const color = leastUsedColour(routes);
      expect(color).toBe(i);
      routes.push({ id: String(i), color });
    }
    expect(leastUsedColour(routes)).toBe(1);
  });
  it("counts legacy hashes and ignores archived and deleted routes", () => {
    const legacy = { id: "legacy" };
    const slot = routeColour(legacy);
    const all = Array.from({ length: 10 }, (_, i) => ({ id: String(i), color: i + 1 }));
    expect(leastUsedColour([...all, legacy])).not.toBe(slot);
    expect(leastUsedColour([{ id: "a", color: 1, archived_at: "date" }, { id: "b", color: 1, deleted_at: "date" }])).toBe(1);
  });
  it("chooses the lowest slot for tied minimum counts", () => {
    expect(leastUsedColour([{ id: "a", color: 1 }, { id: "b", color: 1 }, { id: "c", color: 2 }])).toBe(3);
  });
  it("produces matching CSS class and chart token", () => {
    expect(routeColourClass({ id: "a", color: 7 })).toBe("route-colour-7");
    expect(routeColourToken({ id: "a", color: 7 })).toBe("var(--route-7)");
  });
});

describe("backup route colours", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const backup = (color: unknown) => JSON.stringify({ exported_at: "2026-10-08T00:00:00Z", routes: [{ id, name: "Colour", type: "skill", color }] });
  it.each([1, 10, null, undefined])("preserves exported colour %s with new IDs", (color) => {
    const plan = planImport(parseBackup(backup(color)), [], "copy", () => "new-id");
    expect(plan.payloads[0]?.route.color).toBe(color);
    expect(plan.payloads[0]?.route.id).toBe("new-id");
  });
  it.each([0, 11, 1.5, "blue"])("counts invalid colour %s", (color) => {
    expect(parseBackup(backup(color)).invalid.routes).toBe(1);
  });
});