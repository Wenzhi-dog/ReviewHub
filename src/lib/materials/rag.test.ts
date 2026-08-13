import { describe, expect, it } from "vitest";
import {
  chunkText,
  formatRetrievedChunksForPrompt,
  retrieveMaterialChunks,
} from "@/lib/materials/rag";

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkText("短文本")).toEqual(["短文本"]);
  });

  it("splits long text across paragraph boundaries", () => {
    const para = "段落内容。".repeat(80);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, 400, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});

describe("retrieveMaterialChunks", () => {
  it("returns empty when materials have no text", () => {
    expect(
      retrieveMaterialChunks([{ filename: "a.txt", extractedText: "  " }], "q"),
    ).toEqual([]);
  });

  it("returns full text for short corpora", () => {
    const chunks = retrieveMaterialChunks(
      [{ filename: "a.txt", extractedText: "闭包是函数与词法环境的组合" }],
      "闭包",
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.filename).toBe("a.txt");
    expect(chunks[0]?.text).toContain("闭包");
    expect(chunks[0]?.score).toBeGreaterThan(0.9);
  });

  it("ranks long corpora by query relevance", () => {
    // Exceed full-text threshold while keeping maxTotalChars room after the head chunk
    const filler = "无关内容填充字。".repeat(2000);
    const materials = [
      {
        filename: "doc.txt",
        extractedText: `${filler}\n\n专门讲解闭包与词法环境的组合。\n\n${filler}`,
      },
    ];
    const chunks = retrieveMaterialChunks(materials, "闭包 词法环境", {
      maxTotalChars: 80_000,
      maxChunks: 12,
      chunkSize: 800,
      overlap: 80,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.text.includes("闭包"))).toBe(true);
  });
});

describe("formatRetrievedChunksForPrompt", () => {
  it("returns empty string for no chunks", () => {
    expect(formatRetrievedChunksForPrompt([])).toBe("");
  });

  it("formats labels for head and subsequent snippets", () => {
    const text = formatRetrievedChunksForPrompt([
      { filename: "a.md", index: 0, text: "第一段", score: 1 },
      { filename: "a.md", index: 1, text: "第二段", score: 0.5 },
    ]);
    expect(text).toContain("### 资料：a.md\n第一段");
    expect(text).toContain("### 资料：a.md（片段 2）\n第二段");
    expect(text).toContain("用户提供的参考资料");
  });
});
