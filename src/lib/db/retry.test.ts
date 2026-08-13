import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDbError,
  sanitizeDbText,
  withDbRetry,
} from "@/lib/db/retry";

describe("sanitizeDbText", () => {
  it("strips NUL bytes", () => {
    expect(sanitizeDbText("a\u0000b")).toBe("ab");
  });
});

describe("formatDbError", () => {
  it("handles non-Error values", () => {
    expect(formatDbError("x")).toBe("数据库操作失败");
  });

  it("redacts Failed query dumps", () => {
    const err = new Error("Failed query: SELECT … params: huge");
    (err as Error & { cause: Error }).cause = new Error("connection reset");
    expect(formatDbError(err)).toBe("connection reset");
  });

  it("appends cause for normal errors", () => {
    const err = new Error("outer");
    (err as Error & { cause: Error }).cause = new Error("inner");
    expect(formatDbError(err)).toBe("outer（inner）");
  });
});

describe("withDbRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns on first success", async () => {
    const fn = vi.fn(async () => 42);
    await expect(withDbRetry(fn, { retries: 2, baseDelayMs: 1 })).resolves.toBe(
      42,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors then succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, { retries: 2, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent postgres codes", async () => {
    const err = Object.assign(new Error("unique"), { code: "23505" });
    const fn = vi.fn(async () => {
      throw err;
    });
    await expect(withDbRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toBe(
      err,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
