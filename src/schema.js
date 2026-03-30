import { sqliteTable, int, text } from "drizzle-orm/sqlite-core";
import { defaultPriority, priorities } from "./priority-enum.js";

export const todosTable = sqliteTable("todos", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  done: int({ mode: "boolean" }).notNull(),
  priority: text({ mode: "text", enum: priorities })
    .notNull()
    .default(defaultPriority),
});
