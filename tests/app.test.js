import test from "ava";
import { createApp } from "../src/app.js";
import { todosTable } from "../src/schema.js";
import { createDb } from "../src/db.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as cheerio from "cheerio";

/**
 * @type {Hono}
 */
let app;
/**
 * @type {LibSQLDatabase}
 */
let db;

test.before(async () => {
  db = createDb(":memory:", false);
  await migrate(db, { migrationsFolder: "./drizzle" });
  ({ app } = createApp(db));
});

test.beforeEach(async () => {
  await db.delete(todosTable);
});

test.serial("GET '/' returns 200 and shows todos in a list", async (t) => {
  await db.insert(todosTable).values([
    {
      title: "Todo 1",
      priority: "Nízká",
      done: false,
    },
    {
      title: "Todo 2",
      priority: "Střední",
      done: true,
    },
    {
      title: "Todo 3",
      priority: "Vysoká",
      done: false,
    },
  ]);
  const res = await app.request("/");
  t.is(res.status, 200);
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = $("table tbody tr");
  const dbTodos = await db.select().from(todosTable).all();
  const dbRowCount = dbTodos.length;
  t.is(rows.length, dbRowCount);
});

test.serial("POST '/add-todo' creates a todo", async (t) => {
  const initialTodos = await db.select().from(todosTable).all();
  const initialTodoCount = initialTodos.length;
  const formData = new FormData();
  formData.set("title", "Testovací todočko");
  formData.set("priority", "Střední");
  const postResponse = await app.request("/add-todo", {
    method: "POST",
    body: formData,
  });
  t.is(postResponse.status, 302);
  const location = postResponse.headers.get("location");
  const getResponse = await app.request(location, {
    method: "GET",
  });
  const html = await getResponse.text();
  const $ = cheerio.load(html);
  const rows = $("table tbody tr");
  t.is(initialTodoCount + 1, rows.length);
  const found = rows.toArray().some((rowEl) => {
    const row = $(rowEl);
    const title = row.find("td").eq(1).text().trim();
    return title.includes("Testovací todočko");
  });
  t.true(found);
});

test.serial("it allows toggling todo status", async (t) => {
  await db.insert(todosTable).values({
    title: "Toggle todo",
    priority: "Střední",
    done: false,
  });
  const [todoBefore] = await db.select().from(todosTable).all();
  t.false(Boolean(todoBefore.done));
  const toggleResponse = await app.request(`/toggle-todo/${todoBefore.id}`, {
    method: "GET",
    headers: { Referer: "/" },
  });
  t.is(toggleResponse.status, 302);
  const [todoAfter] = await db.select().from(todosTable).all();
  t.true(Boolean(todoAfter.done));
});

test.serial("it allows changing todo priority", async (t) => {
  await db.insert(todosTable).values({
    title: "Change priority",
    priority: "Nízká",
    done: false,
  });
  const [todoBefore] = await db.select().from(todosTable).all();
  t.is(todoBefore.priority, "Nízká");

  const formData = new FormData();
  formData.set("title", "Change priority");
  formData.set("priority", "Vysoká");

  const updateResponse = await app.request(`/update-todo/${todoBefore.id}`, {
    method: "POST",
    body: formData,
    headers: {
      Referer: "/",
    },
  });
  t.is(updateResponse.status, 302);
  const [todoAfter] = await db.select().from(todosTable).all();
  t.is(todoAfter.title, "Change priority");
  t.is(todoAfter.priority, "Vysoká");

  formData.set("title", "Change priority");
  formData.set("priority", "Střední");

  const updateResponse2 = await app.request(`/update-todo/${todoBefore.id}`, {
    method: "POST",
    body: formData,
    headers: {
      Referer: "/",
    },
  });

  t.is(updateResponse2.status, 302);
  const [todoAfter2] = await db.select().from(todosTable).all();
  t.is(todoAfter2.title, "Change priority");
  t.is(todoAfter2.priority, "Střední");
});

test.serial("it allows removing todos", async (t) => {
  await db.insert(todosTable).values([
    {
      title: "Delete me",
      priority: "Nízká",
      done: true,
    },
  ]);
  const [deletableTodo] = await db.select().from(todosTable).all();
  t.truthy(deletableTodo);
  t.is(deletableTodo.title, "Delete me");

  const removeResponse = await app.request(`/remove-todo/${deletableTodo.id}`, {
    method: "GET",
  });
  t.is(removeResponse.status, 302);
  t.is(removeResponse.headers.get("location"), "/");
  const todosAfter = await db.select().from(todosTable).all();
  t.is(todosAfter.length, 0);
  const detailResponse = await app.request(`/todo/${deletableTodo.id}`);
  t.is(detailResponse.status, 404);
});
