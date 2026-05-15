import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import ejs from "ejs";
import { todosTable, usersTable } from "./schema.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { createNodeWebSocket } from "@hono/node-ws";
import { defaultPriority, priorities } from "./priority-enum.js";
import { createDb } from "./db.js";
import WSService from "./ws.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { randomUUID } from "node:crypto";

const authCookieName = "todo_auth_token";

const getVisibleTodosCondition = (user) =>
  user
    ? or(isNull(todosTable.userId), eq(todosTable.userId, user.id))
    : isNull(todosTable.userId);

const getVisibleTodoCondition = (todoId, user) =>
  and(eq(todosTable.id, todoId), getVisibleTodosCondition(user));

/**
 * @param {LibSQLDatabase} db
 */
export const createApp = (db = createDb("file:db.sqlite")) => {
  const wsService = new WSService(db);
  const app = new Hono();

  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.use("*", async (c, next) => {
    c.redirectBack = (fallbackUrl = "/") => {
      const referer = c.req.header("Referer");
      return c.redirect(referer ?? fallbackUrl);
    };

    const token = getCookie(c, authCookieName);
    const currentUser = token
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.token, token))
          .get()
      : null;
    c.set("currentUser", currentUser ?? null);

    await next();
  });

  app.notFound(async (c) => {
    const html = await ejs.renderFile("views/404.html");
    return c.html(html, 404);
  });

  app.get(async (c, next) => {
    console.log(c.req.method, c.req.url);
    await next();
  });

  app.get(
    "/ws",
    upgradeWebSocket((c) => ({
      onOpen: (_evt, ws) => {
        wsService.addWebSocket(ws, c.get("currentUser"));
        console.log("Open web sockets:", wsService.webSockets.size);
      },
      onClose: (_evt, ws) => {
        console.log("Closed web socket:", wsService.webSockets.size);
        wsService.removeWebSocket(ws);
      },
    })),
  );

  app.get("/", async (c) => {
    const currentUser = c.get("currentUser");
    const todos = await db
      .select()
      .from(todosTable)
      .where(getVisibleTodosCondition(currentUser))
      .all();
    const html = await ejs.renderFile("views/index.html", {
      name: "Todos",
      todos,
      defaultPriority,
      priorities,
      currentUser,
    });
    return c.html(html);
  });

  app.get("/register", async (c) => {
    if (c.get("currentUser")) {
      return c.redirect("/");
    }

    const html = await ejs.renderFile("views/register.html");
    return c.html(html);
  });

  app.get("/login", async (c) => {
    if (c.get("currentUser")) {
      return c.redirect("/");
    }

    const html = await ejs.renderFile("views/login.html");
    return c.html(html);
  });

  app.post("/register", async (c) => {
    const body = await c.req.formData();
    const name = String(body.get("name") ?? "").trim();
    const password = String(body.get("password") ?? "");

    if (!name || !password) {
      c.status(400);
      return c.redirect("/register");
    }

    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.name, name))
      .get();

    if (existingUser) {
      c.status(409);
      return c.redirect("/register");
    }

    const token = randomUUID();
    await db.insert(usersTable).values({ name, password, token });
    setCookie(c, authCookieName, token, {
      httpOnly: true,
      path: "/",
      sameSite: "Strict",
    });

    return c.redirect("/");
  });

  app.post("/login", async (c) => {
    const body = await c.req.formData();
    const name = String(body.get("name") ?? "").trim();
    const password = String(body.get("password") ?? "");

    const user = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.name, name), eq(usersTable.password, password)))
      .get();

    if (!user) {
      c.status(401);
      return c.redirect("/");
    }

    const token = randomUUID();
    await db
      .update(usersTable)
      .set({ token })
      .where(eq(usersTable.id, user.id));
    setCookie(c, authCookieName, token, {
      httpOnly: true,
      path: "/",
      sameSite: "Strict",
    });

    return c.redirect("/");
  });

  app.post("/logout", async (c) => {
    deleteCookie(c, authCookieName, { path: "/" });
    return c.redirect("/");
  });

  app.get("/todo/:id", async (c) => {
    const currentUser = c.get("currentUser");
    const todoId = Number(c.req.param("id"));
    const todo = await db
      .select()
      .from(todosTable)
      .where(getVisibleTodoCondition(todoId, currentUser))
      .get();

    if (!todo) {
      return c.notFound();
    }

    const detail = await ejs.renderFile("views/todo-detail.html", {
      todo,
      priorities,
      currentUser,
    });
    return c.html(detail);
  });

  app.post("/add-todo", async (c) => {
    const currentUser = c.get("currentUser");
    const body = await c.req.formData();
    const title = body.get("title");
    const priority = body.get("priority");

    await db.insert(todosTable).values({
      title,
      done: false,
      priority,
      userId: currentUser?.id ?? null,
    });

    wsService.sendTodosToAllWebsockets();

    c.status(201);
    return c.redirect("/");
  });

  app.get("/remove-todo/:id", async (c) => {
    const currentUser = c.get("currentUser");
    const id = Number(c.req.param("id"));

    await db.delete(todosTable).where(getVisibleTodoCondition(id, currentUser));

    wsService.sendTodosToAllWebsockets();
    wsService.sendTodoDetailToAllWebsockets(id);

    return c.redirect("/");
  });

  app.get("/toggle-todo/:id", async (c) => {
    const currentUser = c.get("currentUser");
    const id = Number(c.req.param("id"));

    const todo = await db
      .select()
      .from(todosTable)
      .where(getVisibleTodoCondition(id, currentUser))
      .get();

    if (todo) {
      await db
        .update(todosTable)
        .set({ done: !todo.done })
        .where(eq(todosTable.id, id));
    }

    wsService.sendTodosToAllWebsockets();
    wsService.sendTodoDetailToAllWebsockets(id);

    return c.redirectBack();
  });

  app.post("/update-todo/:id", async (c) => {
    const currentUser = c.get("currentUser");
    const id = Number(c.req.param("id"));
    const body = await c.req.formData();
    const title = body.get("title");
    const priority = body.get("priority");

    const todo = await db
      .select()
      .from(todosTable)
      .where(getVisibleTodoCondition(id, currentUser))
      .get();
    if (todo) {
      await db
        .update(todosTable)
        .set({ title, priority })
        .where(eq(todosTable.id, id));
    }

    wsService.sendTodosToAllWebsockets();
    wsService.sendTodoDetailToAllWebsockets(id);

    return c.redirectBack();
  });
  return { app, db, injectWebSocket, upgradeWebSocket };
};
