// api/meta.js (Vercel)
import fs from "node:fs";
import path from "node:path";

const INDEX_CANDIDATES = [
  process.env.INDEX_HTML_PATH,
  path.join(process.cwd(), "dist", "index.html"),
  path.join(process.cwd(), "client", "dist", "index.html"),
].filter(Boolean);

let cachedHtml = null;
let cachedMtime = 0;
let cachedPath = null;

function findIndexHtmlPath() {
  for (const p of INDEX_CANDIDATES) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // Ignore file system access issues while probing candidate index files.
    }
  }
  return null;
}

function readIndexHtml() {
  const p = findIndexHtmlPath();
  if (!p) throw new Error("index.html not found. Set INDEX_HTML_PATH env var.");

  const stat = fs.statSync(p);
  if (!cachedHtml || cachedMtime !== stat.mtimeMs || cachedPath !== p) {
    cachedHtml = fs.readFileSync(p, "utf8");
    cachedMtime = stat.mtimeMs;
    cachedPath = p;
  }
  return cachedHtml;
}

function escapeHtml(s) {
  return String(s ?? "")
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
  const proto = xfProto || "https";
  const host = req.headers.host;
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

// Force Cloudinary OG size + JPG (WhatsApp likes JPG more than webp)
function toOgImage(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  if (!/res\.cloudinary\.com/i.test(u) || !/\/image\/upload\//i.test(u))
    return u;

  const parts = u.split("/upload/");
  if (parts.length !== 2) return u;

  const transform = "f_jpg,q_auto:eco,c_fill,g_auto,w_1200,h_630";
  return `${parts[0]}/upload/${transform}/${parts[1]}`;
}

// ---- rewrite helpers (no placeholders needed) ----
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

  // Optional: help scrapers
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:image:width",
    value: "1200",
  });
  out = rewriteTag(out, {
    type: "metaProp",
    key: "og:image:height",
    value: "630",
  });

  return out;
}

/**
 * Descriptions for the pages that have no record behind them.
 *
 * These are what a link to the site shows in WhatsApp, LinkedIn and Google.
 * <Seo> sets the same values client-side for Google's benefit, but a social
 * scraper never runs JavaScript — it reads the HTML this file produces and
 * nothing else. So the two have to be kept saying the same thing.
 */
const STATIC_META = {
  "/": {
    title: "BIM & Quantity Surveying Software for Construction Firms | ADLM Studio",
    description:
      "ADLM Studio builds BIM takeoff, rate build-up and cost management tools for quantity surveyors, and trains the firms that use them. Revit, ArchiCAD and PlanSwift plugins built for the Nigerian market.",
  },
  "/products": {
    title: "Products — BIM Plugins & QS Software | ADLM Studio",
    description:
      "Quantity takeoff plugins for Revit, ArchiCAD and PlanSwift, automated rate build-ups and cost management tools. Subscription pricing in naira, built for Nigerian quantity surveyors.",
  },
  "/about": {
    title: "About ADLM Studio",
    description:
      "A Nigerian ConTech studio digitising quantity surveying end to end — takeoff, rates, bills, programmes and dashboards — with the training and process firms need to adopt it. 800+ AEC professionals trained since 2019.",
  },
  "/learn": {
    title: "Learn — BIM & QS Training Courses | ADLM Studio",
    description:
      "Self-paced and cohort BIM training for quantity surveyors: Revit, Navisworks, MS Project, Power BI, 4D and 5D BIM, and AI for cost management.",
  },
  "/trainings": {
    title: "Training & Events | ADLM Studio",
    description:
      "Upcoming ADLM Studio BIM and quantity surveying training, in person and online. Corporate programmes for QS firms and contractors across Nigeria.",
  },
  "/freebies": {
    title: "Free QS & BIM Resources | ADLM Studio",
    description:
      "Free templates, tools and resources for quantity surveyors — rate templates, BoQ formats and BIM starter files.",
  },
  "/testimonials": {
    title: "Testimonials | ADLM Studio",
    description:
      "What quantity surveyors and construction firms say about working with ADLM Studio.",
  },
  "/whats-new": {
    title: "What's New | ADLM Studio",
    description:
      "Release notes for the ADLM plugin suite and cloud platform — what shipped, when, and what changed.",
  },
  "/support": {
    title: "Support | ADLM Studio",
    description: "Get help with ADLM plugins, licensing and installation.",
  },
  "/quote": {
    title: "Request a Quote | ADLM Studio",
    description:
      "Tell us about your firm and we will price the tools, training and process to suit it.",
  },
};

