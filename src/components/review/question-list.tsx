"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/lib/db/schema";

type Filter = "all" | "unchecked" | "favorited";

type Props = {
  topicId: string;
  chapterTitle: string;
  questions: Question[];
};

export function QuestionList({
  topicId,
  chapterTitle,
  questions: initial,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return items.filter((q) => {
      if (q.deletedAt) return false;
      if (filter === "unchecked") return !q.checked;
      if (filter === "favorited") return q.favorited;
      return true;
    });
  }, [items, filter]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失败");
      setItems((prev) =>
        prev.map((q) => (q.id === id ? (data.question as Question) : q)),
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      setItems((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, deletedAt: new Date() } : q,
        ),
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Link
          href={`/t/${topicId}`}
          className="text-sm text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← 返回章节
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] md:text-4xl">
          {chapterTitle}
        </h1>
        <div className="flex gap-2 text-sm">
          {(
            [
              ["all", "全部"],
              ["unchecked", "未完成"],
              ["favorited", "已收藏"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-sm px-3 py-1 ${
                filter === key
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--ink)]/8"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <ul className="space-y-3">
        {visible.length === 0 ? (
          <li className="text-sm text-[var(--ink-muted)]">暂无小题</li>
        ) : (
          visible.map((q, i) => (
            <li
              key={q.id}
              className={`flex items-start gap-3 border-b border-[var(--ink)]/10 py-3 transition ${
                q.checked ? "opacity-40" : ""
              }`}
            >
              <button
                type="button"
                title="打勾"
                disabled={busyId === q.id}
                onClick={() => void patch(q.id, { checked: !q.checked })}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                  q.checked
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--ink)]/30"
                }`}
              >
                {q.checked ? "✓" : ""}
              </button>
              <Link
                href={`/t/${topicId}/q/${q.id}`}
                className="min-w-0 flex-1 text-[15px] leading-relaxed hover:text-[var(--accent)]"
              >
                <span className="mr-2 text-[var(--ink-muted)]">{i + 1}.</span>
                {q.stem}
              </Link>
              <div className="flex shrink-0 gap-2 text-xs">
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => void patch(q.id, { favorited: !q.favorited })}
                  className={
                    q.favorited ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"
                  }
                >
                  {q.favorited ? "已收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => void remove(q.id)}
                  className="text-[var(--ink-muted)] hover:text-red-700"
                >
                  删除
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
