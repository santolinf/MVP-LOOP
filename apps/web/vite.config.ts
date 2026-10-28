import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** Chrome DevTools probes this URL; answer 404 in dev instead of React Router logging an unmatched route. */
const quietDevtoolsProbe = (): Plugin => ({
  name: "quiet-devtools-probe",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
      res.statusCode = 404;
      res.end();
    });
  },
});

export default defineConfig({
  plugins: [quietDevtoolsProbe(), tailwindcss(), reactRouter()],
  server: { proxy: { "/api": "http://localhost:3000" } },
});
