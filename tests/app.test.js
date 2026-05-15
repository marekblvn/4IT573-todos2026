import test from "ava";
import { createApp } from "../src/app.js";
import { todosTable, usersTable } from "../src/schema.js";
import { createDb } from "../src/db.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";

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
  await db.delete(usersTable);
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

test.serial("GET '/' links to separate login and registration views", async (t) => {
  const res = await app.request("/");
  t.is(res.status, 200);

  const html = await res.text();
  const $ = cheerio.load(html);
  const loginForm = $('form[method="get"][action="/login"]');
  const registerForm = $('form[method="get"][action="/register"]');
  t.is(loginForm.length, 1);
  t.is(registerForm.length, 1);
  t.true(loginForm.find("button").text().includes("Přihlásit"));
  t.true(registerForm.find("button").text().includes("Registrovat"));
  t.is($('form[method="post"][action="/login"]').length, 0);
});

test.serial("GET '/register' returns registration form", async (t) => {
  const res = await app.request("/register");
  t.is(res.status, 200);

  const html = await res.text();
  const $ = cheerio.load(html);
  t.is($('form[method="post"][action="/register"]').length, 1);
  t.is($('input[name="name"]').length, 1);
  t.is($('input[name="password"]').length, 1);
});

test.serial("GET '/login' returns login form", async (t) => {
  const res = await app.request("/login");
  t.is(res.status, 200);

  const html = await res.text();
  const $ = cheerio.load(html);
  t.is($('form[method="post"][action="/login"]').length, 1);
  t.is($('input[name="name"]').length, 1);
  t.is($('input[name="password"]').length, 1);
  t.is($('a[href="/register"]').length, 1);
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

test.serial("POST '/add-todo' binds new todos to logged user", async (t) => {
  await db.insert(usersTable).values({
    name: "alice",
    password: "secret",
    token: "alice-token",
  });
  const alice = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.name, "alice"))
    .get();

  const formData = new FormData();
  formData.set("title", "Soukromé todočko");
  formData.set("priority", "Střední");

  const postResponse = await app.request("/add-todo", {
    method: "POST",
    body: formData,
    headers: {
      Cookie: "todo_auth_token=alice-token",
    },
  });

  t.is(postResponse.status, 302);
  const [todo] = await db.select().from(todosTable).all();
  t.is(todo.userId, alice.id);
});

test.serial("private todos are visible only to their owner", async (t) => {
  await db.insert(usersTable).values([
    {
      name: "alice",
      password: "secret",
      token: "alice-token",
    },
    {
      name: "bob",
      password: "secret",
      token: "bob-token",
    },
  ]);
  const [alice, bob] = await db.select().from(usersTable).all();

  await db.insert(todosTable).values([
    {
      title: "Veřejné todočko",
      priority: "Nízká",
      done: false,
      userId: null,
    },
    {
      title: "Alice todočko",
      priority: "Střední",
      done: false,
      userId: alice.id,
    },
    {
      title: "Bob todočko",
      priority: "Vysoká",
      done: false,
      userId: bob.id,
    },
  ]);

  const anonymousResponse = await app.request("/");
  const anonymousHtml = await anonymousResponse.text();
  t.true(anonymousHtml.includes("Veřejné todočko"));
  t.false(anonymousHtml.includes("Alice todočko"));
  t.false(anonymousHtml.includes("Bob todočko"));

  const aliceResponse = await app.request("/", {
    headers: {
      Cookie: "todo_auth_token=alice-token",
    },
  });
  const aliceHtml = await aliceResponse.text();
  t.true(aliceHtml.includes("Veřejné todočko"));
  t.true(aliceHtml.includes("Alice todočko"));
  t.false(aliceHtml.includes("Bob todočko"));

  const [aliceTodo] = await db
    .select()
    .from(todosTable)
    .where(eq(todosTable.title, "Alice todočko"))
    .all();
  const anonymousDetail = await app.request(`/todo/${aliceTodo.id}`);
  t.is(anonymousDetail.status, 404);

  const bobDetail = await app.request(`/todo/${aliceTodo.id}`, {
    headers: {
      Cookie: "todo_auth_token=bob-token",
    },
  });
  t.is(bobDetail.status, 404);

  const aliceDetail = await app.request(`/todo/${aliceTodo.id}`, {
    headers: {
      Cookie: "todo_auth_token=alice-token",
    },
  });
  t.is(aliceDetail.status, 200);
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
