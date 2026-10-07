import { describe, expect, it } from "vitest";
import { computeStreaks, heatmapWeeks } from "./streaks";
import { pacing, type PacingInput } from "./pacing";
import { addDays, dateInZone, daysBetween, weekStartOf, zonedMidnight } from "./time";

describe("time helpers", () => {
  it("computes week starts for Monday and Sunday", () => {
    // 2026-10-07 is a Wednesday
    expect(weekStartOf("2026-10-07", 1)).toBe("2026-10-05");
    expect(weekStartOf("2026-10-07", 0)).toBe("2026-10-04");
    expect(weekStartOf("2026-10-04", 1)).toBe("2026-09-28");
    expect(weekStartOf("2026-10-04", 0)).toBe("2026-10-04");
  });
  it("adds and diffs days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-07", "2026-11-01")).toBe(25);
  });
  it("resolves the calendar day in a timezone", () => {
    const t = new Date("2026-10-07T23:30:00Z");
    expect(dateInZone(t, "UTC")).toBe("2026-10-07");
    expect(dateInZone(t, "Europe/Paris")).toBe("2026-10-08");
    expect(dateInZone(t, "America/Los_Angeles")).toBe("2026-10-07");
  });
  it("finds midnight in a timezone, including DST days", () => {
    expect(zonedMidnight("2026-10-08", "Europe/Paris").toISOString()).toBe("2026-10-07T22:00:00.000Z");
    expect(zonedMidnight("2026-12-01", "Europe/Paris").toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(zonedMidnight("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedMidnight("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("computeStreaks daily", () => {
  const today = "2026-10-07";
  it("counts consecutive days including today", () => {
    expect(computeStreaks(["2026-10-05", "2026-10-06", "2026-10-07"], "daily", null, today, 1)).toEqual({ current: 3, best: 3, unit: "day" });
  });
  it("does not break when today isn't checked yet", () => {
    expect(computeStreaks(["2026-10-05", "2026-10-06"], "daily", null, today, 1).current).toBe(2);
  });
  it("breaks after a missed day", () => {
    expect(computeStreaks(["2026-10-04", "2026-10-05"], "daily", null, today, 1).current).toBe(0);
  });
  it("tracks the best run separately and ignores duplicates/future", () => {
    const s = computeStreaks(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-03", "2026-09-04", "2026-10-07", "2026-10-09"], "daily", null, today, 1);
    expect(s).toEqual({ current: 1, best: 4, unit: "day" });
  });
  it("handles no check-ins", () => {
    expect(computeStreaks([], "daily", null, today, 1)).toEqual({ current: 0, best: 0, unit: "day" });
  });
});

describe("computeStreaks weekly and x_per_week", () => {
  const today = "2026-10-07"; // Wed; Monday week = 10-05, Sunday week = 10-04
  it("weekly: current week counts once met", () => {
    expect(computeStreaks(["2026-09-22", "2026-09-29", "2026-10-06"], "weekly", null, today, 1)).toEqual({ current: 3, best: 3, unit: "week" });
  });
  it("weekly: open current week doesn't break the streak", () => {
    expect(computeStreaks(["2026-09-22", "2026-09-29"], "weekly", null, today, 1).current).toBe(2);
  });
  it("weekly: a missed past week breaks it", () => {
    expect(computeStreaks(["2026-09-15", "2026-09-29"], "weekly", null, today, 1)).toMatchObject({ current: 1, best: 1 });
  });
  it("respects the week start", () => {
    // Sunday 10-04 shares the current week with Monday 10-05 when weeks start Sunday; not when they start Monday.
    const dates = ["2026-10-04", "2026-10-05"];
    expect(computeStreaks(dates, "weekly", null, today, 0).current).toBe(1);
    expect(computeStreaks(dates, "weekly", null, today, 1).current).toBe(2);
  });
  it("x_per_week needs the target per week", () => {
    const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-05", "2026-10-06"];
    expect(computeStreaks(dates, "x_per_week", 3, today, 1)).toEqual({ current: 1, best: 1, unit: "week" });
    expect(computeStreaks([...dates, "2026-10-07"], "x_per_week", 3, today, 1).current).toBe(2);
    expect(computeStreaks(["2026-09-21", "2026-09-28"], "x_per_week", 2, today, 1)).toMatchObject({ current: 0, best: 0 });
  });
});

describe("heatmapWeeks", () => {
  it("returns 26 columns ending in the current week with future days empty", () => {
    const w = heatmapWeeks("2026-10-07", 1);
    expect(w).toHaveLength(26);
    expect(w.at(-1)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", null, null, null, null]);
    expect(w[0]![0]).toBe("2026-04-13");
  });
});

describe("pacing", () => {
  const base: PacingInput = { type: "skill", status: "active", target_date: "2026-11-01", current_page: null, total_pages: null, milestonesTotal: 0, milestonesDone: 0 };
  const today = "2026-10-07";
  it("hides without a target date or when summited", () => {
    expect(pacing({ ...base, target_date: null }, today)).toBeNull();
    expect(pacing({ ...base, status: "summited" }, today)).toBeNull();
    expect(pacing({ ...base, summited_at: "2026-10-01T00:00:00Z" }, today)).toBeNull();
  });
  it("books: pages per day", () => {
    expect(pacing({ ...base, type: "book", total_pages: 400, current_page: 100 }, today)).toEqual({ text: "12 pages/day to finish by 1 Nov", tone: "ok" });
  });
  it("milestones: per week, rounded up", () => {
    expect(pacing({ ...base, milestonesTotal: 10, milestonesDone: 2 }, today)?.text).toBe("2 milestones/week to finish by 1 Nov");
    expect(pacing({ ...base, milestonesTotal: 2, milestonesDone: 1 }, today)?.text).toBe("1 milestone/week to finish by 1 Nov");
  });
  it("due today and overdue", () => {
    expect(pacing({ ...base, target_date: today, milestonesTotal: 3, milestonesDone: 1 }, today)).toEqual({ text: "Due today · 2 milestones left", tone: "due" });
    expect(pacing({ ...base, target_date: "2026-10-04" }, today)).toEqual({ text: "Overdue by 3 days", tone: "overdue" });
    expect(pacing({ ...base, target_date: "2026-10-06" }, today)?.text).toBe("Overdue by 1 day");
  });
  it("hides when everything is already done", () => {
    expect(pacing({ ...base, type: "book", total_pages: 100, current_page: 100 }, today)).toBeNull();
    expect(pacing({ ...base, milestonesTotal: 3, milestonesDone: 3, target_date: "2026-10-01" }, today)).toBeNull();
  });
  it("falls back to days left", () => {
    expect(pacing(base, today)?.text).toBe("25 days left · target 1 Nov");
  });
});

import { addTags, prefixTsQuery, safeTerm } from "./search";
describe("search helpers", () => {
  it("builds a safe prefix tsquery", () => {
    expect(prefixTsQuery("  café  ser:vice & (x)")).toBe("café:* & service:* & x:*");
    expect(prefixTsQuery("!!! ")).toBe("");
  });
  it("strips PostgREST-significant characters", () => expect(safeTerm("a,(b)*%c")).toBe("a b c"));
  it("normalises, dedupes and limits tags", () => {
    expect(addTags(["go"], " Rust , GO,  web dev ").tags).toEqual(["go", "rust", "web dev"]);
    expect(addTags([], "x".repeat(31)).error).toMatch(/30/);
    const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(addTags(ten, "more")).toEqual({ tags: ten, error: "A note can have at most 10 tags." });
  });
});
