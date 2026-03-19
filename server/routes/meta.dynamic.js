// server/routes/meta.dynamic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TrainingEvent } from "../models/TrainingEvent.js";
import { Product } from "../models/Product.js";
import { ensureDb } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use built index.html as template
const INDEX_HTML_PATH = process.env.INDEX_HTML_PATH
  ? path.resolve(process.env.INDEX_HTML_PATH)
  : path.resolve(__dirname, "../../client/dist/index.html");

// Cache index.html in memory
let _cachedHtml = null;
let _cachedMtimeMs = 0;

function indexHtmlExists() {
  try {
    return fs.existsSync(INDEX_HTML_PATH);
  } catch {
    return false;
  }
}

function readIndexHtmlSafe() {
  if (!indexHtmlExists()) return null;

  try {
    const stat = fs.statSync(INDEX_HTML_PATH);
    if (!_cachedHtml || stat.mtimeMs !== _cachedMtimeMs) {
      _cachedHtml = fs.readFileSync(INDEX_HTML_PATH, "utf8");
      _cachedMtimeMs = stat.mtimeMs;
    }
    return _cachedHtml;
  } catch {
    return null;
  }
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

/* -------------------- Request classification -------------------- */

function isAssetRequest(reqPath) {
  return path.extname(reqPath || "") !== "";
}

function isApiPath(reqPath) {
  const p = String(reqPath || "");

  // Block server API prefixes that conflict with client routes.
  // Note: /product/:key (singular) is safe — no server route for it.
  // /products, /learn, /trainings are server API routes that respond with JSON
  // before this middleware runs, so we block them here.
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
    p.startsWith("/coupons") ||
    p.startsWith("/showcase") ||
    // These exact paths have server API handlers that respond first
    p === "/products" ||
    p === "/learn" ||
    p === "/trainings" ||
    // Project API routes (but NOT /projects/shared/* which is public)
    (p.startsWith("/projects") && !p.startsWith("/projects/shared")) ||
    // ptrainings API endpoints (keep)
    p.startsWith("/ptrainings/events") ||
    p.startsWith("/ptrainings/enrollments") ||
    p.startsWith("/ptrainings/enrollment")
  );
}

// Known social-media / messaging crawler bots that fetch OG tags
const BOT_UA_RE =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|googlebot|bingbot|baiduspider|yandexbot|duckduckbot|applebot|pinterestbot|redditbot|skypeuripreview|embedly|quora link preview|outbrain|vkshare|tumblr|bitlybot|flipboard|nuzzel|W3C_Validator/i;

function isCrawlerBot(req) {
  const ua = String(req.headers["user-agent"] || "");
  return BOT_UA_RE.test(ua);
}

// Only serve injected HTML for real document navigations or crawler bots
function isDocumentNavigation(req) {
  // Always serve to known crawler bots (they need OG tags)
  if (isCrawlerBot(req)) return true;

  const accept = String(req.headers.accept || "").toLowerCase();
  const secFetchDest = String(
    req.headers["sec-fetch-dest"] || "",
  ).toLowerCase();

  if (secFetchDest && secFetchDest !== "document") return false;
  if (!accept.includes("text/html")) return false;

  return true;
}

// Allow-list which page routes get OG injection
function isAllowedHtmlPath(reqPath) {
  const p = String(reqPath || "");
  return (
    p === "/" ||
    // Products
    /^\/products\/?$/i.test(p) ||
    /^\/product\/[^/]+\/?$/i.test(p) ||
    // Courses / Learn
    /^\/learn\/?$/i.test(p) ||
    /^\/learn\/course\/[^/]+\/?$/i.test(p) ||
    /^\/learn\/free\/[^/]+\/?$/i.test(p) ||
    // Physical trainings
    /^\/ptrainings\/?$/i.test(p) ||
    /^\/ptrainings\/[^/]+\/?$/i.test(p) ||
    // Online trainings
    /^\/trainings\/?$/i.test(p) ||
    /^\/trainings\/[^/]+\/?$/i.test(p) ||
    // Static pages
    /^\/about\/?$/i.test(p) ||
    /^\/support\/?$/i.test(p) ||
    /^\/testimonials\/?$/i.test(p) ||
    // Public shared project dashboard
    /^\/projects\/shared\/[^/]+\/?$/i.test(p) ||
    // RateGen
    /^\/rategen\/?$/i.test(p) ||
    // Dashboard (generic)
    /^\/dashboard\/?$/i.test(p) ||
    // Profile
    /^\/profile\/?$/i.test(p) ||
    // Login / Signup
    /^\/login\/?$/i.test(p) ||
    /^\/signup\/?$/i.test(p)
  );
}

