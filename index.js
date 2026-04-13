import { Hono } from "hono";
import { serve } from "@hono/node-server";
import ejs from "ejs";
import { todosTable } from "./src/schema.js";
import { eq } from "drizzle-orm";
import { createNodeWebSocket } from "@hono/node-ws";
import { defaultPriority, priorities } from "./src/priority-enum.js";
import db from "./src/db.js";
import {
  webSockets,
  sendTodoDetailToAllWebsockets,
  sendTodosToAllWebsockets,
} from "./src/ws.js";

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
  upgradeWebSocket((c) => ({
    onOpen: (evt, ws) => {
      webSockets.add(ws);
      console.log("Open web sockets:", webSockets.size);
    },
    onClose: (evt, ws) => {
      console.log("Closed web socket:", webSockets.size);
      webSockets.delete(ws);
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

  sendTodosToAllWebsockets();

  c.status(201);
  return c.redirect("/");
});

app.get("/remove-todo/:id", async (c) => {
  const id = Number(c.req.param("id"));

  await db.delete(todosTable).where(eq(todosTable.id, id));

  sendTodosToAllWebsockets();
  sendTodoDetailToAllWebsockets(id);

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

  sendTodosToAllWebsockets();
  sendTodoDetailToAllWebsockets(id);

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

  sendTodosToAllWebsockets();
  sendTodoDetailToAllWebsockets(id);

  return c.redirectBack();
});

const server = serve(app, (info) => {
  console.log(`Server started on http://localhost:${info.port}`);
});

injectWebSocket(server);
