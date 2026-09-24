// Local stand-in for the Vercel edge+function pair, so the SSR output can be
// curl'd exactly the way a crawler sees it in production.
//
// It reproduces the two hops production makes:
//   middleware.js  — every non-asset GET is rewritten to the meta function
//   api/meta.js    — that function renders the page and returns the HTML
//
// Static files under dist/ are served straight off disk, same as Vercel's CDN.
// `vite preview` cannot do this: it serves dist/index.html untouched, which is
// the empty shell and would report a false failure.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");

const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const { default: metaHandler } = await import("../src/api/meta.js");

// Mirrors the matcher in middleware.js: anything with a file extension, or
// under /assets, is a static asset and never reaches the renderer.
const isAsset = (p) => p.startsWith("/assets/") || /\.[^/]+$/.test(p);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (isAsset(url.pathname)) {
      const file = path.join(dist, url.pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.setHeader(
          "Content-Type",
          TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        );
        res.end(fs.readFileSync(file));
        return;
      }
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    // The rewrite: the real path arrives as a ?path= query parameter.
    req.url = `/api/meta?path=${encodeURIComponent(url.pathname)}`;
    req.headers.host = req.headers.host || `localhost:${PORT}`;

    try {
      await metaHandler(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.end(`handler threw: ${e?.stack || e}`);
    }
  })
  .listen(PORT, () => {
    console.log(`[serve-ssr] http://localhost:${PORT} (serving ${dist})`);
  });
