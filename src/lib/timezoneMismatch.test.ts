import { describe, expect, it } from "vitest";
import { dismissKey, isDismissed, mismatch } from "./timezoneMismatch";

describe("mismatch", () => {
  it("is false when saved is null", () => {
    expect(mismatch(null, "Europe/Paris")).toBe(false);
  });
  it("is false for the same zone", () => {
    expect(mismatch("Europe/Paris", "Europe/Paris")).toBe(false);
  });
  it("is false for aliases with the same offset", () => {
    expect(mismatch("Asia/Calcutta", "Asia/Kolkata")).toBe(false);
  });
  it("is true for zones with different offsets", () => {
    expect(mismatch("Europe/Paris", "Australia/Sydney")).toBe(true);
  });
  it("is false for an invalid zone", () => {
    expect(mismatch("Not/AZone", "Europe/Paris")).toBe(false);
    expect(mismatch("Europe/Paris", "Not/AZone")).toBe(false);
  });
});

describe("isDismissed", () => {
  it("returns true for the matching pair", () => {
    expect(isDismissed("Australia/Sydney|Europe/Paris", "Australia/Sydney", "Europe/Paris")).toBe(true);
  });
  it("returns false for a different pair or null", () => {
    expect(isDismissed("Australia/Sydney|Europe/Paris", "Europe/London", "Europe/Paris")).toBe(false);
    expect(isDismissed(null, "Australia/Sydney", "Europe/Paris")).toBe(false);
  });
  it("dismissKey is scoped to the user", () => {
    expect(dismissKey("u1")).toBe("ascent:tz-dismissed:u1");
  });
});
