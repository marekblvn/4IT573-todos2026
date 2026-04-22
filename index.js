import { serve } from "@hono/node-server";
import { createApp } from "./src/app.js";

const { app, injectWebSocket } = createApp();

const server = serve(app, (info) => {
  console.log(`Server started on http://localhost:${info.port}`);
});

injectWebSocket(server);
