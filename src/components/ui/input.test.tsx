import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("autofill suppression", () => {
  it("Input defaults autoComplete to off", () => {
    render(<Input aria-label="field" />);
    expect(screen.getByLabelText("field")).toHaveAttribute("autocomplete", "off");
  });
  it("Textarea defaults autoComplete to off", () => {
    render(<Textarea aria-label="body" />);
    expect(screen.getByLabelText("body")).toHaveAttribute("autocomplete", "off");
  });
  it("an explicit autoComplete still wins (sign-in fields)", () => {
    render(<Input aria-label="email" autoComplete="email" />);
    expect(screen.getByLabelText("email")).toHaveAttribute("autocomplete", "email");
  });
});
