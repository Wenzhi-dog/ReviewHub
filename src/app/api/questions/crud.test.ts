import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTopic } from "@/test/helpers";

vi.mock("@/lib/owner", () => ({
  requireOwnerId: vi.fn(async () => "test-owner"),
}));

vi.mock("@/lib/db/queries", () => ({
  getOwnedTopic: vi.fn(),
  listQuestions: vi.fn(),
  touchTopic: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import { getOwnedTopic, listQuestions } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import {
  GET as getChapterQuestions,
  PUT as putChapterQuestions,
} from "@/app/api/chapters/[chapterId]/questions/route";
import {
  GET as getQuestion,
  DELETE as deleteQuestion,
} from "@/app/api/questions/[questionId]/route";

const chapterParams = (chapterId: string) => ({
  params: Promise.resolve({ chapterId }),
});
const questionParams = (questionId: string) => ({
  params: Promise.resolve({ questionId }),
});

describe("chapter/question API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET chapter questions 404 when chapter missing", async () => {
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    } as never);

    const res = await getChapterQuestions(
      new Request("http://localhost/api/chapters/c1/questions"),
      chapterParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("PUT chapter questions rejects invalid body", async () => {
    const topic = makeTopic();
    const chapter = {
      id: "c1",
      topicId: topic.id,
      title: "章",
      summary: "",
      sortOrder: 0,
      createdAt: topic.createdAt,
    };
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [chapter]),
          })),
        })),
      })),
    } as never);
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(topic);

    const res = await putChapterQuestions(
      new Request("http://localhost/api/chapters/c1/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: "nope" }),
      }),
      chapterParams("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("GET chapter questions success", async () => {
    const topic = makeTopic();
    const chapter = {
      id: "c1",
      topicId: topic.id,
      title: "章",
      summary: "",
      sortOrder: 0,
      createdAt: topic.createdAt,
    };
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [chapter]),
          })),
        })),
      })),
    } as never);
    vi.mocked(getOwnedTopic).mockResolvedValueOnce(topic);
    vi.mocked(listQuestions).mockResolvedValueOnce([]);

    const res = await getChapterQuestions(
      new Request("http://localhost/api/chapters/c1/questions"),
      chapterParams("c1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ questions: [] });
  });

  it("GET question 404 when missing", async () => {
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      })),
    } as never);

    const res = await getQuestion(
      new Request("http://localhost/api/questions/q1"),
      questionParams("q1"),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE question 404 when missing", async () => {
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      })),
    } as never);

    const res = await deleteQuestion(
      new Request("http://localhost/api/questions/q1", { method: "DELETE" }),
      questionParams("q1"),
    );
    expect(res.status).toBe(404);
  });
});
