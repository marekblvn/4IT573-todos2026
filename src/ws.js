import { WSContext } from "hono/ws";
import { todosTable } from "./schema.js";
import ejs from "ejs";
import { priorities } from "./priority-enum.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { LibSQLDatabase } from "drizzle-orm/libsql";

const getVisibleTodosCondition = (user) =>
  user
    ? or(isNull(todosTable.userId), eq(todosTable.userId, user.id))
    : isNull(todosTable.userId);

const getVisibleTodoCondition = (todoId, user) =>
  and(eq(todosTable.id, todoId), getVisibleTodosCondition(user));

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
    this.webSocketUsers = new Map();
  }
  addWebSocket(socket, user) {
    this.webSockets.add(socket);
    this.webSocketUsers.set(socket, user ?? null);
  }
  removeWebSocket(socket) {
    this.webSockets.delete(socket);
    this.webSocketUsers.delete(socket);
  }
  #sendToWebsocket(socket, payload) {
    const message = JSON.stringify(payload);
    try {
      socket.send(message);
    } catch (e) {
      console.error("Websocket send failed:", e);
    }
  }
  async sendTodosToAllWebsockets() {
    for (const socket of this.webSockets) {
      try {
        const user = this.webSocketUsers.get(socket) ?? null;
        const todos = await this.#db
          .select()
          .from(todosTable)
          .where(getVisibleTodosCondition(user))
          .all();
        const html = await ejs.renderFile("views/_todos.html", { todos });
        this.#sendToWebsocket(socket, {
          type: "todos",
          html,
        });
      } catch (e) {
        console.error(e);
      }
    }
  }
  /**
   * @param {number} todoId
   */
  async sendTodoDetailToAllWebsockets(todoId) {
    for (const socket of this.webSockets) {
      try {
        const user = this.webSocketUsers.get(socket) ?? null;
        const todo = await this.#db
          .select()
          .from(todosTable)
          .where(getVisibleTodoCondition(todoId, user))
          .get();
        if (!todo) {
          this.#sendToWebsocket(socket, {
            type: "todo-detail",
            todoId,
            deleted: true,
            html: `
            <h1>Todočko není dostupné</h1>
            <p>Toto todočko neexistuje nebo k němu nemáte přístup.</p>
          `,
          });
          continue;
        }
        const html = await ejs.renderFile("views/_todo-detail.html", {
          todo,
          priorities,
        });

        this.#sendToWebsocket(socket, {
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
}

export default WSService;
