import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import { getOwnedTopic, listQuestions, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

async function assertChapterOwned(chapterId: string, ownerId: string) {
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  if (!chapter) return null;
  const topic = await getOwnedTopic(chapter.topicId, ownerId);
  if (!topic) return null;
  return { chapter, topic };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const ownerId = await requireOwnerId();
    const owned = await assertChapterOwned(chapterId, ownerId);
    if (!owned) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }
    const rows = await listQuestions(chapterId);
    return NextResponse.json({
      chapter: owned.chapter,
      topic: owned.topic,
      questions: rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const ownerId = await requireOwnerId();
    const owned = await assertChapterOwned(chapterId, ownerId);
    if (!owned) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const body = (await request.json()) as {
      questions?: { stem: string }[];
    };
    if (!Array.isArray(body.questions)) {
      return NextResponse.json({ error: "无效的小题列表" }, { status: 400 });
    }

    const db = getDb();
    await db.delete(questions).where(eq(questions.chapterId, chapterId));

    if (body.questions.length > 0) {
      await db.insert(questions).values(
        body.questions.map((q, i) => ({
          chapterId,
          stem: q.stem.trim(),
          sortOrder: i,
        })),
      );
    }

    await touchTopic(owned.topic.id);
    const rows = await listQuestions(chapterId);
    return NextResponse.json({ questions: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
