import type { SearchSource } from "@/lib/ai/search-source";
import { normalizeSearchSources } from "@/lib/ai/search-source";

export type AgentActivityState = {
  reasoning: string;
  label?: string;
  searching?: boolean;
  sources?: SearchSource[];
};

export type ConsumeAgentStreamOptions = {
  response: Response;
  resultKey: "chapters" | "questions";
  /** Whether this run requested web search (controls searching UI). */
  enableSearch?: boolean;
  onActivity?: (activity: AgentActivityState) => void;
};

function emptyActivity(
  label?: string,
  searching = false,
): AgentActivityState {
  return { reasoning: "", label, searching, sources: [] };
}

function cloneActivity(activity: AgentActivityState): AgentActivityState {
  return {
    reasoning: activity.reasoning,
    label: activity.label,
    searching: activity.searching,
    sources: activity.sources ? [...activity.sources] : [],
  };
}

/**
 * Consume an AI SDK UI Message SSE stream from chapters/questions agents.
 * Streams reasoning + search sources via onActivity; returns persisted rows.
 */
export async function consumeAgentStream<T>(
  options: ConsumeAgentStreamOptions,
): Promise<T> {
  const { response, resultKey, onActivity, enableSearch = false } = options;

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

  const activity = emptyActivity(undefined, enableSearch);
  const emit = () => onActivity?.(cloneActivity(activity));
  emit();

  let result: T | undefined;
  let streamError: string | undefined;
  let buffer = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const handleChunk = (chunk: Record<string, unknown>) => {
    const type = chunk.type;
    if (typeof type !== "string") return;

    if (type === "reasoning-delta" && typeof chunk.delta === "string") {
      activity.reasoning += chunk.delta;
      activity.searching = false;
      emit();
      return;
    }

    if (type === "text-delta" && typeof chunk.delta === "string") {
      activity.searching = false;
      emit();
      return;
    }

    if (type === "data-sources") {
      const sources = normalizeSearchSources(chunk.data);
      if (sources.length > 0) {
        activity.sources = sources;
        activity.searching = false;
        emit();
      }
      return;
    }

    if (type === `data-${resultKey}`) {
      result = chunk.data as T;
      activity.searching = false;
      emit();
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
