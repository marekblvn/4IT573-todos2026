import { WSContext } from "hono/ws";
import { todosTable } from "./schema.js";
import ejs from "ejs";
import { priorities } from "./priority-enum.js";
import { eq } from "drizzle-orm";
import { LibSQLDatabase } from "drizzle-orm/libsql";

/**
 * /**
 * @class
 * WebSocket wrapper
 */
class WSService {
  /**
   * @type {LibSQLDatabase} db
   */
  #db;
  /**
   * @param {LibSQLDatabase} db
   */
  constructor(db) {
    this.#db = db;
    /**
     * @type {Set<WSContext<WebSocket>>}
     */
    this.webSockets = new Set();
  }
  #sendToAllWebsockets(payload) {
    const message = JSON.stringify(payload);
    for (const socket of this.webSockets) {
      try {
        socket.send(message);
      } catch (e) {
        console.error("Websocket send failed:", e);
      }
    }
  }
  async sendTodosToAllWebsockets() {
    try {
      const todos = await this.#db.select().from(todosTable).all();
      const html = await ejs.renderFile("views/_todos.html", { todos });
      this.#sendToAllWebsockets({
        type: "todos",
        html,
      });
    } catch (e) {
      console.error(e);
    }
  }
  /**
   * @param {number} todoId
   */
  async sendTodoDetailToAllWebsockets(todoId) {
    try {
      const todo = await this.#db
        .select()
        .from(todosTable)
        .where(eq(todosTable.id, todoId))
        .get();
      if (!todo) {
        this.#sendToAllWebsockets({
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

      this.#sendToAllWebsockets({
        type: "todo-detail",
        todoId,
        deleted: false,
        html,
      });
    } catch (e) {
      console.error(e);
    }
  }
}

export default WSService;
