import { WSContext } from "hono/ws";
import db from "./db.js";
import { todosTable } from "./schema.js";
import ejs from "ejs";
import { priorities } from "./priority-enum.js";
import { eq } from "drizzle-orm";

/**
 * @type {Set<WSContext<WebSocket>>}
 */
const webSockets = new Set();

const sendToAllWebsockets = (payload) => {
  const message = JSON.stringify(payload);

  for (const socket of webSockets) {
    try {
      socket.send(message);
    } catch (e) {
      console.error("Websocket send failed:", e);
    }
  }
};

const sendTodosToAllWebsockets = async () => {
  try {
    const todos = await db.select().from(todosTable).all();
    const html = await ejs.renderFile("views/_todos.html", { todos });
    sendToAllWebsockets({
      type: "todos",
      html,
    });
  } catch (e) {
    console.error(e);
  }
};

/**
 * @param {number} todoId
 */
const sendTodoDetailToAllWebsockets = async (todoId) => {
  try {
    const todo = await db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, todoId))
      .get();
    if (!todo) {
      sendToAllWebsockets({
        type: "todo-detail",
        todoId,
        deleted: true,
        html: `
          <h1>Todočko bylo smazáno</h1>
          <p>Toto todočko už neexistuje.</p>
        `,
      });
      return;
    }

    const html = await ejs.renderFile("views/_todo-detail.html", {
      todo,
      priorities,
    });

    sendToAllWebsockets({
      type: "todo-detail",
      todoId,
      deleted: false,
      html,
    });
  } catch (e) {
    console.error(e);
  }
};

export { webSockets, sendTodoDetailToAllWebsockets, sendTodosToAllWebsockets };