async function fetchJson(url, ms = 2500) {
  // Every one of these runs inside a request the visitor is waiting on, and a
  // scraper will not wait long. A slow API must degrade to the generic card
  // rather than hold the page — the preview is worth less than the page.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMeta({ baseUrl, pathname }) {
  const cleanPath = String(pathname || "/");
  const canonical = new URL(cleanPath, baseUrl).toString();
  const API_BASE = String(process.env.VITE_API_BASE || "").trim().replace(/\/+$/, "");

  let meta = {
    title: "ADLM Studio",
    description: "BIM Training, QS Tools, and Digital Construction Solutions.",
    url: canonical,
    image: new URL("/og-default.jpg", baseUrl).toString(),
  };

  // Pages with no record behind them.
  const stat = STATIC_META[cleanPath.replace(/\/+$/, "") || "/"];
  if (stat) meta = { ...meta, ...stat };

  // /product/:key — the commercially important one. A shared product link
  // should show that product's own artwork, not the house card.
  const productMatch = cleanPath.match(/^\/product\/([^/]+)\/?$/i);
  if (productMatch && API_BASE) {
    const key = decodeURIComponent(productMatch[1]);
    const p = await fetchJson(`${API_BASE}/products/${encodeURIComponent(key)}`);
    if (p?.name) {
      const price = p?.price?.monthlyNGN || p?.price?.yearlyNGN;
      const cadence = p?.price?.monthlyNGN ? "month" : "year";
      meta = {
        ...meta,
        title: `${p.name} | ADLM Studio`,
        description:
          truncate(p.blurb || p.description, 180) ||
          `${p.name} from ADLM Studio${price ? ` — from NGN ${Number(price).toLocaleString()} per ${cadence}` : ""}.`,
        image: toOgImage(absolutizeUrl(p.thumbnailUrl, baseUrl)) || meta.image,
      };
    }
  }

  // /whats-new/:slug — the slug is the product line the notes belong to.
  const changelogMatch = cleanPath.match(/^\/whats-new\/([^/]+)\/?$/i);
  if (changelogMatch) {
    const slug = decodeURIComponent(changelogMatch[1]);
    // Product names are not title-case-able from their slugs — "rategen"
    // would come out "Rategen" and QUIV would lose its capitals entirely.
    const NAMES = {
      rategen: "ADLM RateGen",
      quiv: "QUIV",
      heron: "Heron",
      mep: "ADLM MEP Plugin",
      timepro: "ADLM TimePro",
      civiq: "CiviQ",
      cloud: "ADLM Cloud",
      hub: "ADLM Installer Hub",
      courses: "ADLM Courses",
    };
    const pretty =
      NAMES[slug.toLowerCase()] ||
      slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    meta = {
      ...meta,
      title: `${pretty} — What's New | ADLM Studio`,
      description: `Release notes for ${pretty}: what shipped, when, and what changed.`,
    };
  }

  // /ptrainings/:slug
  const m = cleanPath.match(/^\/ptrainings\/([^/]+)\/?$/i);
  if (m) {
    const slug = decodeURIComponent(m[1]);

    // Uses the API_BASE resolved at the top of this function, and the shared
    // fetchJson so this path gets the same timeout as the others — an
    // unbounded fetch here would hold the whole page render.
    if (API_BASE) {
      try {
        const j = await fetchJson(
          `${API_BASE}/ptrainings/events/${encodeURIComponent(slug)}`,
        );

        const title = j?.title
          ? `${j.title} | ADLM Studio`
          : "ADLM Physical Training | ADLM Studio";
        const description =
          truncate(
            j?.subtitle ||
              j?.description ||
              "Register for ADLM Physical Training.",
            180,
          ) || "Register for ADLM Physical Training.";

        const chosen = j?.ogImageUrl || j?.flyerUrl || meta.image;
        const abs = absolutizeUrl(chosen, baseUrl) || meta.image;

        meta = {
          ...meta,
          title,
          description,
          url: canonical,
          image: toOgImage(abs),
        };
      } catch {
        // keep defaults
      }
    }
  }

  if (/^\/ptrainings\/?$/i.test(cleanPath)) {
    meta.title = "ADLM Physical Trainings | ADLM Studio";
    meta.description =
      "Explore and register for upcoming ADLM physical trainings.";
  }

  return meta;
}

export default async function handler(req, res) {
  try {
    const baseUrl = getBaseUrl(req);

    const full = new URL(req.url, baseUrl);
    const pathname = full.searchParams.get("path") || "/";

    const template = readIndexHtml();
    const meta = await resolveMeta({ baseUrl, pathname });

    const html = injectMeta(template, meta);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=0");
    res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Meta render error: ${e?.message || "Unknown error"}`);
  }
}

