import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.js",
  dbCredentials: {
    url: "file:db.sqlite",
  },
});
