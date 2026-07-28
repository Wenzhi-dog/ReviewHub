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

  return `你是知识点复习助手。主题：「${params.title}」。
${currentBlock}${feedbackBlock}
每章包含简洁标题与一两句概要。用中文。

请以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
只返回 JSON，不要 Markdown 代码块或其他文字。`;
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

  return `你是知识点复习助手。
主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
概要：${params.chapterSummary || "无"}
${currentBlock}${feedbackBlock}
用中文输出题干。

请以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
只返回 JSON，不要 Markdown 代码块或其他文字。`;
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
