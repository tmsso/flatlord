import { describe, it, expect, vi } from "vitest";
import { withTimeout } from "../../src/lib/async/with-timeout";

describe("withTimeout", () => {
  it("returns the promise's value when it settles first", async () => {
    await expect(withTimeout(Promise.resolve("sent"), 1000, () => "timeout")).resolves.toBe("sent");
  });

  it("resolves with the fallback when the call hangs", async () => {
    vi.useFakeTimers();
    const hung = new Promise<string>(() => {});
    const result = withTimeout(hung, 10_000, () => "timeout");
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBe("timeout");
    vi.useRealTimers();
  });

  it("propagates a rejection from the call itself", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, () => "timeout")).rejects.toThrow("boom");
  });
});
