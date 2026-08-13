import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnedTopic, listChapters } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const ownerId = await requireOwnerId();
  const topic = await getOwnedTopic(topicId, ownerId);
  if (!topic) notFound();
  if (topic.status !== "ready") redirect(`/create/${topic.id}`);

  const chapters = await listChapters(topic.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Link href="/" className="text-sm text-[var(--ink-muted)] hover:text-[var(--accent)]">
          ← 面试首页
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">
          {topic.title}
        </h1>
        <p className="text-sm text-[var(--ink-muted)]">选择模块开始准备</p>
      </header>
      <ul className="space-y-3">
        {chapters.map((ch, i) => (
          <li key={ch.id} className="border-b border-[var(--ink)]/10 pb-3">
            <Link
              href={`/t/${topic.id}/c/${ch.id}`}
              className="block space-y-1 hover:text-[var(--accent)]"
            >
              <div className="flex gap-3 text-lg">
                <span className="text-[var(--ink-muted)]">{i + 1}.</span>
                <span>{ch.title}</span>
              </div>
              {ch.summary ? (
                <p className="pl-8 text-sm text-[var(--ink-muted)]">{ch.summary}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
