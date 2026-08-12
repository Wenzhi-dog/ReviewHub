"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateTopicForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");
      const search = enableWebSearch ? "1" : "0";
      router.push(`/create/${data.topic.id}?search=${search}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-6">
      <label className="block space-y-2">
        <span className="text-sm tracking-wide text-[var(--ink-muted)]">
          复习主题
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：操作系统进程调度"
          className="w-full border-b border-[var(--ink)]/25 bg-transparent px-0 py-3 text-xl outline-none transition focus:border-[var(--accent)]"
          required
          disabled={loading}
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm tracking-wide text-[var(--ink-muted)]">
          生成选项
        </p>
        <button
          type="button"
          disabled={loading}
          aria-pressed={enableWebSearch}
          onClick={() => setEnableWebSearch((v) => !v)}
          className={`rounded-sm border px-3 py-1.5 text-sm transition disabled:opacity-40 ${
            enableWebSearch
              ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
              : "border-[var(--ink)]/30 text-[var(--ink-muted)] hover:border-[var(--ink)]/50"
          }`}
        >
          联网搜索 · {enableWebSearch ? "开" : "关"}
        </button>
        <p className="text-xs text-[var(--ink-muted)]">
          {enableWebSearch
            ? "拆章节与出题时会联网检索相关资料。"
            : "拆章节与出题时不联网，仅使用模型知识。"}
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="rounded-sm bg-[var(--ink)] px-5 py-2.5 text-sm text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-40"
      >
        {loading ? "创建中…" : "开始拆分章节"}
      </button>
    </form>
  );
}
