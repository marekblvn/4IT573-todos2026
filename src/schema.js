import { sqliteTable, int, text } from "drizzle-orm/sqlite-core";
import { defaultPriority, priorities } from "./priority-enum.js";

export const usersTable = sqliteTable("users", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  password: text().notNull(),
  token: text().notNull().unique(),
});

export const todosTable = sqliteTable("todos", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  done: int({ mode: "boolean" }).notNull(),
  priority: text({ mode: "text", enum: priorities })
    .notNull()
    .default(defaultPriority),
  userId: int("user_id").references(() => usersTable.id),
});
