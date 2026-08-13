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
    expect(prompt).toContain("你是技术面试出题 Agent");
    expect(prompt).toContain("操作系统");
    expect(prompt).toContain("进程 — PCB");
    expect(prompt).toContain("再细一点");
    expect(prompt).toContain('"chapters"');
  });

  it("asks for interview modules instead of textbook chapters", () => {
    const prompt = chaptersPrompt({
      title: "后端面试",
      enableSearch: false,
    });
    expect(prompt).toContain("适合面试准备的模块");
    expect(prompt).toContain("高频概念");
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
    expect(prompt).toContain("你是技术面试出题 Agent");
    expect(prompt).toContain("依据用户参考资料");
    expect(prompt).toContain("跨章去重");
    expect(prompt).toContain("出题原则（必须遵守）");
    expect(prompt).toContain("题干应像面试官会问的话");
    expect(prompt).toContain("避免：填空背诵");
  });

  it("searches for interview questions when web search is on", () => {
    const prompt = questionsPrompt({
      topicTitle: "T",
      chapterTitle: "C",
      chapterSummary: "S",
      enableSearch: true,
    });
    expect(prompt).toContain("高频面试题");
    expect(prompt).toContain("不要搜课后习题");
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
    expect(prompt).toContain("你是面试辅导助手");
    expect(prompt).toContain("什么是进程？");
    expect(prompt).toContain("资料块");
    expect(prompt).toContain("可能的追问");
    expect(prompt).toContain("依据来源");
  });
});
