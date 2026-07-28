import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { chapters, questions, topics, type Topic } from "@/lib/db/schema";

export async function getOwnedTopic(
  topicId: string,
  ownerId: string,
): Promise<Topic | null> {
  const db = getDb();
  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.ownerId, ownerId)))
    .limit(1);
  return topic ?? null;
}

export async function listReadyTopics(ownerId: string) {
  const db = getDb();
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.ownerId, ownerId), eq(topics.status, "ready")))
    .orderBy(asc(topics.createdAt));
}

export async function listChapters(topicId: string) {
  const db = getDb();
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.topicId, topicId))
    .orderBy(asc(chapters.sortOrder));
}

export async function listQuestions(chapterId: string, includeDeleted = false) {
  const db = getDb();
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.chapterId, chapterId))
    .orderBy(asc(questions.sortOrder));
  if (includeDeleted) return rows;
  return rows.filter((q) => q.deletedAt == null);
}

export async function listActiveQuestionsForTopic(topicId: string) {
  const db = getDb();
  const chapterRows = await listChapters(topicId);
  const all = [];
  for (const ch of chapterRows) {
    const qs = await db
      .select()
      .from(questions)
      .where(and(eq(questions.chapterId, ch.id), isNull(questions.deletedAt)))
      .orderBy(asc(questions.sortOrder));
    all.push(...qs.map((q) => ({ ...q, chapter: ch })));
  }
  return all;
}

export async function touchTopic(topicId: string) {
  const db = getDb();
  await db
    .update(topics)
    .set({ updatedAt: new Date() })
    .where(eq(topics.id, topicId));
}
