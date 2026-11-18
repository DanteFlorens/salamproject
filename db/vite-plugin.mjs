import { openDatabase } from "./sqlite.mjs";
import { apiMiddleware } from "./http.mjs";

/** Mounts /api on Vite dev and preview servers, opens SQLite once. */
export function salamSqlitePlugin() {
  return {
    name: "salam-sqlite-api",
    configureServer(server) {
      openDatabase();
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      openDatabase();
      server.middlewares.use(apiMiddleware);
    },
  };
}
