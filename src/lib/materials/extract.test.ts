import { describe, expect, it } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  extensionOf,
  extractMaterialText,
  formatMaterialsForPrompt,
  isAllowedMaterial,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS_PER_TOPIC,
} from "@/lib/materials/extract";

describe("extensionOf / isAllowedMaterial", () => {
  it("parses extensions case-insensitively", () => {
    expect(extensionOf("Notes.PDF")).toBe("pdf");
    expect(extensionOf("noext")).toBe("");
  });

  it("allows known types and rejects legacy ppt", () => {
    expect(isAllowedMaterial("a.pdf")).toBe(true);
    expect(isAllowedMaterial("a.pptx")).toBe(true);
    expect(isAllowedMaterial("a.docx")).toBe(true);
    expect(isAllowedMaterial("a.txt")).toBe(true);
    expect(isAllowedMaterial("a.md", "text/markdown")).toBe(true);
    expect(isAllowedMaterial("a.ppt")).toBe(false);
    expect(isAllowedMaterial("a.exe")).toBe(false);
  });

  it("accepts octet-stream mime and rejects mismatched mime", () => {
    expect(isAllowedMaterial("a.pdf", "application/octet-stream")).toBe(true);
    expect(isAllowedMaterial("a.pdf", "image/png")).toBe(false);
  });

  it("exposes upload limits", () => {
    expect(ALLOWED_EXTENSIONS).toContain("pdf");
    expect(MAX_MATERIAL_BYTES).toBeGreaterThan(0);
    expect(MAX_MATERIALS_PER_TOPIC).toBe(8);
  });
});

describe("extractMaterialText", () => {
  it("extracts utf-8 text/md and rejects empty", async () => {
    const text = await extractMaterialText({
      filename: "note.md",
      mimeType: "text/markdown",
      buffer: new TextEncoder().encode("# 标题\n内容").buffer,
    });
    expect(text).toContain("标题");
    expect(text).toContain("内容");

    await expect(
      extractMaterialText({
        filename: "empty.txt",
        mimeType: "text/plain",
        buffer: new ArrayBuffer(0),
      }),
    ).rejects.toThrow(/为空/);
  });

  it("rejects unsupported and legacy ppt", async () => {
    await expect(
      extractMaterialText({
        filename: "old.ppt",
        mimeType: "application/vnd.ms-powerpoint",
        buffer: new ArrayBuffer(8),
      }),
    ).rejects.toThrow(/pptx/);

    await expect(
      extractMaterialText({
        filename: "x.bin",
        mimeType: "application/octet-stream",
        buffer: new ArrayBuffer(8),
      }),
    ).rejects.toThrow(/不支持/);
  });
});

describe("formatMaterialsForPrompt", () => {
  it("returns empty for no materials", () => {
    expect(formatMaterialsForPrompt([])).toBe("");
  });

  it("wraps retrieved snippets for prompts", () => {
    const block = formatMaterialsForPrompt(
      [{ filename: "a.txt", extractedText: "闭包知识点说明" }],
      { query: "闭包" },
    );
    expect(block).toContain("资料：a.txt");
    expect(block).toContain("闭包");
  });
});
