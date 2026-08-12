"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  consumeAgentStream,
  type AgentActivityState,
} from "@/lib/ai/consume-agent-stream";
import type { Chapter, Question, Topic } from "@/lib/db/schema";
import { AgentActivity } from "@/components/wizard/agent-activity";

type MaterialSummary = {
  id: string;
  filename: string;
  charCount: number;
};

type Props = {
  topic: Topic;
  initialChapters: Chapter[];
  /** Seeded from create form (?search=0|1); defaults to true. */
  initialEnableWebSearch?: boolean;
  initialMaterials?: MaterialSummary[];
};

type EditableChapter = { id?: string; title: string; summary: string };
type EditableQuestion = { id?: string; stem: string };

export function TopicWizard({
  topic: initialTopic,
  initialChapters,
  initialEnableWebSearch = true,
  initialMaterials = [],
}: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  const materials = initialMaterials;
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
  const [agentActivity, setAgentActivity] = useState<AgentActivityState | null>(
    null,
  );
  const [enableWebSearch, setEnableWebSearch] = useState(
    initialEnableWebSearch,
  );

  const step = topic.status;
  const resolvedActiveChapterId =
    activeChapterId ?? chapters.find((c) => c.id)?.id ?? null;

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
    if (step !== "questions" || chapters.length === 0) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function generateChapters(withFeedback?: string) {
    setBusy(true);
    setError(null);
    setAgentActivity({
      reasoning: "",
      label: "拆分章节",
      searching: enableWebSearch,
      sources: [],
    });
    try {
      const res = await fetch("/api/ai/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: topic.id,
          feedback: withFeedback || undefined,
          enableSearch: enableWebSearch,
        }),
      });
      const rows = await consumeAgentStream<Chapter[]>({
        response: res,
        resultKey: "chapters",
        enableSearch: enableWebSearch,
        onActivity: (activity) =>
          setAgentActivity({ ...activity, label: "拆分章节" }),
      });
      setChapters(
        rows.map((c) => ({
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

      for (const ch of rows) {
        setAgentActivity({
          reasoning: "",
          label: `出题 · ${ch.title}`,
          searching: enableWebSearch,
          sources: [],
        });
        const res = await fetch("/api/ai/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: ch.id,
            enableSearch: enableWebSearch,
          }),
        });
        const questions = await consumeAgentStream<Question[]>({
          response: res,
          resultKey: "questions",
          enableSearch: enableWebSearch,
          onActivity: (activity) =>
            setAgentActivity({
              ...activity,
              label: `出题 · ${ch.title}`,
            }),
        });
        setQuestionsByChapter((prev) => ({
          ...prev,
          [ch.id]: questions.map((q) => ({
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
    if (!resolvedActiveChapterId) return;
    const chapterTitle =
      chapters.find((c) => c.id === resolvedActiveChapterId)?.title ?? "当前章";
    setBusy(true);
    setError(null);
    setAgentActivity({
      reasoning: "",
      label: `出题 · ${chapterTitle}`,
      searching: enableWebSearch,
      sources: [],
    });
    try {
      await saveActiveQuestions();
      const res = await fetch("/api/ai/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: resolvedActiveChapterId,
          feedback: withFeedback || undefined,
          enableSearch: enableWebSearch,
        }),
      });
      const questions = await consumeAgentStream<Question[]>({
        response: res,
        resultKey: "questions",
        enableSearch: enableWebSearch,
        onActivity: (activity) =>
          setAgentActivity({
            ...activity,
            label: `出题 · ${chapterTitle}`,
          }),
      });
      setQuestionsByChapter((prev) => ({
        ...prev,
        [resolvedActiveChapterId]: questions.map((q) => ({
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
    if (!resolvedActiveChapterId) return;
    const list = questionsByChapter[resolvedActiveChapterId] ?? [];
    const res = await fetch(`/api/chapters/${resolvedActiveChapterId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: list }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存小题失败");
    setQuestionsByChapter((prev) => ({
      ...prev,
      [resolvedActiveChapterId]: (data.questions as Question[]).map((q) => ({
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
      const ANSWER_CONCURRENCY = 3;
      let done = 0;
      let nextIndex = 0;

      async function generateOne(qid: string) {
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch("/api/ai/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId: qid }),
          });
          const data = await res.json();
          if (res.ok) {
            done += 1;
            setAnswerProgress({ done, total: freshIds.length });
            return;
          }
          lastError = new Error(data.error || "生成答案失败");
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
        }
        throw lastError ?? new Error("生成答案失败");
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
    () =>
      resolvedActiveChapterId
        ? questionsByChapter[resolvedActiveChapterId] ?? []
        : [],
    [resolvedActiveChapterId, questionsByChapter],
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
        <p className="text-sm text-[var(--ink-muted)]">
          由 Qwen 自动选择模型
          {step === "chapters" || step === "questions"
            ? enableWebSearch
              ? "并联网检索"
              : "（未开启联网检索）"
            : ""}
          {materials.length > 0
            ? ` · 已参考 ${materials.length} 份上传资料`
            : ""}
        </p>
        {materials.length > 0 ? (
          <ul className="space-y-1 text-xs text-[var(--ink-muted)]">
            {materials.map((m) => (
              <li key={m.id} className="truncate">
                {m.filename}
                {m.charCount > 0
                  ? ` · 已提取约 ${m.charCount.toLocaleString()} 字`
                  : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {step === "chapters" || step === "questions" ? (
          <div className="pt-1">
            <button
              type="button"
              disabled={busy}
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
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {step === "chapters" || step === "questions" ? (
        <AgentActivity activity={agentActivity} busy={busy} />
      ) : null}

      {step === "chapters" ? (
        <section className="space-y-4">
          <p className="text-sm text-[var(--ink-muted)]">
            {materials.length > 0
              ? enableWebSearch
                ? "Agent 会优先依据上传资料拆分章节，并联网补充；也可直接编辑，或输入意见后重新生成。"
                : "Agent 会依据上传资料拆分章节（未联网）；也可直接编辑，或输入意见后重新生成。"
              : enableWebSearch
                ? "Agent 会联网检索相关资料再拆分章节；也可直接编辑，或输入意见后重新生成。"
                : "Agent 将直接拆分章节（未联网）；也可直接编辑，或输入意见后重新生成。"}
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
                    resolvedActiveChapterId === ch.id
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
                    if (!resolvedActiveChapterId) return;
                    const list = [...activeQuestions];
                    list[index] = { ...q, stem: e.target.value };
                    setQuestionsByChapter((prev) => ({
                      ...prev,
                      [resolvedActiveChapterId]: list,
                    }));
                  }}
                  className="flex-1 resize-y bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  className="self-start text-xs text-[var(--ink-muted)] hover:text-red-700"
                  onClick={() => {
                    if (!resolvedActiveChapterId) return;
                    setQuestionsByChapter((prev) => ({
                      ...prev,
                      [resolvedActiveChapterId]: activeQuestions.filter(
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
            disabled={busy || !resolvedActiveChapterId}
            onClick={() => {
              if (!resolvedActiveChapterId) return;
              setQuestionsByChapter((prev) => ({
                ...prev,
                [resolvedActiveChapterId]: [
                  ...(prev[resolvedActiveChapterId] ?? []),
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
                disabled={busy || !resolvedActiveChapterId}
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
            正在并行生成答案；每题由模型自行判断是否需要联网检索。
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
