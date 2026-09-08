import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const here = path.resolve(process.cwd(), ".harness-timesaved");
const client = path.resolve(process.cwd());

// Vite matches `find` against the import specifier as written in the source,
// so the aliases name the relative paths DsAdminTimeSaved.jsx uses.
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/api\.js$/, replacement: path.join(here, "mockApi.js") },
      { find: /^\.\.\/store\.jsx$/, replacement: path.join(here, "mockStore.jsx") },
    ],
  },
  server: { port: 5199, fs: { allow: [client] } },
});
