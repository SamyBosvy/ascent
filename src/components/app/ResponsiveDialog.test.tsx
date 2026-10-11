import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponsiveDialog } from "./ResponsiveDialog";

function mediaWidth(initial: number) {
  let width = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    get matches() { return query === "(max-width: 639px)" && width < 640; },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: () => {}, removeListener: () => {},
  })));
  return (next: number) => act(() => { width = next; listeners.forEach((fn) => fn()); });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ResponsiveDialog", () => {
  it.each([[390, "drawer"], [639, "drawer"], [640, "dialog"], [1280, "dialog"]])("uses the correct mode at %ipx", async (width, mode) => {
    mediaWidth(Number(width));
    render(<ResponsiveDialog open onOpenChange={vi.fn()} title="Edit route"><input aria-label="Name" /></ResponsiveDialog>);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-mode", mode));
  });

  it.each([390, 1280])("latches mode and preserves input across resize from %ipx", async (width) => {
    const resize = mediaWidth(width);
    render(<ResponsiveDialog open onOpenChange={vi.fn()} title="Edit route"><input aria-label="Name" /></ResponsiveDialog>);
    const mode = width < 640 ? "drawer" : "dialog";
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-mode", mode));
    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.change(input, { target: { value: "Spanish" } });
    resize(width < 640 ? 1280 : 390);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-mode", mode);
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(input);
    expect(input).toHaveValue("Spanish");
  });

  it.each(["escape", "button"])("requires confirmation for a dirty %s close", async (method) => {
    mediaWidth(390);
    const change = vi.fn();
    render(<ResponsiveDialog open dirty onOpenChange={change} title="Edit route"><input aria-label="Name" /></ResponsiveDialog>);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-mode", "drawer"));
    if (method === "escape") fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Discard changes?")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(change).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([390, 1280])("ignores close while submitting at %ipx", async (width) => {
    mediaWidth(width);
    const change = vi.fn();
    render(<ResponsiveDialog open submitting onOpenChange={change} title="Edit route"><input aria-label="Name" /></ResponsiveDialog>);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-mode", width < 640 ? "drawer" : "dialog"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });
});