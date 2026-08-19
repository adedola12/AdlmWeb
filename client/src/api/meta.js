// api/meta.js (Vercel)
import fs from "node:fs";
import path from "node:path";
import { isSsrPath } from "../lib/ssrPaths.js";
import { PAGE_META, fullTitle } from "../lib/pageMeta.js";

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

/**
 * Put the rendered app inside the shell.
 *
 * The div is matched empty because that is exactly how Vite emits it. If the
 * markup ever changes shape this returns the html untouched, which degrades to
 * the client-only shell rather than producing a broken page.
 */
function injectBody(html, bodyHtml, preload) {
  const ROOT = /<div id="root">\s*<\/div>/i;
  if (!ROOT.test(html)) return html;

  // __ADLM_SSR__ tells main.jsx to hydrate rather than mount from scratch, and
  // useHydrated() to hold session-dependent UI back for one frame.
  //
  // The </script> escape matters: any product blurb containing that string
  // would otherwise close this tag early and inject the rest as markup.
  const payload = JSON.stringify(preload || {}).replace(/</g, "\\u003c");

  return html.replace(
    ROOT,
    `<div id="root">${bodyHtml}</div>\n` +
      `<script>window.__ADLM_SSR__=true;window.__ADLM_PRELOAD__=${payload};</script>`,
  );
}

/**
 * JSON-LD collected during the render, as script tags a crawler can read.
 *
 * The data-seo attribute is not decoration. <Seo> writes the same blocks from
 * an effect after hydration, and it clears the old ones by querying exactly
 * that attribute. Without it the server's copies are invisible to that cleanup
 * and the page ends up carrying every block twice — which describes a page
 * with two of everything and is the kind of thing Google penalises rather than
 * ignores. Tagging them here makes the client replace ours instead of adding to
 * them.
 */
function injectJsonLd(html, blocks) {
  if (!blocks?.length) return html;

  const tags = blocks
    .map(
      (block) =>
        `<script type="application/ld+json" data-seo="1">${JSON.stringify(
          block,
        ).replace(/</g, "\\u003c")}</script>`,
    )
    .join("\n");

  return html.replace(/<\/head>/i, `${tags}\n</head>`);
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
 * The strings themselves live in src/lib/pageMeta.js because <Seo> renders the
 * same ones in the browser. They used to be duplicated here, and duplicated
 * copy drifts: the page ended up telling a crawler one thing and a social
 * scraper another. One import, one source, no drift.
 */
const STATIC_META = Object.fromEntries(
  Object.entries(PAGE_META).map(([routePath, entry]) => [
    routePath,
    { title: fullTitle(entry.title), description: entry.description },
  ]),
);

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
  // Defaulted rather than left empty. Without the fallback this function
  // silently skipped every database-backed title whenever the env var was not
  // set — which is the case locally and in any preview deployment that did not
  // copy it, so product pages looked correct in production and generic
  // everywhere they were tested.
  const API_BASE = String(
    process.env.VITE_API_BASE || "https://api.adlmstudio.net",
  )
    .trim()
    .replace(/\/+$/, "");

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
      title: `${pretty}: What's New | ADLM Studio`,
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

/**
 * Load the compiled server bundle, once per instance.
 *
 * Imported lazily and defensively: if the SSR build is missing or fails to
 * load, every route keeps working as the client-rendered shell it was before
 * any of this existed. That is the whole safety story — a broken server render
 * costs the page its crawlability, never its availability.
 */
let ssrModule;
let ssrLoadFailed = false;

async function loadSsr() {
  if (ssrModule || ssrLoadFailed) return ssrModule;
  try {
    ssrModule = await import("../../dist-ssr/entry-server.js");
  } catch (e) {
    ssrLoadFailed = true;
    console.error("[ssr] server bundle unavailable:", e?.message || e);
  }
  return ssrModule;
}

export default async function handler(req, res) {
  try {
    const baseUrl = getBaseUrl(req);

    const full = new URL(req.url, baseUrl);
    const pathname = full.searchParams.get("path") || "/";

    const template = readIndexHtml();
    let meta = await resolveMeta({ baseUrl, pathname });

    // Body render. Everything past this point is best-effort: any failure
    // leaves the shell, which already carries correct <head> tags.
    let statusCode = 200;
    let bodyHtml = null;
    let preload;
    let jsonLd;

    // Gated on the explicit list, not on whether the router finds a match.
    // Every app route — dashboard, admin, projects, login — falls straight
    // through to the client shell it has always been served.
    const ssr = isSsrPath(pathname) ? await loadSsr() : null;
    if (ssr?.render) {
      const rendered = await ssr.render(new URL(pathname, baseUrl).toString());
      if (rendered?.html) {
        bodyHtml = rendered.html;
        preload = rendered.preload;
        jsonLd = rendered.head?.jsonLd;

        // The page's own <Seo> wins over the table above. A page knows things
        // this function cannot — a product's real name, a changelog's product
        // line — and having rendered it, we have those values to hand. The
        // table stays as the fallback for anything that sets no <Seo> at all.
        meta = {
          ...meta,
          ...(rendered.head?.title ? { title: rendered.head.title } : {}),
          ...(rendered.head?.description
            ? { description: rendered.head.description }
            : {}),
        };

        // Only server-rendered routes can be judged this way. A path the server
        // does not know is left at 200 for the client router to handle, which
        // is how every app route still works.
        if (rendered.notFound) statusCode = 404;
      }
    }

    let html = injectMeta(template, meta);
    if (bodyHtml) {
      html = injectBody(html, bodyHtml, preload);
      html = injectJsonLd(html, jsonLd);
    }

    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=0");
    res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Meta render error: ${e?.message || "Unknown error"}`);
  }
}

