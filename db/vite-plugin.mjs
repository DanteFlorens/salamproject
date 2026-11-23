import { openDatabase } from "./postgres.mjs";
import { apiMiddleware } from "./http.mjs";

/** Mounts /api on Vite dev and preview servers, opens Postgres once. */
export function salamDbPlugin() {
  return {
    name: "salam-postgres-api",
    async configureServer(server) {
      await openDatabase();
      server.middlewares.use(apiMiddleware);
    },
    async configurePreviewServer(server) {
      await openDatabase();
      server.middlewares.use(apiMiddleware);
    },
  };
}

/** @deprecated use salamDbPlugin */
export const salamSqlitePlugin = salamDbPlugin;
