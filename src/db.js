import { drizzle } from "drizzle-orm/libsql";

/**
 * @param {string | import("@libsql/client").Config} connection
 * @param {boolean} allowLogger
 */
export function createDb(connection = "file:db.sqlite", allowLogger = true) {
  return drizzle({
    connection,
    logger: allowLogger,
  });
}
