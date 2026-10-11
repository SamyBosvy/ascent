import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNavigation } from "./MobileNavigation";

vi.mock("./SessionPill", () => ({ SessionPill: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount(path = "/today") {
  const capture = vi.fn();
  const root = createRootRoute({ component: () => <><MobileNavigation onQuickCapture={capture} /><input aria-label="Note" /><Outlet /></> });
  const children = ["today", "routes", "routes/$id", "review", "notes", "insights"].map((path) => createRoute({ getParentRoute: () => root, path, component: () => null }));
  const router = createRouter({ routeTree: root.addChildren(children), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("navigation", { name: "Mobile navigation" });
  return capture;
}

describe("MobileNavigation", () => {
  it("keeps all five destinations and opens capture with its accessible button", async () => {
    const capture = await mount();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Quick capture" }));
    expect(capture).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Routes" })).not.toHaveAttribute("aria-current");
  });

  it("marks Routes current on a route detail page", async () => {
    await mount("/routes/example");
    expect(screen.getByRole("link", { name: "Routes" })).toHaveAttribute("aria-current", "page");
  });

  it("hides while a responsive drawer is open and returns after close", async () => {
    await mount();
    const nav = screen.getByRole("navigation");
    const drawer = document.createElement("div");
    drawer.dataset.responsiveMode = "drawer";
    drawer.dataset.state = "open";
    act(() => { document.body.append(drawer); });
    await waitFor(() => expect(nav).toHaveAttribute("hidden"));
    act(() => { drawer.dataset.state = "closed"; });
    await waitFor(() => expect(nav).not.toHaveAttribute("hidden"));
    drawer.remove();
  });

  it("hides for a focused input with a reduced visual viewport, then returns", async () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: window.innerHeight });
    vi.stubGlobal("visualViewport", viewport);
    await mount();
    const nav = screen.getByRole("navigation");
    act(() => { screen.getByRole("textbox").focus(); Object.assign(viewport, { height: window.innerHeight - 300 }); viewport.dispatchEvent(new Event("resize")); });
    await waitFor(() => expect(nav).toHaveAttribute("hidden"));
    act(() => { Object.assign(viewport, { height: window.innerHeight }); viewport.dispatchEvent(new Event("resize")); });
    await waitFor(() => expect(nav).not.toHaveAttribute("hidden"));
  });
});