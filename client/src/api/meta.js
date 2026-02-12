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
    } catch {}
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

async function resolveMeta({ baseUrl, pathname }) {
  const cleanPath = String(pathname || "/");
  const canonical = new URL(cleanPath, baseUrl).toString();

  let meta = {
    title: "ADLM Studio",
    description: "BIM Training, QS Tools, and Digital Construction Solutions.",
    url: canonical,
    image: new URL("/og-default.jpg", baseUrl).toString(),
  };

  // /ptrainings/:slug
  const m = cleanPath.match(/^\/ptrainings\/([^/]+)\/?$/i);
  if (m) {
    const slug = decodeURIComponent(m[1]);

    const API_BASE = String(process.env.VITE_API_BASE || "").trim();
    if (API_BASE) {
      try {
        const r = await fetch(
          `${API_BASE.replace(/\/+$/, "")}/ptrainings/events/${encodeURIComponent(slug)}`,
          { headers: { accept: "application/json" } },
        );
        const j = await r.json();

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
