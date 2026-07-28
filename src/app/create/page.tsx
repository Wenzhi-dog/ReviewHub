import { CreateTopicForm } from "@/components/wizard/create-topic-form";

export default function CreatePage() {
  return (
    <div className="space-y-10">
      <header className="space-y-3 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">
          新建主题
        </h1>
        <p className="text-[var(--ink-muted)]">
          输入要复习的知识点，接下来会拆章节、出小题并生成答案。
        </p>
      </header>
      <CreateTopicForm />
    </div>
  );
}
