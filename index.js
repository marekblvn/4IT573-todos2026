import { serve } from "@hono/node-server";
import { createApp } from "./src/app.js";
import { createDb } from "./src/db.js";
import { migrate } from "drizzle-orm/libsql/migrator";

const db = createDb();
await migrate(db, { migrationsFolder: "./drizzle" });

const { app, injectWebSocket } = createApp(db);

const server = serve(app, (info) => {
  console.log(`Server started on http://localhost:${info.port}`);
});

injectWebSocket(server);
