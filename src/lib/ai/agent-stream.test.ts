import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/ai/agent-stream";

describe("extractJsonObject", () => {
  it("parses plain and fenced JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  it("extracts embedded object from surrounding text", () => {
    expect(extractJsonObject('前缀 {"c":3} 后缀')).toEqual({ c: 3 });
  });

  it("throws on empty or non-json", () => {
    expect(() => extractJsonObject("   ")).toThrow(/空响应/);
    expect(() => extractJsonObject("没有大括号")).toThrow(/无法解析/);
  });
});
