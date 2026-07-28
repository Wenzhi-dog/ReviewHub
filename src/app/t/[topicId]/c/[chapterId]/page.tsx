import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { QuestionList } from "@/components/review/question-list";
import { getDb } from "@/lib/db";
import { chapters } from "@/lib/db/schema";
import { getOwnedTopic, listQuestions } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ topicId: string; chapterId: string }>;
}) {
  const { topicId, chapterId } = await params;
  const ownerId = await requireOwnerId();
  const topic = await getOwnedTopic(topicId, ownerId);
  if (!topic) notFound();
  if (topic.status !== "ready") redirect(`/create/${topic.id}`);

  const db = getDb();
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!chapter || chapter.topicId !== topic.id) notFound();

  const questions = await listQuestions(chapter.id, true);

  return (
    <QuestionList
      topicId={topic.id}
      chapterTitle={chapter.title}
      questions={questions}
    />
  );
}
