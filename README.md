# ReviewHub

知识点复习 Agent：输入主题 → AI 拆章节 → 生成小题 → 逐题生成答案 → 复习打卡。

章节与小题生成会由 Qwen **自动选择** `qwen3.7-flash`（简单）或 `qwen3.7-plus`（高性能），并开启模型自带联网搜索；答案固定使用 `qwen3.7-flash`。

## 本地运行

1. 复制环境变量：

```bash
cp .env.example .env.local
```

2. 填入：
   - Neon `DATABASE_URL`
   - `DASHSCOPE_API_KEY`（[阿里云百炼](https://bailian.console.aliyun.com)）

3. 建表并启动：

```bash
npm run db:push
npm run dev
```

## 部署（Vercel）

已关联项目 `reviewhub`，生产地址：https://reviewhub-delta.vercel.app

重新部署：

```bash
npx vercel deploy --prod
```

在 Vercel 项目环境变量中配置 `DATABASE_URL` 与 `DASHSCOPE_API_KEY`。
