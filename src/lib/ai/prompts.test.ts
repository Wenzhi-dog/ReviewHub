import { describe, expect, it } from "vitest";
import {
  answerPrompt,
  chaptersPrompt,
  questionsPrompt,
} from "@/lib/ai/prompts";

describe("chaptersPrompt", () => {
  it("includes current list and feedback", () => {
    const prompt = chaptersPrompt({
      title: "操作系统",
      current: [{ title: "进程", summary: "PCB" }],
      feedback: "再细一点",
      enableSearch: false,
    });
    expect(prompt).toContain("操作系统");
    expect(prompt).toContain("进程 — PCB");
    expect(prompt).toContain("再细一点");
    expect(prompt).toContain('"chapters"');
  });

  it("switches workflow when materials and search are on", () => {
    const prompt = chaptersPrompt({
      title: "主题",
      materialsBlock: "资料正文",
      enableSearch: true,
    });
    expect(prompt).toContain("资料正文");
    expect(prompt).toContain("优先阅读用户提供的参考资料");
  });
});

describe("questionsPrompt", () => {
  it("covers materials-only workflow", () => {
    const prompt = questionsPrompt({
      topicTitle: "T",
      chapterTitle: "C",
      chapterSummary: "S",
      materialsBlock: "资料",
      enableSearch: false,
    });
    expect(prompt).toContain("依据用户参考资料");
    expect(prompt).toContain("跨章去重");
  });
});

describe("answerPrompt", () => {
  it("includes stem and source section requirement", () => {
    const prompt = answerPrompt({
      topicTitle: "T",
      chapterTitle: "C",
      stem: "什么是进程？",
      materialsBlock: "资料块",
    });
    expect(prompt).toContain("什么是进程？");
    expect(prompt).toContain("资料块");
    expect(prompt).toContain("依据来源");
  });
});
