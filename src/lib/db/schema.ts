import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const topicStatus = [
  "chapters",
  "questions",
  "answers",
  "ready",
] as const;
export type TopicStatus = (typeof topicStatus)[number];

export const topics = pgTable("topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  /** Legacy field; generation auto-selects Qwen tiers and ignores user choice. */
  modelId: text("model_id")
    .notNull()
    .default("qwen3.7-flash"),
  status: text("status").$type<TopicStatus>().notNull().default("chapters"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chapters = pgTable("chapters", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  stem: text("stem").notNull(),
  answer: text("answer"),
  sortOrder: integer("sort_order").notNull().default(0),
  checked: boolean("checked").notNull().default(false),
  favorited: boolean("favorited").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Topic = typeof topics.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Question = typeof questions.$inferSelect;
