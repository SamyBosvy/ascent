import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSubmission } from "./use-submission";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
describe("submission lock", () => {
  it("locks synchronously before a rerender and releases after completion", async () => {
    const { result } = renderHook(useSubmission);
    let finish: ((value: string) => void) | undefined;
    const action = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    let pending: Promise<unknown> | undefined;
    act(() => { pending = result.current.submit(action); void result.current.submit(action); });
    expect(action).toHaveBeenCalledTimes(1); expect(result.current.submitting).toBe(true);
    await act(async () => { finish?.("saved"); await pending; });
    expect(result.current.submitting).toBe(false);
    await act(async () => { await result.current.submit(async () => "again"); });
    expect(result.current.submitting).toBe(false);
  });
  it("unlocks after rejected requests so saving can be retried", async () => {
    const { result } = renderHook(useSubmission);
    await act(async () => { await result.current.submit(async () => { throw new Error("Offline"); }); });
    expect(result.current.submitting).toBe(false);
    const retry = vi.fn(async () => true);
    await act(async () => { await result.current.submit(retry); });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});