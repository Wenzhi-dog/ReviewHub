export function chaptersPrompt(params: {
  title: string;
  current?: { title: string; summary: string }[];
  feedback?: string;
}) {
  const currentBlock =
    params.current && params.current.length > 0
      ? `\n当前章节列表：\n${params.current
          .map((c, i) => `${i + 1}. ${c.title}${c.summary ? ` — ${c.summary}` : ""}`)
          .join("\n")}\n`
      : "";

  const feedbackBlock = params.feedback
    ? `\n用户修改意见：${params.feedback}\n请按意见调整章节划分，输出完整新列表。`
    : "\n请将主题拆成若干逻辑清晰、适合复习的章节（通常 4–10 章）。";

  return `你是知识点复习 Agent。主题：「${params.title}」。
${currentBlock}${feedbackBlock}

工作方式：
1. 先联网搜索该主题的权威文档、教程、大纲或资料（可多角度检索）。
2. 基于检索结果思考如何划分复习章节，避免凭空编造冷门错误知识点。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
}

export function questionsPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  chapterSummary: string;
  current?: { stem: string }[];
  feedback?: string;
}) {
  const currentBlock =
    params.current && params.current.length > 0
      ? `\n当前小题列表：\n${params.current
          .map((q, i) => `${i + 1}. ${q.stem}`)
          .join("\n")}\n`
      : "";

  const feedbackBlock = params.feedback
    ? `\n用户修改意见：${params.feedback}\n请按意见调整小题，输出完整新列表。`
    : "\n请为该章节生成若干复习小题（通常 4–8 题），题干清晰、适合自测。";

  return `你是知识点复习 Agent。
主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
概要：${params.chapterSummary || "无"}
${currentBlock}${feedbackBlock}

工作方式：
1. 先联网搜索与本章相关的资料、常见考点或例题线索。
2. 基于检索结果思考出题角度，题干应可检验理解而非死记硬背。
3. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
}

export function answerPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  stem: string;
}) {
  return `你是知识点复习助手。请针对下列小题给出准确、结构化的参考答案（Markdown），用中文。

主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
小题：${params.stem}

要求：先给结论/要点，再适当展开；必要时分点列出；不要寒暄。`;
}
