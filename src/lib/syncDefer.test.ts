import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { __setSyncQueryClientForTests, deferSyncRefresh, requestRefresh } from "./sync";

let inv: ReturnType<typeof vi.fn>;
beforeEach(() => { inv = vi.fn(); __setSyncQueryClientForTests({ invalidateQueries: inv } as unknown as QueryClient); });

describe("deferSyncRefresh / requestRefresh", () => {
  it("invalidates immediately without deferral", () => { requestRefresh(); expect(inv).toHaveBeenCalledTimes(1); });
  it("defers until end", () => {
    const end = deferSyncRefresh(); requestRefresh(); requestRefresh(); requestRefresh();
    expect(inv).toHaveBeenCalledTimes(0); end(); expect(inv).toHaveBeenCalledTimes(1);
  });
  it("only outer end invalidates", () => {
    const outer = deferSyncRefresh(); const inner = deferSyncRefresh(); requestRefresh();
    inner(); expect(inv).toHaveBeenCalledTimes(0); outer(); expect(inv).toHaveBeenCalledTimes(1);
  });
  it("end twice does not double-decrement", () => {
    const outer = deferSyncRefresh(); const inner = deferSyncRefresh();
    inner(); inner(); requestRefresh(); expect(inv).toHaveBeenCalledTimes(0); outer(); expect(inv).toHaveBeenCalledTimes(1);
  });
  it("end with nothing pending does not invalidate", () => { deferSyncRefresh()(); expect(inv).not.toHaveBeenCalled(); });
});
