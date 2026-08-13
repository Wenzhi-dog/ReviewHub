import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createAgentStreamResponse } from "@/lib/ai/agent-stream";
import {
  dedupeQuestionStems,
  truncatePriorQuestions,
} from "@/lib/ai/dedupe-stems";
import { questionsPrompt } from "@/lib/ai/prompts";
import { questionsSchema } from "@/lib/ai/schemas";
import { chooseGenerationModel } from "@/lib/ai/select-model";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import {
  getOwnedTopic,
  listActiveQuestionsForTopic,
  listChapters,
  listMaterials,
  listQuestions,
  touchTopic,
} from "@/lib/db/queries";
import { formatMaterialsForPrompt } from "@/lib/materials/extract";
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
    const allChapters = await listChapters(topic.id);
    const otherChapters = allChapters
      .filter((c) => c.id !== chapter.id)
      .map((c) => ({ title: c.title, summary: c.summary }));

    const topicQuestions = await listActiveQuestionsForTopic(topic.id);
    const priorQuestions = truncatePriorQuestions(
      topicQuestions
        .filter((q) => q.chapterId !== chapter.id)
        .map((q) => ({
          chapterTitle: q.chapter.title,
          stem: q.stem,
        })),
    );
    const priorStems = priorQuestions.map((q) => q.stem);

    const materialRows = await listMaterials(topic.id);
    const materialsBlock = formatMaterialsForPrompt(
      materialRows.map((m) => ({
        filename: m.filename,
        extractedText: m.extractedText,
      })),
      {
        query: `${topic.title}\n${chapter.title}\n${chapter.summary}`,
        maxTotalChars: 60_000,
      },
    );
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
        priorQuestions:
          priorQuestions.length > 0 ? priorQuestions : undefined,
        otherChapters:
          otherChapters.length > 0 ? otherChapters : undefined,
        feedback: body.feedback?.trim() || undefined,
        enableSearch,
        materialsBlock: materialsBlock || undefined,
      }),
      persist: async (output) => {
        const toInsert = dedupeQuestionStems(output.questions, priorStems);

        await db.delete(questions).where(eq(questions.chapterId, chapter.id));
        if (toInsert.length > 0) {
          await db.insert(questions).values(
            toInsert.map((q, i) => ({
              chapterId: chapter.id,
              stem: q.stem.trim(),
              sortOrder: i,
            })),
          );
        }
        await touchTopic(topic.id);
        return listQuestions(chapter.id);
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成小题失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
