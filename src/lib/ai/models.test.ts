import { describe, expect, it } from "vitest";
import {
  apiModelForTier,
  DEFAULT_MODEL_ID,
  QWEN_MODELS,
} from "@/lib/ai/models";

describe("models", () => {
  it("maps tiers to api models", () => {
    expect(apiModelForTier("high")).toBe(QWEN_MODELS.high);
    expect(apiModelForTier("simple")).toBe(QWEN_MODELS.simple);
    expect(DEFAULT_MODEL_ID).toBe(QWEN_MODELS.simple);
    expect(QWEN_MODELS.answer).toBe(QWEN_MODELS.simple);
  });
});
