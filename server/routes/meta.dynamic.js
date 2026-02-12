// server/routes/meta.dynamic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TrainingEvent } from "../models/TrainingEvent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite build output
const INDEX_HTML_PATH = process.env.INDEX_HTML_PATH
  ? path.resolve(process.env.INDEX_HTML_PATH)
  : path.resolve(__dirname, "../../client/dist/index.html");

// Cache index.html in memory (auto-reloads in dev when file changes)
let _cachedHtml = null;
let _cachedMtimeMs = 0;

function readIndexHtml() {
  const stat = fs.statSync(INDEX_HTML_PATH);
  if (!_cachedHtml || stat.mtimeMs !== _cachedMtimeMs) {
    _cachedHtml = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    _cachedMtimeMs = stat.mtimeMs;
  }
  return _cachedHtml;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(s, n = 180) {
  const x = String(s || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!x) return "";
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

function getBaseUrl(req) {
  // Prefer explicit env in production
  const envBase = String(process.env.PUBLIC_APP_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  // Otherwise infer from request (works behind proxies if trust proxy is set)
  const xfProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const proto = xfProto || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function absolutizeUrl(maybeUrl, baseUrl) {
  const u = String(maybeUrl || "").trim();
  if (!u) return "";
  try {
    // already absolute
    if (/^https?:\/\//i.test(u)) return u;
    return new URL(u.replace(/^\/+/, "/"), baseUrl).toString();
  } catch {
    return "";
  }
}

function looksLikeApiRequest(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  if (accept.includes("application/json")) return true;
  if (req.headers["x-requested-with"]) return true; // XHR
  return false;
}

function isAssetRequest(reqPath) {
  // Any path with a file extension is considered an asset (/assets/app.js, /Logo.png, etc.)
  return path.extname(reqPath || "") !== "";
}

function shouldServeInjectedHtml(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (isAssetRequest(req.path)) return false;
  if (looksLikeApiRequest(req)) return false;
  return true;
}

function injectMeta(html, meta) {
  return html
    .replaceAll("__META_TITLE__", escapeHtml(meta.title))
    .replaceAll("__META_DESC__", escapeHtml(meta.description))
    .replaceAll("__META_URL__", escapeHtml(meta.url))
    .replaceAll("__META_IMAGE__", escapeHtml(meta.image));
}

async function resolveMeta(req) {
  const baseUrl = getBaseUrl(req);

  // Strip querystring for canonical
  const cleanPath = String(req.originalUrl || "").split("?")[0] || "/";
  const pageUrl = new URL(cleanPath, baseUrl).toString();

  // Defaults
  let meta = {
    title: "ADLM Studio",
    description: "BIM Training, QS Tools, and Digital Construction Solutions.",
    url: pageUrl,
    image: new URL("/og-default.jpg", baseUrl).toString(), // put og-default.jpg in client/public
  };

  // ✅ PTraining detail page: /ptrainings/:slug  -> use flyer as preview
  const m = req.path.match(/^\/ptrainings\/([^/]+)\/?$/i);
  if (m) {
    const slug = decodeURIComponent(m[1]);

    const training = await TrainingEvent.findOne({ slug })
      .select("title subtitle description flyerUrl ogImageUrl slug")
      .lean();

    const title = training?.title
      ? `${training.title} | ADLM Studio`
      : "ADLM Physical Training | ADLM Studio";

    const description =
      truncate(
        training?.subtitle ||
          training?.description ||
          "Register for ADLM Physical Training.",
        180,
      ) || "Register for ADLM Physical Training.";

    // Prefer an explicit OG image if you store one; else flyer; else default
    const chosen =
      training?.ogImageUrl || training?.flyerUrl || "/og-default.jpg";

    const image = absolutizeUrl(chosen, baseUrl) || meta.image;

    meta = { ...meta, title, description, url: pageUrl, image };
    return meta;
  }

  // ✅ PTraining listing page: /ptrainings
  if (/^\/ptrainings\/?$/i.test(req.path)) {
    meta.title = "ADLM Physical Trainings | ADLM Studio";
    meta.description =
      "Explore and register for upcoming ADLM physical trainings.";
    return meta;
  }

  // Add more resolvers here later:
  // - /trainings/:slug
  // - /products/:slug
  // - /learn/:slug
  // etc.

  return meta;
}

export function registerDynamicMetaRoutes(app) {
  // Use RegExp wildcard for Express (safe with newer path-to-regexp)
  app.get(/.*/, async (req, res, next) => {
    try {
      if (!shouldServeInjectedHtml(req)) return next();

      const template = readIndexHtml();
      const meta = await resolveMeta(req);
      const html = injectMeta(template, meta);

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        // keep small cache; crawlers also cache on their side
        .set("Cache-Control", "public, max-age=300")
        .send(html);
    } catch (err) {
      next(err);
    }
  });
}
