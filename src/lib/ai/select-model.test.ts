import { describe, expect, it } from "vitest";
import { heuristicTier } from "@/lib/ai/select-model";

describe("heuristicTier", () => {
  it("returns high for exam / systems keywords", () => {
    expect(
      heuristicTier({ kind: "chapters", topicTitle: "考研操作系统" }),
    ).toBe("high");
    expect(
      heuristicTier({
        kind: "questions",
        topicTitle: "入门",
        chapterTitle: "分布式",
      }),
    ).toBe("high");
  });

  it("returns high for long haystacks", () => {
    expect(
      heuristicTier({
        kind: "chapters",
        topicTitle: "a".repeat(41),
      }),
    ).toBe("high");
  });

  it("returns simple for short general topics", () => {
    expect(heuristicTier({ kind: "chapters", topicTitle: "摄影入门" })).toBe(
      "simple",
    );
  });
});
