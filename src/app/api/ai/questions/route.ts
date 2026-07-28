import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { questionsPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/provider";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import {
  getOwnedTopic,
  listQuestions,
  touchTopic,
} from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        stem: z.string(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as {
      chapterId?: string;
      feedback?: string;
    };
    if (!body.chapterId) {
      return NextResponse.json({ error: "缺少 chapterId" }, { status: 400 });
    }

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
    const { output } = await generateText({
      model: getLanguageModel(topic.modelId),
      output: Output.object({ schema: questionsSchema }),
      prompt: questionsPrompt({
        topicTitle: topic.title,
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        current: existing
          .filter((q) => !q.deletedAt)
          .map((q) => ({ stem: q.stem })),
        feedback: body.feedback?.trim() || undefined,
      }),
    });

    if (!output) {
      return NextResponse.json({ error: "模型未返回有效小题" }, { status: 502 });
    }

    await db.delete(questions).where(eq(questions.chapterId, chapter.id));
    await db.insert(questions).values(
      output.questions.map((q, i) => ({
        chapterId: chapter.id,
        stem: q.stem.trim(),
        sortOrder: i,
      })),
    );
    await touchTopic(topic.id);

    const rows = await listQuestions(chapter.id);
    return NextResponse.json({ questions: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成小题失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
