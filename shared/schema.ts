import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firebaseUid: text("firebase_uid").notNull().unique(),
});

export const queries = pgTable("queries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  text: text("text").notNull(),
  lastUpdated: text("last_updated").notNull(),
  keywords: text("keywords").notNull(),
  keywordCounts: text("keyword_counts").notNull(),
  tags: text("tags").notNull(),
  savedAt: timestamp("saved_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firebaseUid: true,
});

export const insertQuerySchema = createInsertSchema(queries).pick({
  userId: true,
  text: true,
  lastUpdated: true,
  keywords: true,
  keywordCounts: true,
  tags: true,
  savedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertQuery = z.infer<typeof insertQuerySchema>;
export type Query = typeof queries.$inferSelect;
