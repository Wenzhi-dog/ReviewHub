"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT =
  ".pdf,.pptx,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

const MAX_FILES = 8;
const MAX_BYTES = 12 * 1024 * 1024;

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CreateTopicForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.some((f) => f.name === file.name && f.size === file.size)) {
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`「${file.name}」超过 ${MAX_BYTES / 1024 / 1024}MB 上限`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`最多上传 ${MAX_FILES} 个文件`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

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

      const topicId = data.topic.id as string;

      if (files.length > 0) {
        const form = new FormData();
        for (const file of files) form.append("files", file);
        const up = await fetch(`/api/topics/${topicId}/materials`, {
          method: "POST",
          body: form,
        });
        const upData = await up.json();
        if (!up.ok) throw new Error(upData.error || "资料上传失败");
      }

      const search = enableWebSearch ? "1" : "0";
      router.push(`/create/${topicId}?search=${search}`);
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

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm tracking-wide text-[var(--ink-muted)]">
            参考资料（可选）
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            PDF / PPTX / DOCX / TXT · 单文件 ≤12MB
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={loading}
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
        />

        <button
          type="button"
          disabled={loading || files.length >= MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!loading) addFiles(e.dataTransfer.files);
          }}
          className="w-full border border-dashed border-[var(--ink)]/30 px-4 py-8 text-center text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-40"
        >
          点击或拖拽上传讲义、课件、笔记…
        </button>

        {files.length > 0 ? (
          <ul className="space-y-2">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-[var(--ink)]/10 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-[var(--ink)]">
                  {file.name}
                  <span className="ml-2 text-[var(--ink-muted)]">
                    {formatSize(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => removeFile(i)}
                  className="shrink-0 text-[var(--ink-muted)] transition hover:text-[var(--accent)] disabled:opacity-40"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-[var(--ink-muted)]">
          上传后会提取文字供拆章节与出题参考；扫描版 PDF / 纯图片幻灯片可能提取不到内容。旧版
          .ppt 请另存为 .pptx。
        </p>
      </div>

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
            ? files.length > 0
              ? "拆章节与出题时以上传资料为主，并联网补充检索。"
              : "拆章节与出题时会联网检索相关资料。"
            : files.length > 0
              ? "拆章节与出题时不联网，仅依据上传资料与模型知识。"
              : "拆章节与出题时不联网，仅使用模型知识。"}
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="rounded-sm bg-[var(--ink)] px-5 py-2.5 text-sm text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-40"
      >
        {loading
          ? files.length > 0
            ? "上传资料并创建…"
            : "创建中…"
          : "开始拆分章节"}
      </button>
    </form>
  );
}
