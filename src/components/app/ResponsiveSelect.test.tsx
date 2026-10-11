import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeSelect } from "./fields";
import { DESKTOP_SELECT_QUERY } from "./ResponsiveSelect";

function device(width = 1280, fine = true) {
  let matches = width >= 768 && fine;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    get matches() { return query === DESKTOP_SELECT_QUERY && matches; },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })));
  return (next: boolean) => act(() => { matches = next; listeners.forEach((fn) => fn()); });
}
function picker(change = vi.fn(), value = "") {
  return <><label htmlFor="route">Route</label><NativeSelect id="route" value={value} onChange={change}><option value="">All routes</option><option value="a">Alpine</option><option value="b" disabled>Blocked</option></NativeSelect></>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NativeSelect", () => {
  it("renders native on the server even with a desktop preference", () => {
    device();
    expect(renderToString(picker())).toContain("<select");
  });
  it.each([[390, true], [767, true], [1280, false]])("keeps native at width %s / fine pointer %s", (width, fine) => {
    device(Number(width), Boolean(fine));
    render(picker());
    expect(screen.getByLabelText("Route").tagName).toBe("SELECT");
  });
  it("switches desktop to Radix retaining empty-valued options and labels", () => {
    device();
    render(picker());
    const trigger = screen.getByRole("combobox", { name: "Route" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveTextContent("All routes");
    expect((screen.getByText("Route") as HTMLLabelElement).control).toBe(trigger);
    fireEvent.click(screen.getByText("Route"));
    expect(trigger).toHaveFocus();
  });
  it("passes aria-label and disabled state to the desktop trigger", () => {
    device();
    render(<NativeSelect aria-label="Frequency" disabled value="daily"><option value="daily">Daily</option></NativeSelect>);
    expect(screen.getByRole("combobox", { name: "Frequency" })).toBeDisabled();
  });
  it("fires native value changes with target.value", () => {
    device(390);
    const change = vi.fn();
    render(picker(change));
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "a" } });
    expect(change.mock.calls[0]?.[0].target.value).toBe("a");
    expect(screen.getByRole("option", { name: "Blocked" })).toBeDisabled();
  });
  it("fires desktop event-like changes and cannot select disabled options", async () => {
    device();
    const change = vi.fn();
    render(picker(change));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const blocked = await screen.findByRole("option", { name: "Blocked" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(blocked);
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: "Alpine" }));
    expect(change).toHaveBeenCalledExactlyOnceWith({ target: { value: "a" }, currentTarget: { value: "a" } });
  });
  it("latches mode until closed and preserves selection across mode changes", async () => {
    const resize = device();
    render(picker(vi.fn(), "a"));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    await screen.findByRole("listbox");
    resize(false);
    expect(screen.getByRole("combobox").tagName).toBe("BUTTON");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.getByRole("combobox").tagName).toBe("SELECT");
    expect(screen.getByRole("combobox")).toHaveValue("a");
    resize(true);
    expect(screen.getByRole("combobox")).toHaveTextContent("Alpine");
  });
});