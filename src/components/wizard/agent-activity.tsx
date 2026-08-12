"use client";

import { useState } from "react";
import type { AgentActivityState } from "@/lib/ai/consume-agent-stream";

type Props = {
  activity: AgentActivityState | null;
  busy: boolean;
};

export function AgentActivity({ activity, busy }: Props) {
  const [open, setOpen] = useState(true);

  if (!activity) return null;

  const hasContent =
    activity.reasoning.trim().length > 0 || Boolean(activity.searching);
  if (!hasContent && !busy) return null;

  return (
    <div className="rounded-sm border border-[var(--ink)]/12 bg-[var(--ink)]/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
      >
        <span className="text-[var(--ink)]">
          {busy ? "Agent 工作中…" : "Agent 过程"}
          {activity.label ? (
            <span className="text-[var(--ink-muted)]"> · {activity.label}</span>
          ) : null}
        </span>
        <span className="text-xs text-[var(--ink-muted)]">
          {open ? "收起" : "展开"}
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-[var(--ink)]/10 px-3 py-3">
          {busy || activity.searching ? (
            <p className="text-xs text-[var(--ink-muted)]">
              正在通过 Qwen 联网检索相关资料…
            </p>
          ) : null}

          {activity.reasoning.trim() ? (
            <div className="space-y-2">
              <p className="text-xs tracking-wide text-[var(--ink-muted)]">
                思考过程
              </p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--ink-muted)]">
                {activity.reasoning}
              </pre>
            </div>
          ) : busy ? (
            <p className="text-xs text-[var(--ink-muted)]">等待模型思考…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
