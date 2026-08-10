export type SearchHit = {
  title: string;
  url: string;
  content: string;
};

export type AgentSearchStep = {
  id: string;
  query: string;
  status: "running" | "done" | "error";
  results?: SearchHit[];
  errorText?: string;
};

export type AgentActivityState = {
  reasoning: string;
  searches: AgentSearchStep[];
  label?: string;
};

export type ConsumeAgentStreamOptions = {
  response: Response;
  resultKey: "chapters" | "questions";
  onActivity?: (activity: AgentActivityState) => void;
};

function emptyActivity(label?: string): AgentActivityState {
  return { reasoning: "", searches: [], label };
}

function cloneActivity(activity: AgentActivityState): AgentActivityState {
  return {
    reasoning: activity.reasoning,
    label: activity.label,
    searches: activity.searches.map((s) => ({
      ...s,
      results: s.results ? [...s.results] : undefined,
    })),
  };
}

function asSearchHits(output: unknown): SearchHit[] {
  if (!output || typeof output !== "object") return [];
  const results = (output as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title : "";
      const url = typeof row.url === "string" ? row.url : "";
      const content = typeof row.content === "string" ? row.content : "";
      if (!url) return null;
      return { title: title || url, url, content };
    })
    .filter((item): item is SearchHit => item !== null);
}

/**
 * Consume an AI SDK UI Message SSE stream from chapters/questions agents.
 * Streams reasoning + webSearch tool progress via onActivity; returns persisted rows.
 */
export async function consumeAgentStream<T>(
  options: ConsumeAgentStreamOptions,
): Promise<T> {
  const { response, resultKey, onActivity } = options;

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || `请求失败（${response.status}）`);
    }
    throw new Error(`请求失败（${response.status}）`);
  }

  if (!response.body) {
    throw new Error("响应无正文流");
  }

  const activity = emptyActivity();
  const emit = () => onActivity?.(cloneActivity(activity));

  let result: T | undefined;
  let streamError: string | undefined;
  const pendingQueries = new Map<string, string>();
  let buffer = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const handleChunk = (chunk: Record<string, unknown>) => {
    const type = chunk.type;
    if (typeof type !== "string") return;

    if (type === "reasoning-delta" && typeof chunk.delta === "string") {
      activity.reasoning += chunk.delta;
      emit();
      return;
    }

    if (type === "tool-input-start" && chunk.toolName === "webSearch") {
      const id = String(chunk.toolCallId ?? "");
      if (!id) return;
      pendingQueries.set(id, "");
      activity.searches.push({
        id,
        query: "搜索中…",
        status: "running",
      });
      emit();
      return;
    }

    if (type === "tool-input-delta" && typeof chunk.toolCallId === "string") {
      const id = chunk.toolCallId;
      if (!pendingQueries.has(id)) return;
      const delta =
        typeof chunk.inputTextDelta === "string" ? chunk.inputTextDelta : "";
      pendingQueries.set(id, (pendingQueries.get(id) ?? "") + delta);
      return;
    }

    if (type === "tool-input-available" && chunk.toolName === "webSearch") {
      const id = String(chunk.toolCallId ?? "");
      if (!id) return;
      const input = chunk.input as { query?: string } | undefined;
      const query =
        input?.query?.trim() ||
        extractQueryFromPartial(pendingQueries.get(id) ?? "") ||
        "搜索中…";
      pendingQueries.set(id, query);
      const existing = activity.searches.find((s) => s.id === id);
      if (existing) {
        existing.query = query;
        existing.status = "running";
      } else {
        activity.searches.push({ id, query, status: "running" });
      }
      emit();
      return;
    }

    if (type === "tool-output-available" && typeof chunk.toolCallId === "string") {
      const id = chunk.toolCallId;
      const step = activity.searches.find((s) => s.id === id);
      if (!step) return;
      step.status = "done";
      step.results = asSearchHits(chunk.output);
      emit();
      return;
    }

    if (type === "tool-output-error" && typeof chunk.toolCallId === "string") {
      const id = chunk.toolCallId;
      const step = activity.searches.find((s) => s.id === id);
      if (!step) return;
      step.status = "error";
      step.errorText =
        typeof chunk.errorText === "string" ? chunk.errorText : "搜索失败";
      emit();
      return;
    }

    if (type === `data-${resultKey}`) {
      result = chunk.data as T;
      return;
    }

    if (type === "data-error") {
      const data = chunk.data as { message?: string } | undefined;
      streamError = data?.message || "Agent 生成失败";
      return;
    }

    if (type === "error") {
      streamError =
        typeof chunk.errorText === "string" ? chunk.errorText : "流式出错";
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          handleChunk(JSON.parse(payload) as Record<string, unknown>);
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (result === undefined) throw new Error("未收到生成结果");
  return result;
}

function extractQueryFromPartial(partial: string): string | null {
  try {
    const parsed = JSON.parse(partial) as { query?: string };
    return parsed.query?.trim() || null;
  } catch {
    const match = partial.match(/"query"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!match?.[1]) return null;
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1];
    }
  }
}
