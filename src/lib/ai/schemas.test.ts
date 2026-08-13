import { describe, expect, it } from "vitest";
import { chaptersSchema, questionsSchema } from "@/lib/ai/schemas";

describe("chaptersSchema", () => {
  it("accepts valid chapters", () => {
    const parsed = chaptersSchema.parse({
      chapters: [{ title: "一", summary: "概要" }],
    });
    expect(parsed.chapters).toHaveLength(1);
  });

  it("rejects empty chapters", () => {
    expect(() => chaptersSchema.parse({ chapters: [] })).toThrow();
  });
});

describe("questionsSchema", () => {
  it("accepts valid questions", () => {
    const parsed = questionsSchema.parse({
      questions: [{ stem: "题干" }],
    });
    expect(parsed.questions[0]?.stem).toBe("题干");
  });

  it("rejects empty questions", () => {
    expect(() => questionsSchema.parse({ questions: [] })).toThrow();
  });
});
