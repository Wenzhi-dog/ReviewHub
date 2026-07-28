"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { Question } from "@/lib/db/schema";

type Props = {
  topicId: string;
  chapterId: string;
  chapterTitle: string;
  topicTitle: string;
  question: Question;
};

export function AnswerView({
  topicId,
  chapterId,
  chapterTitle,
  topicTitle,
  question,
}: Props) {
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Link
          href={`/t/${topicId}/c/${chapterId}`}
          className="text-sm text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← 返回小题列表
        </Link>
        <p className="text-xs tracking-wide text-[var(--ink-muted)]">
          {topicTitle} · {chapterTitle}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl leading-snug text-[var(--ink)] md:text-3xl">
          {question.stem}
        </h1>
      </header>

      <div className="prose-review space-y-3 text-[15px] leading-7 text-[var(--ink)]">
        {question.answer ? (
          <ReactMarkdown>{question.answer}</ReactMarkdown>
        ) : (
          <p className="text-[var(--ink-muted)]">答案尚未生成。</p>
        )}
      </div>
    </article>
  );
}
