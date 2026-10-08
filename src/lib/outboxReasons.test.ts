import { describe, expect, it } from "vitest";
import { classifyResult, configureOutbox, enqueue, flush, setOutboxUser, type OutboxItem } from "./outbox";

describe("outbox drop reasons", () => {
  it.each(["23503", "P0002", "PGRST116"])("reports missing parent for %s", (code) => {
    expect(classifyResult({ code })).toEqual({ status: "drop", reason: "its route or card no longer exists" });
  });
  it.each(["23514", "22P02", "22023"])("reports invalid change for %s", (code) => {
    expect(classifyResult({ code })).toEqual({ status: "drop", reason: "it was rejected as invalid" });
  });
  it("reports lost access", () => {
    expect(classifyResult({ code: "42501" })).toEqual({ status: "drop", reason: "you no longer have access" });
  });
  it("retains duplicate success and transient retries", () => {
    expect(classifyResult({ code: "23505" }, true)).toBe("ok");
    expect(classifyResult({ message: "network failure" })).toBe("retry");
    expect(classifyResult(null)).toBe("ok");
  });
  it("passes actual reason and operation label through a flush and removes once", async () => {
    let items: OutboxItem[] = [];
    const messages: string[] = [];
    configureOutbox({ storage: { get: async () => items, set: async (next) => { items = next; } }, sender: async () => classifyResult({ code: "23514" }), onDropped: (item, reason) => messages.push(`${item.kind}: ${reason}`), onSynced: () => {} });
    setOutboxUser("test-user");
    await enqueue({ kind: "pages", data: { route_id: "route", current_page: -1 } }, "change");
    expect(await flush()).toBe(0);
    expect(await flush()).toBe(0);
    expect(messages).toEqual(["pages: it was rejected as invalid"]);
    expect(items).toEqual([]);
  });
});