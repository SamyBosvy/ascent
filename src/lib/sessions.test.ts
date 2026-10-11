import { describe, expect, it } from "vitest";
import { minutesError } from "./sessions";

const WHOLE = "Minutes must be a whole number.";
const RANGE = "Minutes must be between 1 and 1440.";

describe("minutesError", () => {
  it.each([
    ["", WHOLE],
    ["0", RANGE],
    ["1", null],
    ["1440", null],
    ["1441", RANGE],
    ["12.5", WHOLE],
    ["abc", WHOLE],
    [" 30 ", null],
  ])("%j -> %j", (v, expected) => {
    expect(minutesError(v)).toBe(expected);
  });
});
