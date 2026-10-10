import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Empty } from "./fields";
import { blockingError } from "@/lib/queryState";

describe("Empty", () => {
  it("renders title, description and exactly one primary action", () => {
    const { container } = render(<Empty illustration="cards" title="No cards yet" description="Cards appear here." primaryAction={<button>New card</button>} />);
    expect(screen.getByRole("heading", { name: "No cards yet" })).toBeInTheDocument();
    expect(screen.getByText("Cards appear here.")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
  it("renders the optional secondary link", () => {
    render(<Empty illustration="ridge" title="T" description="D" primaryAction={<button>Go</button>} secondaryLink={<a href="/routes">Open routes</a>} />);
    expect(screen.getByRole("link", { name: "Open routes" })).toBeInTheDocument();
  });
});

describe("blockingError", () => {
  const err = new Error("network");
  it("blocks when a query failed with no data", () => expect(blockingError([null, []], [err, undefined])).toBe(err));
  it("keeps cached data when a background refetch failed", () => expect(blockingError([err, []], [err, 0])).toBeNull());
  it("does not block while loading", () => expect(blockingError([null, undefined])).toBeNull());
});
