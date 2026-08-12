import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createAgentStreamResponse } from "@/lib/ai/agent-stream";
import { questionsPrompt } from "@/lib/ai/prompts";
import { questionsSchema } from "@/lib/ai/schemas";
import { chooseGenerationModel } from "@/lib/ai/select-model";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import {
  getOwnedTopic,
  listQuestions,
  touchTopic,
} from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as {
      chapterId?: string;
      feedback?: string;
      enableSearch?: boolean;
    };
    if (!body.chapterId) {
      return NextResponse.json({ error: "缺少 chapterId" }, { status: 400 });
    }

    const enableSearch = body.enableSearch !== false;

    const db = getDb();
    const [chapter] = await db
      .select()
      .from(chapters)
      .where(eq(chapters.id, body.chapterId))
      .limit(1);
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const topic = await getOwnedTopic(chapter.topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }
    if (topic.status !== "questions") {
      return NextResponse.json(
        { error: "当前主题不在小题编辑阶段" },
        { status: 400 },
      );
    }

    const existing = await listQuestions(chapter.id, true);
    const { apiModel } = await chooseGenerationModel({
      kind: "questions",
      topicTitle: topic.title,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
    });

    return createAgentStreamResponse({
      apiModel,
      schema: questionsSchema,
      resultKey: "questions",
      enableSearch,
      prompt: questionsPrompt({
        topicTitle: topic.title,
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        current: existing
          .filter((q) => !q.deletedAt)
          .map((q) => ({ stem: q.stem })),
        feedback: body.feedback?.trim() || undefined,
        enableSearch,
      }),
      persist: async (output) => {
        await db.delete(questions).where(eq(questions.chapterId, chapter.id));
        await db.insert(questions).values(
          output.questions.map((q, i) => ({
            chapterId: chapter.id,
            stem: q.stem.trim(),
            sortOrder: i,
          })),
        );
        await touchTopic(topic.id);
        return listQuestions(chapter.id);
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成小题失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
