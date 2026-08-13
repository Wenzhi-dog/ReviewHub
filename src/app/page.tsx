import Link from "next/link";
import { listChapters, listReadyTopics } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let topics: Awaited<ReturnType<typeof listReadyTopics>> = [];
  let error: string | null = null;

  try {
    const ownerId = await requireOwnerId();
    topics = await listReadyTopics(ownerId);
  } catch (e) {
    error = e instanceof Error ? e.message : "无法加载面试内容";
  }

  const withChapters = await Promise.all(
    topics.map(async (t) => ({
      topic: t,
      chapters: await listChapters(t.id).catch(() => []),
    })),
  );

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)] md:text-5xl">
          面试
        </h1>
        <p className="max-w-lg text-[var(--ink-muted)]">
          选择主题进入模块，逐题演练。掌握后可打勾淡化，重要题可收藏。
        </p>
      </header>

      {error ? (
        <div className="rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{error}</p>
          <p className="mt-2 text-amber-800/80">
            请配置 <code className="text-xs">DATABASE_URL</code>（见{" "}
            <code className="text-xs">.env.example</code>
            ），并执行 <code className="text-xs">npm run db:push</code>。
          </p>
        </div>
      ) : null}

      {!error && withChapters.length === 0 ? (
        <div className="space-y-4 border-t border-[var(--ink)]/10 pt-8">
          <p className="text-[var(--ink-muted)]">还没有可准备的面试主题。</p>
          <Link
            href="/create"
            className="inline-block rounded-sm bg-[var(--ink)] px-5 py-2.5 text-sm text-[var(--paper)]"
          >
            新建第一个主题
          </Link>
        </div>
      ) : null}

      <div className="space-y-10">
        {withChapters.map(({ topic, chapters }) => (
          <section key={topic.id} className="space-y-4 border-t border-[var(--ink)]/10 pt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                <Link href={`/t/${topic.id}`} className="hover:text-[var(--accent)]">
                  {topic.title}
                </Link>
              </h2>
              <span className="text-xs text-[var(--ink-muted)]">
                {chapters.length} 章
              </span>
            </div>
            <ul className="space-y-2">
              {chapters.map((ch, i) => (
                <li key={ch.id}>
                  <Link
                    href={`/t/${topic.id}/c/${ch.id}`}
                    className="group flex items-baseline gap-3 py-1.5 text-[15px]"
                  >
                    <span className="w-6 text-sm text-[var(--ink-muted)]">
                      {i + 1}
                    </span>
                    <span className="group-hover:text-[var(--accent)]">
                      {ch.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
