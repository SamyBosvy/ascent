import { describe, expect, it } from "vitest";
import type { RouteAgg, RouteRow } from "./data";
import { dateInZone, reminderEligible, reminderPayload, validPushEndpoint } from "./habitReminders";

const route: RouteRow = { id: "12345678-1234-1234-1234-123456789012", user_id: "private-user", name: "Read", type: "habit", status: "active", habit_frequency: "daily", habit_target: null, reminder_enabled: true, reminder_time: "19:00:00", archived_at: null, deleted_at: null, color: null, created_at: "", updated_at: "", description: "private note", target_date: null, total_pages: null, current_page: null, speech_lang: null, camp_override: null, summited_at: null };
const agg: RouteAgg = { route_id: route.id, checked_today: false, checkins_week: 0, checkins_recent: 0, milestones_total: 0, milestones_done: 0, last_milestone_at: "", minutes: 0, session_count: 0, last_session_at: "", cards_total: 0, cards_mature: 0, cards_due: 0, reviews_recent: 0, reviews_recent_good: 0, last_review_at: "", last_checkin_on: "" };
const due = new Date("2026-10-11T08:00:00Z");
describe("habit reminder eligibility", () => {
  it("uses the account timezone", () => { expect(reminderEligible(route, agg, due, "Australia/Sydney", false)).toBe(true); expect(reminderEligible(route, agg, due, "UTC", false)).toBe(false); });
  it("includes time zero and excludes exactly 15 minutes", () => { expect(reminderEligible(route, agg, due, "Australia/Sydney", false)).toBe(true); expect(reminderEligible(route, agg, new Date(+due + 899000), "Australia/Sydney", false)).toBe(true); expect(reminderEligible(route, agg, new Date(+due + 900000), "Australia/Sydney", false)).toBe(false); });
  it("does not send before reminder time", () => expect(reminderEligible(route, agg, new Date(+due - 1000), "Australia/Sydney", false)).toBe(false));
  it("skips checked-in habits", () => expect(reminderEligible(route, { ...agg, checked_today: true }, due, "Australia/Sydney", false)).toBe(false));
  it("skips already reminded days", () => expect(reminderEligible(route, agg, due, "Australia/Sydney", true)).toBe(false));
  it("weekly habits stop after one check-in", () => expect(reminderEligible({ ...route, habit_frequency: "weekly" }, { ...agg, checkins_week: 1 }, due, "Australia/Sydney", false)).toBe(false));
  it("three-times-weekly stops at three", () => { expect(reminderEligible({ ...route, habit_frequency: "x_per_week", habit_target: 3 }, { ...agg, checkins_week: 2 }, due, "Australia/Sydney", false)).toBe(true); expect(reminderEligible({ ...route, habit_frequency: "x_per_week", habit_target: 3 }, { ...agg, checkins_week: 3 }, due, "Australia/Sydney", false)).toBe(false); });
  it.each([{ deleted_at: "now" }, { archived_at: "now" }, { status: "paused" as const }, { reminder_enabled: false }, { type: "book" as const }])("skips ineligible route %j", (patch) => expect(reminderEligible({ ...route, ...patch }, agg, due, "Australia/Sydney", false)).toBe(false));
  it("local dates cross UTC boundaries", () => expect(dateInZone(new Date("2026-10-10T14:01:00Z"), "Australia/Sydney")).toBe("2026-10-11"));
  it("rejects invalid zones", () => expect(reminderEligible(route, agg, due, "Invalid", false)).toBe(false));
  it("payload includes only the name, route/day identity and navigation", () => expect(reminderPayload(route, "2026-10-11")).toEqual({ title: "Ascent", body: "Time for Read — keep your streak going.", tag: `habit:${route.id}:2026-10-11`, data: { url: `/routes/${route.id}` } }));
  it("prevents arbitrary endpoints", () => { expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/test")).toBe(true); expect(validPushEndpoint("https://localhost/private")).toBe(false); expect(validPushEndpoint("https://fcm.googleapis.com.evil.test/send")).toBe(false); expect(validPushEndpoint("http://web.push.apple.com/send")).toBe(false); });
});