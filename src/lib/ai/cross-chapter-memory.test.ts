import { describe, expect, it } from "vitest";
import {
  dedupeQuestionStems,
  normalizeStem,
  truncatePriorQuestions,
} from "@/lib/ai/dedupe-stems";
import { questionsPrompt } from "@/lib/ai/prompts";

describe("normalizeStem", () => {
  it("strips punctuation, case, and question fluff", () => {
    expect(normalizeStem("什么是闭包？请简述其原理。")).toBe("闭包原理");
    expect(normalizeStem("请简述闭包的原理是什么？")).toBe("闭包原理");
  });
});

describe("dedupeQuestionStems", () => {
  it("drops near-duplicates of prior chapter stems", () => {
    const prior = ["什么是闭包？请简述其原理。", "解释原型链的工作方式"];
    const kept = dedupeQuestionStems(
      [
        { stem: "什么是闭包？请简述其原理" },
        { stem: "请简述闭包的原理是什么？" },
        { stem: "如何理解事件循环？" },
        { stem: "Promise 与 async/await 的区别是什么？" },
      ],
      prior,
    );
    expect(kept.map((q) => q.stem)).toEqual([
      "如何理解事件循环？",
      "Promise 与 async/await 的区别是什么？",
    ]);
  });

  it("dedupes within the same batch", () => {
    const kept = dedupeQuestionStems(
      [
        { stem: "如何理解事件循环？" },
        { stem: "事件循环如何工作？" },
        { stem: "说说 Promise 和 async/await 有何区别" },
        { stem: "Promise 与 async/await 的区别是什么？" },
      ],
      [],
    );
    expect(kept).toHaveLength(2);
    expect(kept[0]?.stem).toBe("如何理解事件循环？");
    expect(kept[1]?.stem).toMatch(/Promise/i);
  });

  it("skips empty stems and does not backfill", () => {
    const kept = dedupeQuestionStems(
      [{ stem: "   " }, { stem: "唯一有效题干" }],
      ["唯一有效题干"],
    );
    expect(kept).toEqual([]);
  });
});

describe("truncatePriorQuestions", () => {
  it("caps at 80 questions", () => {
    const priors = Array.from({ length: 100 }, (_, i) => ({
      chapterTitle: "C",
      stem: `题${i}`,
    }));
    expect(truncatePriorQuestions(priors)).toHaveLength(80);
  });

  it("caps by character budget while keeping order", () => {
    const long = "题干".repeat(2500); // ~5000 chars each
    const priors = [
      { chapterTitle: "第一章", stem: long },
      { chapterTitle: "第二章", stem: long },
      { chapterTitle: "第三章", stem: long },
    ];
    const out = truncatePriorQuestions(priors);
    expect(out.length).toBe(2);
    expect(out[0]?.chapterTitle).toBe("第一章");
    expect(out[1]?.chapterTitle).toBe("第二章");
  });
});

describe("questionsPrompt cross-chapter memory", () => {
  it("omits prior list on first chapter but still includes dedupe rules", () => {
    const prompt = questionsPrompt({
      topicTitle: "JavaScript",
      chapterTitle: "闭包",
      chapterSummary: "闭包基础",
      otherChapters: [{ title: "原型", summary: "原型链" }],
      enableSearch: false,
    });
    expect(prompt).toContain("其它章节（请拉开考点");
    expect(prompt).toContain("原型 — 原型链");
    expect(prompt).not.toMatch(/其它章节已出题目（跨章记忆/);
    expect(prompt).toContain("跨章去重（必须遵守）");
  });

  it("injects prior stems and keeps current/feedback for regen", () => {
    const prompt = questionsPrompt({
      topicTitle: "JavaScript",
      chapterTitle: "原型",
      chapterSummary: "原型链",
      priorQuestions: [{ chapterTitle: "闭包", stem: "什么是闭包？" }],
      otherChapters: [{ title: "闭包", summary: "闭包基础" }],
      current: [{ stem: "旧题干" }],
      feedback: "再难一点",
      enableSearch: false,
    });
    expect(prompt).toContain("[闭包] 什么是闭包？");
    expect(prompt).toContain("当前小题列表");
    expect(prompt).toContain("旧题干");
    expect(prompt).toContain("再难一点");
    expect(prompt).toContain("跨章去重（必须遵守）");
  });
});
