import { beforeEach, describe, expect, it } from "vitest";
import { clearDrafts, draftIsNewer, draftKey, moveDraft, readDraft, retryDelay, writeDraft, type NoteDraft } from "./noteDraft";

const d = (savedAt: string): NoteDraft => ({ title: "t", body: "b", routeId: "r", tags: [], savedAt });

describe("note drafts", () => {
  beforeEach(() => localStorage.clear());
  it("scopes keys to user and note", () => {
    expect(draftKey("u1", "n1")).toBe("ascent:note-draft:u1:n1");
    expect(draftKey("u1", null)).toBe("ascent:note-draft:u1:new");
  });
  it("decides newer vs server", () => {
    expect(draftIsNewer(d("2026-01-02T00:00:00Z"), "2026-01-01T00:00:00Z")).toBe(true);
    expect(draftIsNewer(d("2026-01-01T00:00:00Z"), "2026-01-01T00:00:00Z")).toBe(false);
    expect(draftIsNewer(d("2025-12-31T00:00:00Z"), "2026-01-01T00:00:00Z")).toBe(false);
    expect(draftIsNewer(d("2026-01-01T00:00:00Z"), undefined)).toBe(true);
  });
  it("moves the new draft to the id key", () => {
    writeDraft(draftKey("u", null), d("2026-01-01T00:00:00Z"));
    moveDraft(draftKey("u", null), draftKey("u", "n9"));
    expect(readDraft(draftKey("u", null))).toBeNull();
    expect(readDraft(draftKey("u", "n9"))?.body).toBe("b");
  });
  it("clears by prefix only", () => {
    writeDraft(draftKey("u", "a"), d("2026-01-01T00:00:00Z"));
    writeDraft(draftKey("v", "b"), d("2026-01-01T00:00:00Z"));
    localStorage.setItem("ascent:identity", "x");
    clearDrafts();
    expect(readDraft(draftKey("u", "a"))).toBeNull();
    expect(readDraft(draftKey("v", "b"))).toBeNull();
    expect(localStorage.getItem("ascent:identity")).toBe("x");
  });
  it("backs off 2s, 5s, 15s, then 30s", () => {
    expect([0, 1, 2, 3, 7].map(retryDelay)).toEqual([2000, 5000, 15000, 30000, 30000]);
  });
});
