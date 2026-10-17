import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ installed: false, prompt: vi.fn() }));
vi.mock("@/lib/install", async (original) => ({
  ...await original<typeof import("@/lib/install")>(),
  subscribeInstalled: () => () => {},
  installedSnapshot: () => mocks.installed,
  promptInstall: mocks.prompt,
}));
import { DownloadApp } from "./DownloadApp";
beforeEach(() => { mocks.installed = false; mocks.prompt.mockReset().mockResolvedValue(false); });
afterEach(cleanup);

it("keeps download available after closing instructions", async () => {
  render(<DownloadApp />);
  fireEvent.click(screen.getByRole("button", { name: "Download the app" }));
  fireEvent.click(await screen.findByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Download the app" }));
  expect(await screen.findByRole("button", { name: "Done" })).toBeEnabled();
});

it("uses the native prompt instead of opening instructions when available", async () => {
  mocks.prompt.mockResolvedValue(true);
  render(<DownloadApp />);
  fireEvent.click(screen.getByRole("button", { name: "Download the app" }));
  await vi.waitFor(() => expect(mocks.prompt).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("hides the button while installed", () => {
  mocks.installed = true;
  render(<DownloadApp />);
  expect(screen.queryByRole("button", { name: "Download the app" })).toBeNull();
});