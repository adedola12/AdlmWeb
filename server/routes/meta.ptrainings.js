import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Dynamic Meta Injection for SPA routes (OG / Twitter previews)
 * - Serves HTML only for "document" requests (browser navigation + social bots)
 * - Leaves API fetch() calls untouched
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Your dist index.html location (adjust if yours differs)
const DIST_DIR = path.resolve(__dirname, "../../client/dist");
const INDEX_HTML_PATH = path.join(DIST_DIR, "index.html");

// Optional: if set, used as canonical host (recommended in production)
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || "").trim(); // e.g. https://www.adlmstudio.net
const DEFAULT_OG_IMAGE = String(
  process.env.PUBLIC_OG_DEFAULT_IMAGE || "/og-default.jpg",
).trim(); // can be absolute or relative

// Social crawlers
const BOT_UA_RE =
  /facebookexternalhit|facebot|Twitterbot|Slackbot-LinkExpanding|Discordbot|WhatsApp|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot/i;

let _cachedTemplate = null;
let _cachedMtimeMs = 0;

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function loadTemplateHtml() {
  if (!fileExists(INDEX_HTML_PATH)) return null;

  const stat = fs.statSync(INDEX_HTML_PATH);
  if (!_cachedTemplate || stat.mtimeMs !== _cachedMtimeMs) {
    _cachedTemplate = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    _cachedMtimeMs = stat.mtimeMs;
  }
  return _cachedTemplate;
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
  // Skip assets like /assets/app.js, /Logo.png, /robots.txt, etc.
  return /\.[a-z0-9]{2,5}$/i.test(p);
}

function isDocumentRequest(req) {
  const dest = req.get("sec-fetch-dest");
  const mode = req.get("sec-fetch-mode");
  if (dest === "document" || mode === "navigate") return true;

  const ua = req.get("user-agent") || "";
  return BOT_UA_RE.test(ua);
}

function getBaseUrl(req) {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL.replace(/\/+$/, "");

  // fallback from request
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
  const title = meta.title || "ADLM Studio";
  const description = meta.description || "ADLM Studio";
  const url = meta.url || "";
  const image = meta.image || "";

  return html
    .replaceAll("__META_TITLE__", escapeHtml(title))
    .replaceAll("__META_DESC__", escapeHtml(description))
    .replaceAll("__META_URL__", escapeHtml(url))
    .replaceAll("__META_IMAGE__", escapeHtml(image));
}

async function tryLoadModel(modulePath, exportName) {
  try {
    const mod = await import(modulePath);
    if (exportName && mod[exportName]) return mod[exportName];
    return mod.default || null;
  } catch {
    return null;
  }
}

/**
 * Resolve page meta by URL path
 * Extend this as you like for more content types.
 */
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

  // ✅ ptrainings page: use flyerUrl as og:image
  // URL example: /ptrainings/adlm-practical-bim-march-2026
  const mPTrain = pathname.match(/^\/ptrainings\/([^/]+)\/?$/);
  if (mPTrain) {
    const slug = decodeURIComponent(mPTrain[1]);

    // Try a dedicated PTraining model first (if you have it), else fallback to TrainingEvent
    const PTrainingModel =
      (await tryLoadModel("../models/PTrainingEvent.js", "PTrainingEvent")) ||
      (await tryLoadModel("../models/PTraining.js", "PTraining")) ||
      null;

    const TrainingEventModel =
      (await tryLoadModel("../models/TrainingEvent.js", "TrainingEvent")) ||
      null;

    const Model = PTrainingModel || TrainingEventModel;
    if (!Model) return fallback;

    const doc = await Model.findOne({ slug })
      .select(
        "title name subtitle description flyerUrl coverImage imageUrl slug",
      )
      .lean();

    if (!doc)
      return {
        ...fallback,
        title: `ADLM Physical Training | ADLM Studio`,
        url: fullUrl,
      };

    const titleText = doc.title || doc.name || "ADLM Physical Training";
    const descText = truncate(
      doc.subtitle || doc.description || "Register for ADLM Physical Training.",
      180,
    );

    const imageCandidate =
      doc.flyerUrl || doc.coverImage || doc.imageUrl || DEFAULT_OG_IMAGE;

    return {
      title: `${titleText} | ADLM Studio`,
      description: descText,
      url: fullUrl,
      image: absolutizeUrl(imageCandidate, baseUrl),
    };
  }

  // ✅ trainings page (optional): /trainings/:slug
  const mTrain = pathname.match(/^\/trainings\/([^/]+)\/?$/);
  if (mTrain) {
    const slug = decodeURIComponent(mTrain[1]);
    const TrainingEventModel =
      (await tryLoadModel("../models/TrainingEvent.js", "TrainingEvent")) ||
      null;

    if (!TrainingEventModel) return fallback;

    const doc = await TrainingEventModel.findOne({ slug })
      .select(
        "title name subtitle description coverImage imageUrl flyerUrl slug",
      )
      .lean();

    if (!doc) return fallback;

    const titleText = doc.title || doc.name || "Training";
    const descText = truncate(
      doc.subtitle || doc.description || "Training by ADLM Studio.",
      180,
    );
    const img =
      doc.coverImage || doc.imageUrl || doc.flyerUrl || DEFAULT_OG_IMAGE;

    return {
      title: `${titleText} | ADLM Studio`,
      description: descText,
      url: fullUrl,
      image: absolutizeUrl(img, baseUrl),
    };
  }

  // ✅ products page (optional): /products/:slug
  const mProd = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (mProd) {
    const slug = decodeURIComponent(mProd[1]);
    const ProductModel =
      (await tryLoadModel("../models/Product.js", "Product")) || null;

    if (!ProductModel) return fallback;

    const doc = await ProductModel.findOne({ slug }).lean();
    if (!doc) return fallback;

    const titleText = doc.title || doc.name || "Product";
    const descText = truncate(
      doc.shortDescription || doc.description || "Product by ADLM Studio.",
      180,
    );

    const img =
      doc.thumbnailUrl ||
      doc.imageUrl ||
      doc.coverImage ||
      (Array.isArray(doc.images)
        ? doc.images?.[0]?.url || doc.images?.[0]
        : null) ||
      DEFAULT_OG_IMAGE;

    return {
      title: `${titleText} | ADLM Studio`,
      description: descText,
      url: fullUrl,
      image: absolutizeUrl(img, baseUrl),
    };
  }

  // ✅ Generic: still inject correct URL + default image
  // You can add more match blocks for /learn/:slug, /showcase/:slug, /freebies/:slug etc.
  return fallback;
}

export function registerDynamicMetaRoutes(app) {
  // Catch-all HTML handler (this replaces your SPA fallback)
  app.get(/.*/, async (req, res, next) => {
    try {
      // Only for real document/social-preview requests
      if (!isDocumentRequest(req)) return next();

      // Let static assets pass through
      if (hasFileExtension(req.path || "")) return next();

      const template = loadTemplateHtml();
      if (!template) {
        return res
          .status(500)
          .send("Frontend build not found (missing client/dist/index.html).");
      }

      const meta = await resolveMeta(req);
      const html = injectMeta(template, meta);

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .set("Cache-Control", "no-store") // helps with crawler refreshes
        .send(html);
    } catch (err) {
      next(err);
    }
  });
}
