import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, makeTopic } from "@/test/helpers";

vi.mock("@/lib/owner", () => ({
  requireOwnerId: vi.fn(async () => "test-owner"),
}));

vi.mock("@/lib/db/queries", () => ({
  getOwnedTopic: vi.fn(),
  listChapters: vi.fn(),
  listMaterials: vi.fn(),
  listQuestions: vi.fn(),
  listActiveQuestionsForTopic: vi.fn(),
  touchTopic: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/ai/select-model", () => ({
  chooseGenerationModel: vi.fn(async () => ({
    tier: "simple",
    apiModel: "qwen3.7-flash",
  })),
}));

vi.mock("@/lib/ai/agent-stream", () => ({
  createAgentStreamResponse: vi.fn(() => new Response("stream-ok")),
}));

vi.mock("@/lib/ai/dashscope-stream", () => ({
  generateDashScopeText: vi.fn(),
}));

vi.mock("@/lib/materials/extract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/materials/extract")>();
  return {
    ...actual,
    formatMaterialsForPrompt: vi.fn(() => ""),
  };
});

import { getOwnedTopic } from "@/lib/db/queries";
import { POST as postChapters } from "@/app/api/ai/chapters/route";
import { POST as postQuestions } from "@/app/api/ai/questions/route";
import { POST as postAnswer } from "@/app/api/ai/answer/route";

describe("AI API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chapters: requires topicId", async () => {
    const res = await postChapters(jsonRequest("http://localhost/api/ai/chapters", {}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "缺少 topicId" });
  });

  it("chapters: 404 when topic missing", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(null);
    const res = await postChapters(
      jsonRequest("http://localhost/api/ai/chapters", { topicId: "t1" }),
    );
    expect(res.status).toBe(404);
  });

  it("chapters: rejects wrong status", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(
      makeTopic({ status: "questions" }),
    );
    const res = await postChapters(
      jsonRequest("http://localhost/api/ai/chapters", { topicId: "t1" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "当前主题不在章节编辑阶段",
    });
  });

  it("questions: requires chapterId", async () => {
    const res = await postQuestions(
      jsonRequest("http://localhost/api/ai/questions", {}),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "缺少 chapterId" });
  });

  it("answer: requires questionId", async () => {
    const res = await postAnswer(
      jsonRequest("http://localhost/api/ai/answer", {}),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "缺少 questionId" });
  });
});
