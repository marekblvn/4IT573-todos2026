import { Hono } from "hono";
import ejs from "ejs";
import { todosTable } from "./schema.js";
import { eq } from "drizzle-orm";
import { createNodeWebSocket } from "@hono/node-ws";
import { defaultPriority, priorities } from "./priority-enum.js";
import { createDb } from "./db.js";
import WSService from "./ws.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";

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
    upgradeWebSocket((_c) => ({
      onOpen: (_evt, ws) => {
        wsService.webSockets.add(ws);
        console.log("Open web sockets:", wsService.webSockets.size);
      },
      onClose: (_evt, ws) => {
        console.log("Closed web socket:", wsService.webSockets.size);
        wsService.webSockets.delete(ws);
      },
    })),
  );

  app.get("/", async (c) => {
    const todos = await db.select().from(todosTable).all();
    const html = await ejs.renderFile("views/index.html", {
      name: "Todos",
      todos,
      defaultPriority,
      priorities,
    });
    return c.html(html);
  });

  app.get("/todo/:id", async (c) => {
    const todoId = Number(c.req.param("id"));
    const todo = await db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, todoId))
      .get();

    if (!todo) {
      return c.notFound();
    }

    const detail = await ejs.renderFile("views/todo-detail.html", {
      todo,
      priorities,
    });
    return c.html(detail);
  });

  app.post("/add-todo", async (c) => {
    const body = await c.req.formData();
    const title = body.get("title");
    const priority = body.get("priority");

    await db.insert(todosTable).values({
      title,
      done: false,
      priority,
    });

    wsService.sendTodosToAllWebsockets();

    c.status(201);
    return c.redirect("/");
  });

  app.get("/remove-todo/:id", async (c) => {
    const id = Number(c.req.param("id"));

    await db.delete(todosTable).where(eq(todosTable.id, id));

    wsService.sendTodosToAllWebsockets();
    wsService.sendTodoDetailToAllWebsockets(id);

    return c.redirect("/");
  });

  app.get("/toggle-todo/:id", async (c) => {
    const id = Number(c.req.param("id"));

    const todo = await db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, id))
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
    const id = Number(c.req.param("id"));
    const body = await c.req.formData();
    const title = body.get("title");
    const priority = body.get("priority");

    const todo = await db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, id))
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
