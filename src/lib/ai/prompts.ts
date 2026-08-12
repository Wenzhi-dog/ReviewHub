export function chaptersPrompt(params: {
  title: string;
  current?: { title: string; summary: string }[];
  feedback?: string;
  enableSearch?: boolean;
  materialsBlock?: string;
}) {
  const enableSearch = params.enableSearch ?? true;
  const hasMaterials = Boolean(params.materialsBlock?.trim());
  const currentBlock =
    params.current && params.current.length > 0
      ? `\n当前章节列表：\n${params.current
          .map((c, i) => `${i + 1}. ${c.title}${c.summary ? ` — ${c.summary}` : ""}`)
          .join("\n")}\n`
      : "";

  const feedbackBlock = params.feedback
    ? `\n用户修改意见：${params.feedback}\n请按意见调整章节划分，输出完整新列表。`
    : "\n请将主题拆成若干逻辑清晰、适合复习的章节（通常 4–10 章）。";

  const materialsBlock = params.materialsBlock?.trim()
    ? `\n${params.materialsBlock.trim()}\n`
    : "";

  let workflow: string;
  if (hasMaterials && enableSearch) {
    workflow = `工作方式：
1. 优先阅读用户上传的参考资料，据此覆盖资料中的核心知识点。
2. 可联网搜索补充权威文档或常见大纲，但不要与上传资料冲突或喧宾夺主。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (hasMaterials) {
    workflow = `工作方式：
1. 仔细阅读用户上传的参考资料，按资料结构与知识点划分复习章节。
2. 不要编造资料中未出现的冷门内容；可用常识理顺章节逻辑。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (enableSearch) {
    workflow = `工作方式：
1. 先联网搜索该主题的权威文档、教程、大纲或资料（可多角度检索）。
2. 基于检索结果思考如何划分复习章节，避免凭空编造冷门错误知识点。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else {
    workflow = `工作方式：
1. 基于你对该主题的知识思考如何划分复习章节，结构清晰、覆盖核心知识点。
2. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  }

  return `你是知识点复习 Agent。主题：「${params.title}」。
${currentBlock}${materialsBlock}${feedbackBlock}

${workflow}`;
}

export function questionsPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  chapterSummary: string;
  current?: { stem: string }[];
  feedback?: string;
  enableSearch?: boolean;
  materialsBlock?: string;
}) {
  const enableSearch = params.enableSearch ?? true;
  const hasMaterials = Boolean(params.materialsBlock?.trim());
  const currentBlock =
    params.current && params.current.length > 0
      ? `\n当前小题列表：\n${params.current
          .map((q, i) => `${i + 1}. ${q.stem}`)
          .join("\n")}\n`
      : "";

  const feedbackBlock = params.feedback
    ? `\n用户修改意见：${params.feedback}\n请按意见调整小题，输出完整新列表。`
    : "\n请为该章节生成若干复习小题（通常 4–8 题），题干清晰、适合自测。";

  const materialsBlock = params.materialsBlock?.trim()
    ? `\n${params.materialsBlock.trim()}\n`
    : "";

  let workflow: string;
  if (hasMaterials && enableSearch) {
    workflow = `工作方式：
1. 优先依据用户上传资料中与本章相关的内容出题。
2. 可联网搜索补充常见考点，但题干应能从资料或本章概要得到支撑。
3. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (hasMaterials) {
    workflow = `工作方式：
1. 依据用户上传资料与章节概要思考出题角度，覆盖资料中的关键要点。
2. 题干应可检验理解而非死记硬背；不要考查资料未涉及的冷门细节。
3. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (enableSearch) {
    workflow = `工作方式：
1. 先联网搜索与本章相关的资料、常见考点或例题线索。
2. 基于检索结果思考出题角度，题干应可检验理解而非死记硬背。
3. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else {
    workflow = `工作方式：
1. 基于章节内容思考出题角度，题干应可检验理解而非死记硬背。
2. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  }

  return `你是知识点复习 Agent。
主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
概要：${params.chapterSummary || "无"}
${currentBlock}${materialsBlock}${feedbackBlock}

${workflow}`;
}

export function answerPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  stem: string;
  materialsBlock?: string;
}) {
  const materialsBlock = params.materialsBlock?.trim()
    ? `\n${params.materialsBlock.trim()}\n`
    : "";

  return `你是知识点复习助手。请针对下列小题给出准确、结构化的参考答案（Markdown），用中文。

主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
小题：${params.stem}
${materialsBlock}
联网策略（自行判断，不要每题都搜）：
- 若已有上传资料且足以支撑作答，优先依据资料，不必联网。
- 需要联网的情况：涉及具体条文/标准编号、版本差异、易过时数据、冷门事实，或你对该题把握不足。
- 不必联网的情况：常见概念辨析、原理推导、方法步骤等你有把握的内容。
- 若联网，以检索结果校正事实，勿编造 URL。

要求：
1. 先给结论/要点，再适当展开；必要时分点列出；不要寒暄。
2. 正文结束后必须另起一节，标题为「依据来源」，列出 2–5 条依据（权威文档 URL、教材/书名、标准规范名、上传资料文件名等均可；不确定时写你认为可靠的常见出处，并注明「参考」）。
3. 「依据来源」用 Markdown 无序列表，有 URL 时写成链接；不要省略该小节。`;
}
