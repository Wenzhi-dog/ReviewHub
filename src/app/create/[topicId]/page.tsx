import { notFound, redirect } from "next/navigation";
import { TopicWizard } from "@/components/wizard/topic-wizard";
import { getOwnedTopic, listChapters } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function CreateWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ search?: string }>;
}) {
  const { topicId } = await params;
  const { search } = await searchParams;
  const ownerId = await requireOwnerId();
  const topic = await getOwnedTopic(topicId, ownerId);
  if (!topic) notFound();
  if (topic.status === "ready") redirect(`/t/${topic.id}`);

  const chapters = await listChapters(topic.id);
  const initialEnableWebSearch = search !== "0";

  return (
    <TopicWizard
      topic={topic}
      initialChapters={chapters}
      initialEnableWebSearch={initialEnableWebSearch}
    />
  );
}
