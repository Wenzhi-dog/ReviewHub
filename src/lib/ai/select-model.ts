import { generateText } from "ai";
import {
  apiModelForTier,
  type QwenApiModel,
  type QwenTier,
} from "@/lib/ai/models";
import { getModelRequest } from "@/lib/ai/provider";

export type ChooseGenerationModelParams = {
  kind: "chapters" | "questions";
  topicTitle: string;
  chapterTitle?: string;
  chapterSummary?: string;
};

/**
 * Autonomously pick flash (simple) vs plus (high) for chapter/question generation.
 * Uses a cheap non-search flash call; falls back to a title heuristic on failure.
 */
export async function chooseGenerationModel(
  params: ChooseGenerationModelParams,
): Promise<{ tier: QwenTier; apiModel: QwenApiModel }> {
  const fallback = heuristicTier(params);
  try {
    const { model } = getModelRequest(
      apiModelForTier("simple"),
      { enableSearch: false, enableThinking: false },
    );

    const chapterBlock =
      params.kind === "questions"
        ? `\n章节：「${params.chapterTitle ?? ""}」\n概要：${params.chapterSummary || "无"}`
        : "";

    const { text } = await generateText({
      model,
      prompt: `你是复习任务难度分流器。根据任务判断应使用简单模型还是高性能模型。
只输出一个词：simple 或 high（小写，不要其它文字）。

任务类型：${params.kind === "chapters" ? "拆分复习章节" : "生成章节小题"}
主题：「${params.topicTitle}」${chapterBlock}

规则：
- simple：入门科普、中小学基础、单一概念、常见通识
- high：大学/考研/考证、系统性强、交叉学科、工程实践、易混淆考点多
`,
    });

    const tier: QwenTier = /\bhigh\b/i.test(text.trim()) ? "high" : "simple";
    return { tier, apiModel: apiModelForTier(tier) };
  } catch {
    return { tier: fallback, apiModel: apiModelForTier(fallback) };
  }
}

/** Fallback when the classifier call fails; exported for unit tests. */
export function heuristicTier(params: ChooseGenerationModelParams): QwenTier {
  const haystack = [
    params.topicTitle,
    params.chapterTitle ?? "",
    params.chapterSummary ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const highHints = [
    "考研",
    "高考",
    "期末",
    "算法",
    "操作系统",
    "编译",
    "分布式",
    "机器学习",
    "深度学习",
    "微积分",
    "线性代数",
    "概率论",
    "数据库",
    "计算机网络",
    "组成原理",
    "法律",
    "注会",
    "医师",
    "论文",
    "架构",
    "并发",
    "底层",
  ];

  if (highHints.some((h) => haystack.includes(h))) return "high";
  if (haystack.length > 40) return "high";
  return "simple";
}
