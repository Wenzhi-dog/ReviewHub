"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_MODEL_ID,
  getModelLabel,
  MODEL_OPTIONS,
  isValidModelId,
} from "@/lib/ai/models";
import type { Chapter, Question, Topic } from "@/lib/db/schema";

type Props = {
  topic: Topic;
  initialChapters: Chapter[];
};

type EditableChapter = { id?: string; title: string; summary: string };
type EditableQuestion = { id?: string; stem: string };

export function TopicWizard({ topic: initialTopic, initialChapters }: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  const [modelId, setModelId] = useState(
    isValidModelId(initialTopic.modelId)
      ? initialTopic.modelId
      : DEFAULT_MODEL_ID,
  );
  const [chapters, setChapters] = useState<EditableChapter[]>(
    initialChapters.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
    })),
  );
  const [questionsByChapter, setQuestionsByChapter] = useState<
    Record<string, EditableQuestion[]>
  >({});
  const [feedback, setFeedback] = useState("");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    initialChapters[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerProgress, setAnswerProgress] = useState({ done: 0, total: 0 });

  const step = topic.status;

  const loadChapterQuestions = useCallback(async (chapterId: string) => {
    const res = await fetch(`/api/chapters/${chapterId}/questions`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "加载小题失败");
    setQuestionsByChapter((prev) => ({
      ...prev,
      [chapterId]: (data.questions as Question[]).map((q) => ({
        id: q.id,
        stem: q.stem,
      })),
    }));
  }, []);

  useEffect(() => {
    if (step === "chapters" && chapters.length === 0 && !busy) {
      void generateChapters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === "questions" && chapters.length > 0) {
      const firstId = chapters[0]?.id;
      if (firstId) setActiveChapterId(firstId);
      void (async () => {
        for (const ch of chapters) {
          if (ch.id && !questionsByChapter[ch.id]) {
            try {
              await loadChapterQuestions(ch.id);
            } catch {
              /* ignore until generate */
            }
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function generateChapters(withFeedback?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: topic.id,
          feedback: withFeedback || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setChapters(
        (data.chapters as Chapter[]).map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.summary,
        })),
      );
      setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function changeModel(nextModelId: string) {
    if (!isValidModelId(nextModelId) || nextModelId === modelId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: nextModelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "切换模型失败");
      setTopic(data.topic as Topic);
      setModelId(nextModelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换模型失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveChapters() {
    const res = await fetch(`/api/topics/${topic.id}/chapters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapters }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存章节失败");
    const rows = data.chapters as Chapter[];
    setChapters(
      rows.map((c) => ({ id: c.id, title: c.title, summary: c.summary })),
    );
    return rows;
  }

  async function confirmChapters() {
    setBusy(true);
    setError(null);
    try {
      const rows = await saveChapters();
      const patch = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "questions" }),
      });
      const patchData = await patch.json();
      if (!patch.ok) throw new Error(patchData.error || "进入下一步失败");
      setTopic(patchData.topic);

      setBusy(true);
      for (const ch of rows) {
        const res = await fetch("/api/ai/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId: ch.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `生成「${ch.title}」小题失败`);
        setQuestionsByChapter((prev) => ({
          ...prev,
          [ch.id]: (data.questions as Question[]).map((q) => ({
            id: q.id,
            stem: q.stem,
          })),
        }));
      }
      setActiveChapterId(rows[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "失败");
    } finally {
      setBusy(false);
    }
  }

  async function generateQuestionsForActive(withFeedback?: string) {
    if (!activeChapterId) return;
    setBusy(true);
    setError(null);
    try {
      await saveActiveQuestions();
      const res = await fetch("/api/ai/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: activeChapterId,
          feedback: withFeedback || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setQuestionsByChapter((prev) => ({
        ...prev,
        [activeChapterId]: (data.questions as Question[]).map((q) => ({
          id: q.id,
          stem: q.stem,
        })),
      }));
      setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveActiveQuestions() {
    if (!activeChapterId) return;
    const list = questionsByChapter[activeChapterId] ?? [];
    const res = await fetch(`/api/chapters/${activeChapterId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: list }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存小题失败");
    setQuestionsByChapter((prev) => ({
      ...prev,
      [activeChapterId]: (data.questions as Question[]).map((q) => ({
        id: q.id,
        stem: q.stem,
      })),
    }));
  }

  async function confirmQuestions() {
    setBusy(true);
    setError(null);
    try {
      for (const ch of chapters) {
        if (!ch.id) continue;
        const list = questionsByChapter[ch.id] ?? [];
        const res = await fetch(`/api/chapters/${ch.id}/questions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: list }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "保存小题失败");
        setQuestionsByChapter((prev) => ({
          ...prev,
          [ch.id!]: (data.questions as Question[]).map((q) => ({
            id: q.id,
            stem: q.stem,
          })),
        }));
      }

      const patch = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "answers" }),
      });
      const patchData = await patch.json();
      if (!patch.ok) throw new Error(patchData.error || "进入答案生成失败");
      setTopic(patchData.topic);

      const freshIds: string[] = [];
      for (const ch of chapters) {
        if (!ch.id) continue;
        const res = await fetch(`/api/chapters/${ch.id}/questions`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载小题失败");
        for (const q of data.questions as Question[]) {
          freshIds.push(q.id);
        }
      }

      setAnswerProgress({ done: 0, total: freshIds.length });
      const ANSWER_CONCURRENCY = 5;
      let done = 0;
      let nextIndex = 0;

      async function generateOne(qid: string) {
        const res = await fetch("/api/ai/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: qid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "生成答案失败");
        done += 1;
        setAnswerProgress({ done, total: freshIds.length });
      }

      async function worker() {
        while (true) {
          const i = nextIndex;
          nextIndex += 1;
          if (i >= freshIds.length) return;
          await generateOne(freshIds[i]!);
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(ANSWER_CONCURRENCY, freshIds.length) },
          () => worker(),
        ),
      );

      const ready = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
      const readyData = await ready.json();
      if (!ready.ok) throw new Error(readyData.error || "完成失败");
      router.push(`/t/${topic.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失败");
    } finally {
      setBusy(false);
    }
  }

  const activeQuestions = useMemo(
    () => (activeChapterId ? questionsByChapter[activeChapterId] ?? [] : []),
    [activeChapterId, questionsByChapter],
  );

  const stepLabel =
    step === "chapters"
      ? "第一步 · 章节"
      : step === "questions"
        ? "第二步 · 小题"
        : step === "answers"
          ? "第三步 · 生成答案"
          : "已完成";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          {stepLabel}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] md:text-4xl">
          {topic.title}
        </h1>
        {step === "chapters" || step === "questions" ? (
          <div className="space-y-2">
            <p className="text-xs tracking-wide text-[var(--ink-muted)]">
              当前模型 · {getModelLabel(modelId)}
            </p>
            <div className="flex flex-wrap gap-2">
              {MODEL_OPTIONS.map((option) => {
                const active = modelId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void changeModel(option.id)}
                    className={`rounded-sm px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-[var(--ink)] text-[var(--paper)]"
                        : "bg-[var(--ink)]/8 text-[var(--ink)] hover:bg-[var(--ink)]/12"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">
            模型 · {getModelLabel(modelId)}
          </p>
        )}
      </header>

      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {step === "chapters" ? (
        <section className="space-y-4">
          <p className="text-sm text-[var(--ink-muted)]">
            可直接编辑章节，或输入意见后让模型重新拆分。
          </p>
          <ul className="space-y-4">
            {chapters.map((ch, index) => (
              <li key={ch.id ?? index} className="space-y-2 border-b border-[var(--ink)]/10 pb-4">
                <div className="flex gap-2">
                  <span className="mt-2 w-6 shrink-0 text-sm text-[var(--ink-muted)]">
                    {index + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <input
                      value={ch.title}
                      onChange={(e) => {
                        const next = [...chapters];
                        next[index] = { ...ch, title: e.target.value };
                        setChapters(next);
                      }}
                      className="w-full bg-transparent text-lg font-medium outline-none"
                      disabled={busy}
                    />
                    <textarea
                      value={ch.summary}
                      onChange={(e) => {
                        const next = [...chapters];
                        next[index] = { ...ch, summary: e.target.value };
                        setChapters(next);
                      }}
                      rows={2}
                      className="w-full resize-y bg-transparent text-sm text-[var(--ink-muted)] outline-none"
                      disabled={busy}
                    />
                  </div>
                  <button
                    type="button"
                    className="self-start text-xs text-[var(--ink-muted)] hover:text-red-700"
                    disabled={busy}
                    onClick={() =>
                      setChapters(chapters.filter((_, i) => i !== index))
                    }
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setChapters([...chapters, { title: "新章节", summary: "" }])
            }
            className="text-sm text-[var(--accent)]"
          >
            + 添加章节
          </button>

          <div className="space-y-3 pt-4">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="修改意见，例如：把并发相关拆成两章"
              rows={2}
              className="w-full rounded-sm border border-[var(--ink)]/15 bg-white/50 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              disabled={busy}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => generateChapters(feedback.trim() || undefined)}
                className="rounded-sm border border-[var(--ink)]/30 px-4 py-2 text-sm disabled:opacity-40"
              >
                {busy ? "生成中…" : feedback.trim() ? "按意见重新生成" : "重新生成"}
              </button>
              <button
                type="button"
                disabled={busy || chapters.length === 0}
                onClick={() => void confirmChapters()}
                className="rounded-sm bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-40"
              >
                确认并生成小题
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === "questions" ? (
        <section className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {chapters.map((ch) =>
              ch.id ? (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChapterId(ch.id!)}
                  className={`rounded-sm px-3 py-1.5 text-sm transition ${
                    activeChapterId === ch.id
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "bg-[var(--ink)]/8 text-[var(--ink)]"
                  }`}
                >
                  {ch.title}
                </button>
              ) : null,
            )}
          </div>

          <ul className="space-y-3">
            {activeQuestions.map((q, index) => (
              <li key={q.id ?? index} className="flex gap-2 border-b border-[var(--ink)]/10 pb-3">
                <span className="mt-2 w-6 text-sm text-[var(--ink-muted)]">
                  {index + 1}.
                </span>
                <textarea
                  value={q.stem}
                  rows={2}
                  disabled={busy}
                  onChange={(e) => {
                    if (!activeChapterId) return;
                    const list = [...activeQuestions];
                    list[index] = { ...q, stem: e.target.value };
                    setQuestionsByChapter((prev) => ({
                      ...prev,
                      [activeChapterId]: list,
                    }));
                  }}
                  className="flex-1 resize-y bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  className="self-start text-xs text-[var(--ink-muted)] hover:text-red-700"
                  onClick={() => {
                    if (!activeChapterId) return;
                    setQuestionsByChapter((prev) => ({
                      ...prev,
                      [activeChapterId]: activeQuestions.filter(
                        (_, i) => i !== index,
                      ),
                    }));
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={busy || !activeChapterId}
            onClick={() => {
              if (!activeChapterId) return;
              setQuestionsByChapter((prev) => ({
                ...prev,
                [activeChapterId]: [
                  ...(prev[activeChapterId] ?? []),
                  { stem: "新小题" },
                ],
              }));
            }}
            className="text-sm text-[var(--accent)]"
          >
            + 添加小题
          </button>

          <div className="space-y-3 pt-2">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="针对当前章节的修改意见"
              rows={2}
              className="w-full rounded-sm border border-[var(--ink)]/15 bg-white/50 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              disabled={busy}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !activeChapterId}
                onClick={() =>
                  void generateQuestionsForActive(
                    feedback.trim() || undefined,
                  )
                }
                className="rounded-sm border border-[var(--ink)]/30 px-4 py-2 text-sm disabled:opacity-40"
              >
                {busy ? "处理中…" : "重新生成当前章"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmQuestions()}
                className="rounded-sm bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-40"
              >
                确认并生成全部答案
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === "answers" ? (
        <section className="space-y-4">
          <p className="text-sm text-[var(--ink-muted)]">
            正在并行生成答案…
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--ink)]/10">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{
                width:
                  answerProgress.total === 0
                    ? "0%"
                    : `${(answerProgress.done / answerProgress.total) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm">
            {answerProgress.done} / {answerProgress.total}
          </p>
          {busy ? null : (
            <button
              type="button"
              onClick={() => void confirmQuestions()}
              className="rounded-sm bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)]"
            >
              重试生成答案
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
