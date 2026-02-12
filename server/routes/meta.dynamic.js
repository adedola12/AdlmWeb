// server/routes/meta.dynamic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Import the model you already have (you used it earlier)
import { TrainingEvent } from "../models/TrainingEvent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This file lives in: server/routes/
// So ../../client/dist/index.html points to: client/dist/index.html
const DIST_DIR = path.resolve(__dirname, "../../client/dist");
const INDEX_HTML_PATH = path.join(DIST_DIR, "index.html");

// Recommended in production: https://www.adlmstudio.net
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || "").trim();
const DEFAULT_OG_IMAGE = String(
  process.env.PUBLIC_OG_DEFAULT_IMAGE || "/og-default.jpg",
).trim();

// Social crawlers (WhatsApp/FB/LinkedIn/Twitter/Slack/Discord/etc.)
const BOT_UA_RE =
  /facebookexternalhit|facebot|Twitterbot|Slackbot-LinkExpanding|Discordbot|WhatsApp|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot/i;

let cachedHtml = null;
let cachedMtime = 0;

function loadHtmlTemplate() {
  const stat = fs.statSync(INDEX_HTML_PATH);
  if (!cachedHtml || stat.mtimeMs !== cachedMtime) {
    cachedHtml = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    cachedMtime = stat.mtimeMs;
  }
  return cachedHtml;
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

function hasFileExtension(p) {
  // skip static assets e.g. /assets/app.js, /Logo.png, /robots.txt
  return /\.[a-z0-9]{2,6}$/i.test(p);
}

function isDocumentOrBotRequest(req) {
  const dest = req.get("sec-fetch-dest");
  const mode = req.get("sec-fetch-mode");
  if (dest === "document" || mode === "navigate") return true;

  const ua = req.get("user-agent") || "";
  if (BOT_UA_RE.test(ua)) return true;

  // fallback: browsers often send Accept including text/html on navigations
  const accept = req.get("accept") || "";
  return accept.includes("text/html");
}

function getBaseUrl(req) {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL.replace(/\/+$/, "");

  const proto = (req.get("x-forwarded-proto") || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function absolutizeUrl(maybeUrl, baseUrl) {
  const u = String(maybeUrl || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;

  const base = String(baseUrl || "").replace(/\/+$/, "");
  const rel = u.replace(/^\/+/, "");
  return `${base}/${rel}`;
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
  const fullUrl = `${baseUrl}${req.originalUrl || req.url || ""}`;

  const fallback = {
    title: "ADLM Studio",
    description:
      "BIM training, digital construction tools, and QS productivity solutions.",
    url: fullUrl,
    image: absolutizeUrl(DEFAULT_OG_IMAGE, baseUrl),
  };

  const pathname = req.path || "/";

  // ✅ Physical trainings: /ptrainings/:slug -> use flyerUrl as preview image
  const ptrain = pathname.match(/^\/ptrainings\/([^/]+)\/?$/);
  if (ptrain) {
    const slug = decodeURIComponent(ptrain[1]);

    const training = await TrainingEvent.findOne({ slug })
      .select("title subtitle description flyerUrl slug")
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

    const image = absolutizeUrl(training?.flyerUrl, baseUrl) || fallback.image;

    return { title, description, url: fullUrl, image };
  }

  // ✅ Optional: normal trainings pages if you have /trainings/:slug
  const train = pathname.match(/^\/trainings\/([^/]+)\/?$/);
  if (train) {
    const slug = decodeURIComponent(train[1]);

    const training = await TrainingEvent.findOne({ slug })
      .select("title subtitle description flyerUrl slug")
      .lean();

    if (!training) return fallback;

    const title = `${training.title || "Training"} | ADLM Studio`;
    const description =
      truncate(
        training?.subtitle ||
          training?.description ||
          "Training by ADLM Studio.",
        180,
      ) || fallback.description;

    const image = absolutizeUrl(training?.flyerUrl, baseUrl) || fallback.image;

    return { title, description, url: fullUrl, image };
  }

  // ✅ Generic fallback for other pages (still gives correct URL + default OG image)
  return fallback;
}

export function registerDynamicMetaRoutes(app) {
  // Catch remaining routes AFTER APIs.
  app.get(/.*/, async (req, res, next) => {
    try {
      // Only respond with HTML for actual navigations/bots
      if (!isDocumentOrBotRequest(req)) return next();

      // Skip assets
      if (hasFileExtension(req.path || "")) return next();

      // Ensure build exists
      if (!fs.existsSync(INDEX_HTML_PATH)) {
        return res
          .status(500)
          .send(
            "client/dist/index.html not found. Build your frontend first (npm run build).",
          );
      }

      const template = loadHtmlTemplate();
      const meta = await resolveMeta(req);
      const html = injectMeta(template, meta);

      return res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .set("Cache-Control", "no-store")
        .send(html);
    } catch (err) {
      next(err);
    }
  });
}
