import { afterEach, describe, expect, it } from "vitest";
import {
  getDashScopeGenerationUrl,
  isDashScopeMultimodalModel,
} from "@/lib/ai/dashscope-stream";

describe("isDashScopeMultimodalModel", () => {
  it("detects qwen3.5+ flash/plus and vl/omni", () => {
    expect(isDashScopeMultimodalModel("qwen3.7-flash")).toBe(true);
    expect(isDashScopeMultimodalModel("qwen3.7-plus")).toBe(true);
    expect(isDashScopeMultimodalModel("qwen2.5-vl")).toBe(true);
    expect(isDashScopeMultimodalModel("qwen-omni-turbo")).toBe(true);
    expect(isDashScopeMultimodalModel("qwen-turbo")).toBe(false);
  });
});

describe("getDashScopeGenerationUrl", () => {
  afterEach(() => {
    delete process.env.DASHSCOPE_BASE_URL;
  });

  it("uses multimodal path for flash models", () => {
    expect(getDashScopeGenerationUrl("qwen3.7-flash")).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    );
  });

  it("uses text path for classic models", () => {
    expect(getDashScopeGenerationUrl("qwen-turbo")).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    );
  });

  it("rewrites origin from DASHSCOPE_BASE_URL", () => {
    process.env.DASHSCOPE_BASE_URL =
      "https://custom.example.com/compatible-mode/v1";
    expect(getDashScopeGenerationUrl("qwen3.7-plus")).toBe(
      "https://custom.example.com/api/v1/services/aigc/multimodal-generation/generation",
    );
  });
});
