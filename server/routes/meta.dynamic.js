// server/routes/meta.dynamic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TrainingEvent } from "../models/TrainingEvent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use built index.html as template
const INDEX_HTML_PATH = process.env.INDEX_HTML_PATH
  ? path.resolve(process.env.INDEX_HTML_PATH)
  : path.resolve(__dirname, "../../client/dist/index.html");

// Cache index.html in memory
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
  const envBase = String(process.env.PUBLIC_APP_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");

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
    if (/^https?:\/\//i.test(u)) return u;
    return new URL(u.replace(/^\/+/, "/"), baseUrl).toString();
  } catch {
    return "";
  }
}

// Optional: improve OG image for Cloudinary flyers (1200x630)
function cloudinaryOg(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const m = u.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i,
  );
  if (!m) return u;

  const rest = m[2].replace(/^\/+/, "");
  const firstSeg = rest.split("/")[0] || "";
  const alreadyHasTransform =
    /^(c_|w_|h_|ar_|g_|q_|f_)/i.test(firstSeg) || firstSeg.includes(",");

  if (alreadyHasTransform) return u;

  const transform = "f_jpg,q_auto:eco,c_fill,g_auto,w_1200,h_630";
  return `${m[1]}${transform}/${rest}`;
}

// ---- Request classification (avoid hijacking API routes) ----
function isAssetRequest(reqPath) {
  return path.extname(reqPath || "") !== "";
}

function looksLikeApiRequest(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  if (accept.includes("application/json")) return true;
  if (req.headers["x-requested-with"]) return true; // XHR
  return false;
}

function isApiPath(reqPath) {
  const p = String(reqPath || "");
  return (
    p.startsWith("/auth") ||
    p.startsWith("/me") ||
    p.startsWith("/admin") ||
    p.startsWith("/api") ||
    p.startsWith("/webhooks") ||
    p.startsWith("/purchase") ||
    p.startsWith("/rategen") ||
    p.startsWith("/rategen-v2") ||
    p.startsWith("/helpbot") ||
    p.startsWith("/freebies") ||
    p.startsWith("/projects") ||
    // IMPORTANT: your ptrainings API endpoints
    p.startsWith("/ptrainings/events") ||
    p.startsWith("/ptrainings/enrollments") ||
    p.startsWith("/ptrainings/enrollment")
  );
}

// Only serve injected HTML for real document requests
function shouldServeInjectedHtml(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (isAssetRequest(req.path)) return false;
  if (looksLikeApiRequest(req)) return false;
  if (isApiPath(req.path)) return false;
  return true;
}

// Rewrite tags safely (no placeholders needed)
function rewriteTag(html, { type, key, value }) {
  const v = escapeHtml(value);

  // <title>...</title>
  if (type === "title") {
    if (/<title>.*?<\/title>/is.test(html)) {
      return html.replace(/<title>.*?<\/title>/is, `<title>${v}</title>`);
    }
    return html.replace(/<\/head>/i, `<title>${v}</title>\n</head>`);
  }

  // <meta name="description" ...>
  if (type === "metaName") {
    const re = new RegExp(`<meta\\s+[^>]*name=["']${key}["'][^>]*>`, "i");
    const tag = `<meta name="${key}" content="${v}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }

  // <meta property="og:..." ...>
  if (type === "metaProp") {
    const re = new RegExp(`<meta\\s+[^>]*property=["']${key}["'][^>]*>`, "i");
    const tag = `<meta property="${key}" content="${v}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }

  // <link rel="canonical" ...>
  if (type === "canonical") {
    const re = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
    const tag = `<link rel="canonical" href="${v}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }

  return html;
}

function injectMeta(html, meta) {
  let out = html;

  out = rewriteTag(out, { type: "title", value: meta.title });
  out = rewriteTag(out, {
    type: "metaName",
    key: "description",
    value: meta.description,
  });
  out = rewriteTag(out, { type: "canonical", value: meta.url });

  // OG
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:title",
    value: meta.title,
  });
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:description",
    value: meta.description,
  });
  out = rewriteTag(out, { type: "metaProp", key: "og:url", value: meta.url });
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:image",
    value: meta.image,
  });
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:image:secure_url",
    value: meta.image,
  });

  // Twitter
  out = rewriteTag(out, {
    type: "metaName",
    key: "twitter:title",
    value: meta.title,
  });
  out = rewriteTag(out, {
    type: "metaName",
    key: "twitter:description",
    value: meta.description,
  });
  out = rewriteTag(out, {
    type: "metaName",
    key: "twitter:image",
    value: meta.image,
  });

  return out;
}

function resolvePTrainingSlug(reqPath) {
  // Match /ptrainings/:slug but exclude API segments
  const m = String(reqPath || "").match(/^\/ptrainings\/([^/]+)\/?$/i);
  if (!m) return "";
  const slug = decodeURIComponent(m[1] || "");
  const reserved = new Set([
    "events",
    "enrollments",
    "enrollment",
    "admin",
    "api",
  ]);
  if (reserved.has(String(slug).toLowerCase())) return "";
  return slug;
}

async function resolveMeta(req) {
  const baseUrl = getBaseUrl(req);

  const cleanPath = String(req.originalUrl || "").split("?")[0] || "/";
  const pageUrl = new URL(cleanPath, baseUrl).toString();

  // Defaults
  let meta = {
    title: "ADLM Studio",
    description: "BIM Training, QS Tools, and Digital Construction Solutions.",
    url: pageUrl,
    image: new URL("/og-default.jpg", baseUrl).toString(),
  };

  // ✅ Physical training detail: /ptrainings/:slug (use flyer as OG image)
  const slug = resolvePTrainingSlug(req.path);
  if (slug) {
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

    const chosen = training?.ogImageUrl || training?.flyerUrl || meta.image;

    let image = absolutizeUrl(chosen, baseUrl) || meta.image;

    // If flyer is Cloudinary, make it a proper social card size
    image = cloudinaryOg(image) || image;

    meta = { ...meta, title, description, url: pageUrl, image };
    return meta;
  }

  // ✅ Listing page: /ptrainings
  if (/^\/ptrainings\/?$/i.test(req.path)) {
    meta.title = "ADLM Physical Trainings | ADLM Studio";
    meta.description =
      "Explore and register for upcoming ADLM physical trainings.";
    return meta;
  }

  return meta;
}

export function registerDynamicMetaRoutes(app) {
  app.get(/.*/, async (req, res, next) => {
    try {
      if (!shouldServeInjectedHtml(req)) return next();

      const template = readIndexHtml();
      const meta = await resolveMeta(req);
      const html = injectMeta(template, meta);

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .set("Cache-Control", "public, max-age=300")
        .send(html);
    } catch (err) {
      next(err);
    }
  });
}
