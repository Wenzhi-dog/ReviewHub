import { CreateTopicForm } from "@/components/wizard/create-topic-form";

export default function CreatePage() {
  return (
    <div className="space-y-10">
      <header className="space-y-3 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">
          新建主题
        </h1>
        <p className="text-[var(--ink-muted)]">
          输入要准备的面试方向，可上传 PDF / PPT 等资料，接下来会按面试模块拆分、出题并生成参考答法。
        </p>
      </header>
      <CreateTopicForm />
    </div>
  );
}
