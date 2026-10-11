import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { habitConsistency, habitDueToday, routeStats } from "./camp";
import type { RouteAgg, RouteRow } from "./data";

const route = (patch: Partial<RouteRow> = {}): RouteRow => ({ reminder_enabled: false, reminder_time: "19:00:00", color: null, id: "r", user_id: "u", name: "Learning", type: "skill", status: "active", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z", archived_at: null, deleted_at: null, description: null, target_date: null, total_pages: null, current_page: null, habit_frequency: null, habit_target: null, speech_lang: null, camp_override: null, summited_at: null, ...patch });
const agg = (patch: Partial<RouteAgg> = {}): RouteAgg => ({ route_id: "r", milestones_total: 0, milestones_done: 0, last_milestone_at: "", minutes: 0, session_count: 0, last_session_at: "", cards_total: 0, cards_mature: 0, cards_due: 0, reviews_recent: 0, reviews_recent_good: 0, last_review_at: "", checkins_recent: 0, checkins_week: 0, checked_today: false, last_checkin_on: "", ...patch });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("camp scoring", () => {
  it("weights progress 50%, time 20%, cards 30%", () => {
    const s = routeStats(route(), agg({ milestones_total: 10, milestones_done: 8, minutes: 600, cards_total: 10, cards_mature: 4, reviews_recent: 10, reviews_recent_good: 8 }));
    expect(s.score).toBeCloseTo(.8 * .5 + .5 * .2 + (.4 * .5 + .8 * .5) * .3);
    expect(s.retention).toBe(.8); expect(s.done).toBe(8); expect(s.total).toBe(10); expect(s.minutes).toBe(600);
  });
  it("omits unused progress/cards and renormalizes time", () => expect(routeStats(route(), agg({ minutes: 600 })).score).toBe(.5));
  it("omits cards when unused but retains time even at zero", () => expect(routeStats(route(), agg({ milestones_total: 2, milestones_done: 1 })).score).toBeCloseTo(.25 / .7));
  it("omits progress but keeps cards and time", () => expect(routeStats(route(), agg({ cards_total: 2, cards_mature: 2, reviews_recent: 2, reviews_recent_good: 2 })).score).toBeCloseTo(.3 / .5));
  it("uses pages as progress when milestones are absent, capped at 100%", () => expect(routeStats(route({ total_pages: 100, current_page: 120 }), agg()).score).toBeCloseTo(.5 / .7));
  it("milestones take precedence over page progress", () => expect(routeStats(route({ total_pages: 100, current_page: 100 }), agg({ milestones_total: 2, milestones_done: 0 })).score).toBe(0));
  it("caps time at 1200 minutes", () => expect(routeStats(route(), agg({ minutes: 2400 })).score).toBe(1));
  it("absent aggregates yield base camp, null retention, and zero due", () => expect(routeStats(route(), undefined)).toMatchObject({ score: 0, camp: 0, retention: null, due: 0 }));
  it("cards with no reviews have zero retention contribution", () => expect(routeStats(route(), agg({ cards_total: 10, cards_mature: 10 })).score).toBeCloseTo(.15 / .5));
  for (const [threshold, camp] of [[.15, 1], [.4, 2], [.65, 3], [.9, 4]] as const) {
    it(`camp ${camp} begins at ${threshold}`, () => {
      expect(routeStats(route(), agg({ minutes: threshold * 1200 })).calculated).toBe(camp);
      expect(routeStats(route(), agg({ minutes: (threshold - .00001) * 1200 })).calculated).toBe(camp - 1);
    });
  }
  it.each([0, 1, 2, 3, 4])("manual override %i wins without changing calculated score", camp => {
    expect(routeStats(route({ camp_override: camp }), agg({ minutes: 1200 }))).toMatchObject({ camp, calculated: 4, score: 1 });
  });
  it("reports the latest available activity and due count", () => expect(routeStats(route(), agg({ cards_due: 4, last_session_at: "2026-10-06T12:00:00Z", last_review_at: "2026-10-07T12:00:00Z" }))).toMatchObject({ due: 4, lastActivity: "2026-10-07T12:00:00Z" }));
});
describe("habits", () => {
  it.each(["daily", "weekly", "x_per_week"])("measures %s consistency from start date (seven days inclusive)", freq => {
    const expected = freq === "daily" ? 7 : freq === "weekly" ? 1 : 3;
    expect(habitConsistency(route({ type: "habit", created_at: "2026-10-01T23:00:00", habit_frequency: freq, habit_target: 3 }), agg({ checkins_recent: 1 }))).toBeCloseTo(1 / expected);
  });
  it("counts today as day one and caps at 100%", () => {
    const r = route({ type: "habit", created_at: "2026-10-07T10:00:00", habit_frequency: "daily" });
    expect(habitConsistency(r, agg({ checkins_recent: 1 }))).toBe(1); expect(habitConsistency(r, agg({ checkins_recent: 5 }))).toBe(1);
  });
  it("caps window at 30 days", () => expect(habitConsistency(route({ habit_frequency: "daily" }), agg({ checkins_recent: 15 }))).toBe(.5));
  it("weekly and x-per-week use proportional partial-week targets", () => {
    expect(habitConsistency(route({ created_at: "2026-10-05T10:00:00", habit_frequency: "weekly" }), agg({ checkins_recent: 1 }))).toBe(1);
    expect(habitConsistency(route({ created_at: "2026-10-05T10:00:00", habit_frequency: "x_per_week", habit_target: 7 }), agg({ checkins_recent: 1 }))).toBeCloseTo(1 / 3);
  });
  it("missing frequency defaults to daily and missing X target to three", () => {
    expect(habitConsistency(route(), agg({ checkins_recent: 15 }))).toBe(.5);
    expect(habitConsistency(route({ habit_frequency: "x_per_week" }), agg({ checkins_recent: 3 }))).toBeCloseTo(7 / 30);
  });
  it("no check-ins gives zero, including missing aggregates", () => expect(habitConsistency(route(), undefined)).toBe(0));
  it("habit progress replaces milestones/pages in camp scoring", () => expect(routeStats(route({ type: "habit" }), agg({ checkins_recent: 15, milestones_total: 2, milestones_done: 2 })).score).toBeCloseTo(.25 / .7));
  it("daily is due unless checked today", () => {
    expect(habitDueToday(route(), undefined)).toBe(true); expect(habitDueToday(route(), agg({ checked_today: true }))).toBe(false);
  });
  it.each([["weekly", 1], ["x_per_week", 3]])("%s is due until weekly target %i", (freq, target) => {
    const r = route({ habit_frequency: String(freq), habit_target: Number(target) });
    expect(habitDueToday(r, agg({ checkins_week: Number(target) - 1 }))).toBe(true); expect(habitDueToday(r, agg({ checkins_week: Number(target) }))).toBe(false); expect(habitDueToday(r, agg({ checked_today: true }))).toBe(false);
  });
});