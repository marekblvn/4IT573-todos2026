import { Hono } from "hono";
import { serve } from "@hono/node-server";
import ejs from "ejs";
import { drizzle } from "drizzle-orm/libsql";
import { todosTable } from "./src/schema.js";
import { eq } from "drizzle-orm";
import { createNodeWebSocket } from "@hono/node-ws";
import { WSContext } from "hono/ws";
import { defaultPriority, priorities } from "./src/priority-enum.js";

const db = drizzle({
  connection: "file:db.sqlite",
  logger: true,
});

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

/**
 * @type {Set<WSContext<WebSocket>>}
 */
let webSockets = new Set();

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
    onMessage: () => {
      console.log("message");
    },
    onClose: (evt, ws) => {
      console.log("close");
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

const sendTodoToAllWebsockets = async () => {
  try {
    const todos = await db.select().from(todosTable).all();
    const html = await ejs.renderFile("views/_todos.html", { todos });

    for (const webSocket of webSockets) {
      webSocket.send(
        JSON.stringify({
          type: "todos",
          html,
        }),
      );
    }
  } catch (e) {
    console.error(e);
  }
};

app.post("/add-todo", async (c) => {
  const body = await c.req.formData();
  const title = body.get("title");
  const priority = body.get("priority");

  await db.insert(todosTable).values({
    title,
    done: false,
    priority,
  });

  sendTodoToAllWebsockets();

  c.status(201);
  return c.redirect("/");
});

app.get("/remove-todo/:id", async (c) => {
  const id = Number(c.req.param("id"));

  await db.delete(todosTable).where(eq(todosTable.id, id));

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

  return c.redirectBack();
});

app.notFound(async (c) => {
  const html = await ejs.renderFile("views/404.html");

  c.status(404);

  return c.html(html);
});

const server = serve(app, (info) => {
  console.log(`Server started on http://localhost:${info.port}`);
});

injectWebSocket(server);
