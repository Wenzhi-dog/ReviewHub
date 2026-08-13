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
  touchTopic: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import { getOwnedTopic, listChapters, listMaterials } from "@/lib/db/queries";
import { GET as getTopic, PATCH as patchTopic } from "@/app/api/topics/[topicId]/route";
import { GET as getChapters, PUT as putChapters } from "@/app/api/topics/[topicId]/chapters/route";
import { GET as getMaterials, POST as postMaterials } from "@/app/api/topics/[topicId]/materials/route";
import { POST as createTopic } from "@/app/api/topics/route";
import { getDb } from "@/lib/db";

const params = (topicId: string) => ({
  params: Promise.resolve({ topicId }),
});

describe("topics CRUD validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /topics rejects empty title", async () => {
    const res = await createTopic(jsonRequest("http://localhost/api/topics", { title: "  " }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "请输入主题" });
  });

  it("POST /topics creates topic", async () => {
    const topic = makeTopic();
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [topic]),
        })),
      })),
    } as never);

    const res = await createTopic(
      jsonRequest("http://localhost/api/topics", { title: "新主题" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topic: { id: topic.id, title: topic.title, status: topic.status },
    });
  });

  it("GET topic 404", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(null);
    const res = await getTopic(
      new Request("http://localhost/api/topics/t1"),
      params("t1"),
    );
    expect(res.status).toBe(404);
  });

  it("GET topic success", async () => {
    const topic = makeTopic();
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(topic);
    const res = await getTopic(
      new Request("http://localhost/api/topics/t1"),
      params("t1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topic: { id: topic.id, title: topic.title },
    });
  });

  it("PATCH topic 404", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(null);
    const res = await patchTopic(
      jsonRequest("http://localhost/api/topics/t1", { status: "ready" }, { method: "PATCH" }),
      params("t1"),
    );
    expect(res.status).toBe(404);
  });

  it("GET chapters 404", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(null);
    const res = await getChapters(
      new Request("http://localhost/api/topics/t1/chapters"),
      params("t1"),
    );
    expect(res.status).toBe(404);
  });

  it("PUT chapters rejects non-array", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(makeTopic());
    const res = await putChapters(
      jsonRequest("http://localhost/api/topics/t1/chapters", { chapters: "bad" }, { method: "PUT" }),
      params("t1"),
    );
    expect(res.status).toBe(400);
  });

  it("GET chapters success", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(makeTopic());
    vi.mocked(listChapters).mockResolvedValueOnce([]);
    const res = await getChapters(
      new Request("http://localhost/api/topics/t1/chapters"),
      params("t1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ chapters: [] });
  });

  it("GET materials 404", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(null);
    const res = await getMaterials(
      new Request("http://localhost/api/topics/t1/materials"),
      params("t1"),
    );
    expect(res.status).toBe(404);
  });

  it("POST materials requires files or urls", async () => {
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(makeTopic());
    vi.mocked(listMaterials).mockResolvedValueOnce([]);
    const res = await postMaterials(
      jsonRequest("http://localhost/api/topics/t1/materials", { urls: [] }),
      params("t1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "请选择要上传的文件或粘贴链接",
    });
  });
});
