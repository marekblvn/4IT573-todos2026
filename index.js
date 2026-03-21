import { Hono } from "hono";
import { serve } from "@hono/node-server";
import ejs from "ejs";

const app = new Hono();

let todos = [
  {
    id: 1,
    title: "Zajít na pivo",
    done: true,
  },
  {
    id: 2,
    title: "Jít učit Node.js",
    done: false,
  },
];

app.use("*", async (c, next) => {
  c.redirectBack = () => {
    const referer = c.req.header("Referer");
    return c.redirect(referer ?? "/");
  };
  await next();
});

app.get(async (c, next) => {
  console.log(c.req.method, c.req.url);

  await next();
});

app.get("/", async (c) => {
  const html = await ejs.renderFile("views/index.html", {
    name: "Todos",
    todos,
  });

  return c.html(html);
});

app.get("/todo/:id", async (c) => {
  const idParam = Number(c.req.param("id"));
  const todo = todos.find((todo) => todo.id === idParam);
  if (!todo) {
    const html = await ejs.renderFile("views/404.html");
    c.status(404);
    return c.html(html);
  }
  const html = await ejs.renderFile("views/todo-detail.html", {
    ...todo,
  });
  return c.html(html);
});

app.post("/add-todo", async (c) => {
  const body = await c.req.formData();
  const title = body.get("title");

  todos.push({
    id: todos.length + 1,
    title,
    done: false,
  });

  c.status(201);
  return c.redirect("/");
});

app.get("/remove-todo/:id", async (c) => {
  const id = Number(c.req.param("id"));

  todos = todos.filter((todo) => todo.id !== id);

  return c.redirect("/");
});

app.get("/toggle-todo/:id", async (c) => {
  const id = Number(c.req.param("id"));

  const todo = todos.find((todo) => todo.id === id);
  if (todo) {
    todo.done = !todo.done;
  }

  return c.redirectBack();
});

app.post("/rename-todo/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.formData();
  const newTitle = body.get("title");

  const todo = todos.find((todo) => todo.id === id);
  if (todo) {
    todo.title = newTitle;
  }

  return c.redirectBack();
});

app.notFound(async (c) => {
  const html = await ejs.renderFile("views/404.html");

  c.status(404);

  return c.html(html);
});

serve(app, (info) => {
  console.log(`Server started on http://localhost:${info.port}`);
});
