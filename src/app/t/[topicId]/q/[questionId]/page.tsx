import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AnswerView } from "@/components/review/answer-view";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import { getOwnedTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function QuestionAnswerPage({
  params,
}: {
  params: Promise<{ topicId: string; questionId: string }>;
}) {
  const { topicId, questionId } = await params;
  const ownerId = await requireOwnerId();
  const topic = await getOwnedTopic(topicId, ownerId);
  if (!topic) notFound();
  if (topic.status !== "ready") redirect(`/create/${topic.id}`);

  const db = getDb();
  const [row] = await db
    .select({
      question: questions,
      chapter: chapters,
    })
    .from(questions)
    .innerJoin(chapters, eq(questions.chapterId, chapters.id))
    .where(eq(questions.id, questionId))
    .limit(1);

  if (
    !row ||
    row.chapter.topicId !== topic.id ||
    row.question.deletedAt != null
  ) {
    notFound();
  }

  return (
    <AnswerView
      topicId={topic.id}
      chapterId={row.chapter.id}
      chapterTitle={row.chapter.title}
      topicTitle={topic.title}
      question={row.question}
    />
  );
}