function shouldServeInjectedHtml(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!indexHtmlExists()) return false;
  if (isAssetRequest(req.path)) return false;
  if (isApiPath(req.path)) return false;
  if (!isAllowedHtmlPath(req.path)) return false;
  if (!isDocumentNavigation(req)) return false;
  return true;
}

/* -------------------- HTML tag rewriting -------------------- */

function rewriteTag(html, { type, key, value }) {
  const v = escapeHtml(value);

  if (type === "title") {
    if (/<title>.*?<\/title>/is.test(html)) {
      return html.replace(/<title>.*?<\/title>/is, `<title>${v}</title>`);
    }
    return html.replace(/<\/head>/i, `<title>${v}</title>\n</head>`);
  }

  if (type === "metaName") {
    const re = new RegExp(`<meta\\s+[^>]*name=["']${key}["'][^>]*>`, "i");
    const tag = `<meta name="${key}" content="${v}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }

  if (type === "metaProp") {
    const re = new RegExp(`<meta\\s+[^>]*property=["']${key}["'][^>]*>`, "i");
    const tag = `<meta property="${key}" content="${v}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }

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
  if (meta.imageWidth) {
    out = rewriteTag(out, { type: "metaProp", key: "og:image:width", value: String(meta.imageWidth) });
    out = rewriteTag(out, { type: "metaProp", key: "og:image:height", value: String(meta.imageHeight) });
  }

  // Twitter
  out = rewriteTag(out, {
    type: "metaName",
    key: "twitter:card",
    value: meta.twitterCard || "summary",
  });
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

/* -------------------- Path extractors -------------------- */

function extractSlug(reqPath, prefix) {
  const re = new RegExp(`^\\/${prefix}\\/([^/]+)\\/?$`, "i");
  const m = String(reqPath || "").match(re);
  if (!m) return "";
  const slug = decodeURIComponent(m[1] || "");
  const reserved = new Set(["events", "enrollments", "enrollment", "admin", "api"]);
  if (reserved.has(slug.toLowerCase())) return "";
  return slug;
}

/* -------------------- Meta resolution -------------------- */

async function resolveMeta(req) {
  const baseUrl = getBaseUrl(req);
  const cleanPath = String(req.originalUrl || "").split("?")[0] || "/";
  const pageUrl = new URL(cleanPath, baseUrl).toString();
  const defaultImage = new URL("/Logo.png", baseUrl).toString();

  // Defaults (ADLM Logo for any page without a specific image)
  let meta = {
    title: "ADLM Studio",
    description: "BIM Training, QS Tools, and Digital Construction Solutions.",
    url: pageUrl,
    image: defaultImage,
    twitterCard: "summary", // square logo → use "summary"; pages with landscape images override to "summary_large_image"
    imageWidth: 771,
    imageHeight: 646,
  };

  try {
    await ensureDb();
  } catch {
    return meta;
  }

  const p = req.path;

  // ── Home ──
  if (p === "/") {
    meta.title = "ADLM Studio | BIM Training & QS Tools";
    return meta;
  }

  // ── Product detail: /product/:key ──
  const productKey = extractSlug(p, "product");
  if (productKey) {
    const product = await Product.findOne({ key: productKey })
      .select("name blurb thumbnailUrl images")
      .lean();
    if (product) {
      meta.title = product.name
        ? `${product.name} | ADLM Studio`
        : "Product | ADLM Studio";
      meta.description = truncate(product.blurb || product.name || "ADLM Studio product");
      const img = product.thumbnailUrl || (product.images && product.images[0]) || "";
      if (img) {
        meta.image = cloudinaryOg(absolutizeUrl(img, baseUrl)) || meta.image;
        meta.twitterCard = "summary_large_image";
        meta.imageWidth = 1200;
        meta.imageHeight = 630;
      }
    }
    return meta;
  }

  // ── Products listing ──
  if (/^\/products\/?$/i.test(p)) {
    meta.title = "Products | ADLM Studio";
    meta.description = "Explore ADLM Studio software products for BIM, QS, and construction workflows.";
    return meta;
  }

  // ── Physical training detail: /ptrainings/:slug ──
  const ptSlug = extractSlug(p, "ptrainings");
  if (ptSlug) {
    const training = await TrainingEvent.findOne({ slug: ptSlug })
      .select("title subtitle description flyerUrl ogImageUrl")
      .lean();
    if (training) {
      meta.title = training.title
        ? `${training.title} | ADLM Studio`
        : "Physical Training | ADLM Studio";
      meta.description = truncate(
        training.subtitle || training.description || "Register for ADLM Physical Training.",
      );
      const img = training.ogImageUrl || training.flyerUrl || "";
      if (img) {
        meta.image = cloudinaryOg(absolutizeUrl(img, baseUrl)) || meta.image;
        meta.twitterCard = "summary_large_image";
        meta.imageWidth = 1200;
        meta.imageHeight = 630;
      }
    }
    return meta;
  }

  // ── Physical trainings listing ──
  if (/^\/ptrainings\/?$/i.test(p)) {
    meta.title = "Physical Trainings | ADLM Studio";
    meta.description = "Explore and register for upcoming ADLM physical trainings.";
    return meta;
  }

  // ── Online training detail: /trainings/:id ──
  const trainingId = extractSlug(p, "trainings");
  if (trainingId) {
    meta.title = "Online Training | ADLM Studio";
    meta.description = "Join ADLM online training courses for BIM and construction professionals.";
    return meta;
  }

  // ── Trainings listing ──
  if (/^\/trainings\/?$/i.test(p)) {
    meta.title = "Trainings | ADLM Studio";
    meta.description = "Browse ADLM training programs for BIM and construction industry professionals.";
    return meta;
  }

  // ── Course detail: /learn/course/:sku ──
  const courseSku = extractSlug(p, "learn\\/course");
  if (courseSku) {
    // Try to load from Product model (courses are products with isCourse=true)
    const course = await Product.findOne({ key: courseSku })
      .select("name blurb thumbnailUrl images")
      .lean();
    if (course) {
      meta.title = course.name
        ? `${course.name} | ADLM Studio`
        : "Course | ADLM Studio";
      meta.description = truncate(course.blurb || course.name || "ADLM Studio course");
      const img = course.thumbnailUrl || (course.images && course.images[0]) || "";
      if (img) {
        meta.image = cloudinaryOg(absolutizeUrl(img, baseUrl)) || meta.image;
        meta.twitterCard = "summary_large_image";
        meta.imageWidth = 1200;
        meta.imageHeight = 630;
      }
    }
    return meta;
  }

  // ── Free video: /learn/free/:id ──
  if (/^\/learn\/free\/[^/]+\/?$/i.test(p)) {
    meta.title = "Free Learning | ADLM Studio";
    meta.description = "Watch free BIM and construction tutorials from ADLM Studio.";
    return meta;
  }

  // ── Learn listing ──
  if (/^\/learn\/?$/i.test(p)) {
    meta.title = "Learn | ADLM Studio";
    meta.description = "Free tutorials and paid courses for BIM, Revit, and construction professionals.";
    return meta;
  }

  // ── Public shared project dashboard: /projects/shared/:token ──
  if (/^\/projects\/shared\/[^/]+\/?$/i.test(p)) {
    meta.title = "Shared Project Dashboard | ADLM Studio";
    meta.description = "View project progress, cost summary, and delivery status — shared via ADLM Studio.";
    return meta;
  }

  // ── Static pages ──
  if (/^\/about\/?$/i.test(p)) {
    meta.title = "About | ADLM Studio";
    meta.description = "Learn about ADLM Studio — BIM training, QS tools, and digital construction solutions.";
    return meta;
  }
  if (/^\/support\/?$/i.test(p)) {
    meta.title = "Support | ADLM Studio";
    meta.description = "Get help with ADLM Studio products, subscriptions, and training courses.";
    return meta;
  }
  if (/^\/testimonials\/?$/i.test(p)) {
    meta.title = "Testimonials | ADLM Studio";
    meta.description = "See what BIM and construction professionals say about ADLM Studio tools and training.";
    return meta;
  }
  if (/^\/login\/?$/i.test(p)) {
    meta.title = "Sign In | ADLM Studio";
    meta.description = "Sign in to your ADLM Studio account.";
    return meta;
  }
  if (/^\/signup\/?$/i.test(p)) {
    meta.title = "Create Account | ADLM Studio";
    meta.description = "Create your free ADLM Studio account for BIM training and QS tools.";
    return meta;
  }
  if (/^\/dashboard\/?$/i.test(p)) {
    meta.title = "Dashboard | ADLM Studio";
    meta.description = "Your ADLM Studio dashboard — manage subscriptions, products, and courses.";
    return meta;
  }
  if (/^\/profile\/?$/i.test(p)) {
    meta.title = "Profile | ADLM Studio";
    meta.description = "Manage your ADLM Studio profile settings.";
    return meta;
  }
  if (/^\/rategen\/?$/i.test(p)) {
    meta.title = "RateGen | ADLM Studio";
    meta.description = "RateGen — construction rate generation and cost estimation tool by ADLM Studio.";
    return meta;
  }

  return meta;
}

/* -------------------- Export registration -------------------- */

export function registerDynamicMetaRoutes(app) {
  app.get(/.*/, async (req, res, next) => {
    try {
      if (!shouldServeInjectedHtml(req)) return next();

      const template = readIndexHtmlSafe();
      if (!template) return next();

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
