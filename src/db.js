import { drizzle } from "drizzle-orm/libsql";

const db = drizzle({
  connection: "file:db.sqlite",
  logger: true,
});

export default db;
