import type { Topic } from "@/lib/db/schema";

export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "topic-1",
    ownerId: "test-owner",
    title: "测试主题",
    modelId: "qwen3.7-flash",
    status: "chapters",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function jsonRequest(
  url: string,
  body: unknown,
  init?: RequestInit,
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

export function sseResponse(events: Record<string, unknown>[]): Response {
  const payload = events
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
