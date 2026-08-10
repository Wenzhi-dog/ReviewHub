import { z } from "zod";

export const chaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
      }),
    )
    .min(1),
});

export const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        stem: z.string(),
      }),
    )
    .min(1),
});

export type ChaptersOutput = z.infer<typeof chaptersSchema>;
export type QuestionsOutput = z.infer<typeof questionsSchema>;
