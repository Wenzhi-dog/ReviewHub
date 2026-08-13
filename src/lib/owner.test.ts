import { afterEach, describe, expect, it } from "vitest";
import { requireOwnerId } from "@/lib/owner";

describe("requireOwnerId", () => {
  afterEach(() => {
    delete process.env.SHARED_OWNER_ID;
  });

  it("defaults to shared", async () => {
    delete process.env.SHARED_OWNER_ID;
    await expect(requireOwnerId()).resolves.toBe("shared");
  });

  it("uses SHARED_OWNER_ID when set", async () => {
    process.env.SHARED_OWNER_ID = "  user-1  ";
    await expect(requireOwnerId()).resolves.toBe("user-1");
  });
});
