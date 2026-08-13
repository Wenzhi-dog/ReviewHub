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
    ? `\n用户修改意见：${params.feedback}\n请按意见调整模块划分，输出完整新列表。`
    : "\n请将主题拆成若干逻辑清晰、适合面试准备的模块（通常 4–10 个）。按面试官会问的方向划分，例如高频概念、对比选型、原理深挖、场景设计、踩坑排错；不要按教材目录罗列。";

  const materialsBlock = params.materialsBlock?.trim()
    ? `\n${params.materialsBlock.trim()}\n`
    : "";

  let workflow: string;
  if (hasMaterials && enableSearch) {
    workflow = `工作方式：
1. 优先阅读用户提供的参考资料，据此覆盖资料中面试常考的核心知识点。
2. 可联网搜索该方向的高频面试题大纲或常见追问，但不要与参考资料冲突或喧宾夺主。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (hasMaterials) {
    workflow = `工作方式：
1. 仔细阅读用户提供的参考资料，按面试模块（而非教材目录）划分章节。
2. 不要编造资料中未出现的冷门内容；可用常识理顺模块逻辑。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (enableSearch) {
    workflow = `工作方式：
1. 先联网搜索该方向的高频面试题、常见追问或面试大纲（可多角度检索）。
2. 基于检索结果按面试模块划分，避免凭空编造冷门错误知识点。
3. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else {
    workflow = `工作方式：
1. 基于你对该主题的知识按面试模块划分，结构清晰、覆盖高频考点。
2. 最终以 JSON 对象返回，格式示例：
{"chapters":[{"title":"章节标题","summary":"一两句概要"}]}
每章包含简洁标题与一两句概要。用中文。不要输出 Markdown 代码块或其他文字。`;
  }

  return `你是技术面试出题 Agent。主题：「${params.title}」。
${currentBlock}${materialsBlock}${feedbackBlock}

${workflow}`;
}

export function questionsPrompt(params: {
  topicTitle: string;
  chapterTitle: string;
  chapterSummary: string;
  current?: { stem: string }[];
  priorQuestions?: { chapterTitle: string; stem: string }[];
  otherChapters?: { title: string; summary: string }[];
  feedback?: string;
  enableSearch?: boolean;
  materialsBlock?: string;
}) {
  const enableSearch = params.enableSearch ?? true;
  const hasMaterials = Boolean(params.materialsBlock?.trim());
  const currentBlock =
    params.current && params.current.length > 0
      ? `\n当前小题列表（本章已有，仅供按意见调整时参考）：\n${params.current
          .map((q, i) => `${i + 1}. ${q.stem}`)
          .join("\n")}\n`
      : "";

  const otherChaptersBlock =
    params.otherChapters && params.otherChapters.length > 0
      ? `\n其它章节（请拉开考点，勿与其重复覆盖）：\n${params.otherChapters
          .map(
            (c, i) =>
              `${i + 1}. ${c.title}${c.summary ? ` — ${c.summary}` : ""}`,
          )
          .join("\n")}\n`
      : "";

  const priorBlock =
    params.priorQuestions && params.priorQuestions.length > 0
      ? `\n其它章节已出题目（跨章记忆，严禁重复或近义改写）：\n${params.priorQuestions
          .map((q, i) => `${i + 1}. [${q.chapterTitle}] ${q.stem}`)
          .join("\n")}\n`
      : "";

  const interviewRules = `出题原则（必须遵守）：
- 题干应像面试官会问的话：口语化，可展开 2–5 分钟口述。
- 优先：对比选型、原理讲清楚、场景设计、排错、复杂度/权衡、「结合项目怎么讲」。
- 避免：填空背诵、纯定义「什么是 X」、教材课后题口吻。
- 可在题干里留追问空间（例如「流量再大 10 倍怎么办」），但每条仍只输出一个 stem。`;

  const feedbackBlock = params.feedback
    ? `\n用户修改意见：${params.feedback}\n请按意见调整小题，输出完整新列表。`
    : "\n请为该模块生成若干面试题（通常 4–8 题），题干应像面试官会问的话。";

  const materialsBlock = params.materialsBlock?.trim()
    ? `\n${params.materialsBlock.trim()}\n`
    : "";

  const dedupeRules = `跨章去重（必须遵守）：
- 不要重复或近义改写「其它章节已出题目」中的题干。
- 不要考查其它章已覆盖的同一知识点或同一问法；本章聚焦本章概要与资料中的差异化考点。
- 本批题目之间也要彼此区分，避免同义反复。`;

  let workflow: string;
  if (hasMaterials && enableSearch) {
    workflow = `工作方式：
1. 优先依据用户参考资料中与本章相关的内容出面试题。
2. 可联网搜索该方向高频面试题或常见追问，但题干应能从资料或本章概要得到支撑。
3. ${interviewRules}
4. ${dedupeRules}
5. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (hasMaterials) {
    workflow = `工作方式：
1. 依据用户参考资料与章节概要思考面试出题角度，覆盖资料中的关键要点。
2. ${interviewRules}
3. 不要考查资料未涉及的冷门细节。
4. ${dedupeRules}
5. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else if (enableSearch) {
    workflow = `工作方式：
1. 先联网搜索该方向高频面试题、常见追问或面试官问法，不要搜课后习题。
2. 基于检索结果思考出题角度。
3. ${interviewRules}
4. ${dedupeRules}
5. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  } else {
    workflow = `工作方式：
1. 基于章节内容思考面试出题角度。
2. ${interviewRules}
3. ${dedupeRules}
4. 最终以 JSON 对象返回，格式示例：
{"questions":[{"stem":"题干内容"}]}
每题仅含题干 stem。用中文。不要输出 Markdown 代码块或其他文字。`;
  }

  return `你是技术面试出题 Agent。
主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
概要：${params.chapterSummary || "无"}
${otherChaptersBlock}${priorBlock}${currentBlock}${materialsBlock}${feedbackBlock}

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

  return `你是面试辅导助手。请针对下列面试题给出「怎么答」（Markdown），用中文。目标是口述答法，不是百科全文。

主题：「${params.topicTitle}」
章节：「${params.chapterTitle}」
小题：${params.stem}
${materialsBlock}
联网策略（自行判断，不要每题都搜）：
- 若已有参考资料且足以支撑作答，优先依据资料，不必联网。
- 需要联网的情况：涉及具体条文/标准编号、版本差异、易过时数据、冷门事实，或你对该题把握不足。
- 不必联网的情况：常见概念辨析、原理推导、方法步骤等你有把握的内容。
- 若联网，以检索结果校正事实，勿编造 URL。

要求：
1. 先给约 30 秒可说完的结论，再展开要点与权衡/边界；不要寒暄。
2. 正文中必须包含「可能的追问」小节，列出 2–4 个面试官可能接着问的点，并各给一句应对提示。
3. 正文结束后必须另起一节，标题为「依据来源」，列出 2–5 条依据（权威文档 URL、教材/书名、标准规范名、参考资料文件名等均可；不确定时写你认为可靠的常见出处，并注明「参考」）。
4. 「依据来源」用 Markdown 无序列表，有 URL 时写成链接；不要省略该小节。`;
}
