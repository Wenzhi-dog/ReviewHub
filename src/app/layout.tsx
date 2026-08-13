import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "面试",
  description: "用大模型按面试模块拆分主题、生成面试题与参考答法。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-body)] antialiased">
        <div className="mx-auto flex min-h-full max-w-4xl flex-col px-5 py-6 md:px-8">
          <nav className="mb-10 flex items-baseline justify-between gap-4">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]"
            >
              面试
            </Link>
            <Link
              href="/create"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              新建主题
            </Link>
          </nav>
          <main className="flex-1 pb-16">{children}</main>
        </div>
      </body>
    </html>
  );
}
