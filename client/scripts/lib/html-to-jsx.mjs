// HTML -> JSX for the design-system port.
//
// Handles exactly the shapes that appear in RichardEnoch/adlm-studio-site: the
// attribute inventory across all 51 of his pages plus index.html is class, d,
// href, viewBox, id, stroke*, fill*, style, src, alt, type, aria-*, data-*,
// name, for, r/cx/cy/x/y/rx, xmlns, loading, width, height, scope, placeholder,
// autocomplete, value, method, action.
//
// Two things it deliberately does NOT try to be: a general-purpose HTML parser,
// and clever. It is a tokenizer over well-formed markup that we control, and it
// throws rather than guessing when it meets something unexpected — a silently
// mangled page is far more expensive than a failed build.

import { resolveHref } from "../../src/lib/dsRoutes.js";

// Elements that cannot have children and must be self-closed in JSX.
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

// Attribute renames. Anything kebab-cased that React expects camel-cased; data-*
// and aria-* are passed through untouched because React accepts them verbatim.
const ATTR = {
  class: "className",
  for: "htmlFor",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-opacity": "strokeOpacity",
  "stroke-miterlimit": "strokeMiterlimit",
  "fill-rule": "fillRule",
  "fill-opacity": "fillOpacity",
  "clip-rule": "clipRule",
  "clip-path": "clipPath",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "gradientUnits": "gradientUnits",
  "text-anchor": "textAnchor",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-family": "fontFamily",
  "letter-spacing": "letterSpacing",
  "dominant-baseline": "dominantBaseline",
  "xlink:href": "href",
  colspan: "colSpan",
  rowspan: "rowSpan",
  maxlength: "maxLength",
  minlength: "minLength",
  readonly: "readOnly",
  tabindex: "tabIndex",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  novalidate: "noValidate",
  enctype: "encType",
  srcset: "srcSet",
  crossorigin: "crossOrigin",
  "accept-charset": "acceptCharset",
  contenteditable: "contentEditable",
  spellcheck: "spellCheck",
  "http-equiv": "httpEquiv",
};

// Attributes that are booleans in HTML but need `={true}` in JSX when valueless.
const BOOLEAN = new Set([
  "checked", "disabled", "readOnly", "required", "selected", "multiple",
  "autoFocus", "noValidate", "hidden", "open", "controls", "loop", "muted",
  "playsInline", "defer", "async",
]);

// The ten class names renamed by port-ds-css.mjs. Kept in sync by importing
// would be circular (that script imports nothing from here), so it is asserted
// against in the test below instead.
const CLASS_RENAME = {
  grid: "ds-grid",
  btn: "ds-btn",
  "btn-sm": "ds-btn-sm",
  card: "ds-card",
  a: "ds-a",
  accent: "ds-accent",
  lede: "ds-lede",
  sub: "ds-sub",
  fill: "ds-fill",
  field: "ds-field",
};

export function renameClassAttr(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((c) => CLASS_RENAME[c] || c)
    .join(" ");
}

// `style="--i:0;color:red"` -> `{{"--i":"0",color:"red"}}`
// Custom properties MUST stay strings; React writes them through setProperty.
function styleToObject(css) {
  const pairs = [];
  for (const part of css.split(";")) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i < 0) throw new Error(`unparseable style declaration: ${t}`);
    const prop = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    const key = prop.startsWith("--")
      ? JSON.stringify(prop)
      : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    pairs.push(`${key}: ${JSON.stringify(value)}`);
  }
  return `{{ ${pairs.join(", ")} }}`;
}

// Text between tags.
//
// Two escapes: JSX treats { and } as expression delimiters, and a bare > is
// legal in HTML text but not JSX.
//
// The harder problem is whitespace. HTML renders a newline between two inline
// elements as a single space; JSX discards it. His headlines are built from
// one <span class="w"> per word on separate lines, so a naive port rendered
// "We buildfor thework weused todo." Any run of whitespace containing a
// newline is therefore emitted as an explicit {" "}, which restores the HTML
// meaning. Whitespace-only text nodes generate no box in flex or grid
// containers, so this cannot disturb the layouts.
// `@@expr@@` in the source becomes a live JSX expression `{expr}`.
//
// This is how real data gets into a ported page without rewriting his markup.
// Everything around the token stays byte-faithful: his classes, his copy, his
// section order. Only the value that would otherwise go stale is swapped.
const TOKEN = /@@([^@]+)@@/g;

function withTokens(text, escape) {
  if (!TOKEN.test(text)) return escape(text);
  TOKEN.lastIndex = 0;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    out += escape(text.slice(last, m.index));
    out += `{${m[1]}}`;
    last = m.index + m[0].length;
  }
  return out + escape(text.slice(last));
}

function escapeText(text) {
  if (!text) return "";

  const escape = (s) => s.replace(/[{}]/g, (c) => `{"${c}"}`).replace(/>/g, "&gt;");

  // Any whitespace-only run becomes one explicit space. HTML collapses such a
  // run to a single space (and drops it entirely between block boxes, which is
  // still true of {" "}), so this is faithful in both directions — and it has
  // to be explicit because the token now sits alone on its own output line,
  // where JSX would otherwise trim it away.
  if (!text.trim()) return '{" "}';

  const leading = /^\s/.test(text) ? '{" "}' : "";
  const trailing = /\s$/.test(text) ? '{" "}' : "";
  // Collapse internal runs the way HTML would, so the indenting pass below
  // cannot change what the reader sees.
  const core = withTokens(text.trim().replace(/\s+/g, " "), escape);
  return `${leading}${core}${trailing}`;
}

// The page name behind one of his hrefs — "quiv", "pricing#compare" -> "quiv",
// "pricing". Null for in-page anchors, absolute URLs and asset paths.
function hisPageName(href) {
  if (!href || /^(https?:|mailto:|tel:|#|\/)/.test(href)) return null;
  if (/^(assets|docs)\//.test(href)) return null;
  const name = href.split("#")[0].split("?")[0].replace(/\.html$/, "").replace(/\/$/, "");
  return name || null;
}

const ATTR_RE = /([:a-zA-Z_][-:.\w]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>`=]+)))?/g;

function parseAttrs(raw) {
  const out = [];
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1];
    const value = m[3] ?? m[4] ?? m[5] ?? null;
    out.push([name, value]);
  }
  return out;
}

// Render one attribute to JSX source. Returns null to drop it entirely.
function renderAttr(name, value, tag, ctx) {
  const jsxName = ATTR[name] || name;

  if (name === "class") {
    return `className="${renameClassAttr(value)}"`;
  }
  if (name === "style") {
    return `style=${styleToObject(value)}`;
  }
  // A form action is a relative page name in his site ("thanks"). Left alone
  // it would resolve against the current path — submitting at
  // /preview/solutions-firms would try /preview/thanks — so it goes through
  // the route map like any other link. None of these forms has a backend;
  // htmlToJsx records them so the port reports the gap on every run.
  if (name === "action" && tag === "form" && value != null) {
    ctx.backendlessForms.push(value);
    const resolved = resolveHref(value);
    return `action=${JSON.stringify(resolved ?? "/")}`;
  }

  // <a href> and <img src> both run through the route map, which throws on an
  // href it does not know rather than emitting a dead link.
  if ((name === "href" || name === "src") && value != null) {
    // In-page anchors and sprite references are not routes.
    if (value.startsWith("#")) return `${jsxName}="${value}"`;
    const resolved = resolveHref(value);
    if (resolved === null) return null;
    if (tag === "a" && /^\//.test(resolved)) {
      ctx.usesLink = true;
      // Carry his own page name alongside the resolved route.
      //
      // `to` is where the link goes once these pages are promoted, and that
      // mapping involves judgement — his `cart` becomes our `/purchase`, his
      // `account` our `/profile`, and a few of his pages have no app route at
      // all. While the redesign is staged, judgement is exactly what we do NOT
      // want: a link should land where HIS site sends it. data-ds-page records
      // that, so the preview can route with no assumptions at all.
      const page = hisPageName(value);
      return page
        ? `to="${resolved}" data-ds-page="${page}"`
        : `to="${resolved}"`;
    }
    return `${jsxName}="${resolved}"`;
  }
  if (value === null) {
    return BOOLEAN.has(jsxName) ? `${jsxName}={true}` : `${jsxName}=""`;
  }
  // Numeric-only SVG geometry reads better unquoted but is valid either way;
  // keep it a string so nothing depends on JS number formatting.
  return `${jsxName}=${JSON.stringify(value)}`;
}

/**
 * Convert an HTML fragment to a JSX fragment body.
 * @param {string} html
 * @param {{ indent?: number }} [opts]
 * @returns {{ jsx: string, usesLink: boolean }}
 */
export function htmlToJsx(html, opts = {}) {
  const ctx = {
    usesLink: false,
    strayCloses: [],
    impliedCloses: [],
    backendlessForms: [],
  };
  const out = [];
  let i = 0;
  const openStack = [];

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(escapeText(html.slice(i)));
      break;
    }
    if (lt > i) out.push(escapeText(html.slice(i, lt)));

    // Comment
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt);
      if (end < 0) throw new Error("unterminated comment");
      const body = html.slice(lt + 4, end).trim();
      // A comment is only worth carrying over if it says something; the build
      // markers (<!--/promo-->) are meaningless here.
      if (body && !body.startsWith("/")) {
        out.push(`{/* ${body.replace(/\*\//g, "*\\/")} */}`);
      }
      i = end + 3;
      continue;
    }
    // Doctype / processing instruction — not expected inside a body fragment.
    if (html.startsWith("<!", lt)) {
      const end = html.indexOf(">", lt);
      i = end + 1;
      continue;
    }

    // Closing tag
    if (html[lt + 1] === "/") {
      const end = html.indexOf(">", lt);
      const tag = html.slice(lt + 2, end).trim().toLowerCase();
      const top = openStack[openStack.length - 1];

      if (top && top.tag === tag) {
        openStack.pop();
        out.push(`</${top.jsxTag}>`);
        i = end + 1;
        continue;
      }

      // Recover the way a browser's parser does, because his pages were
      // authored against browser behaviour and render correctly there.
      // about.html has two extra </div> (lines 73 and 150); left unhandled
      // they would either abort the port or silently renest the page.
      const depth = openStack.findLastIndex((e) => e.tag === tag);
      if (depth === -1) {
        // Nothing of that name is open — the browser discards the tag.
        ctx.strayCloses.push(tag);
        i = end + 1;
        continue;
      }
      // Something of that name is open further up: implicitly close everything
      // between, which is what the browser does.
      ctx.impliedCloses.push(
        `</${tag}> closed ${openStack.length - depth - 1} unclosed element(s)`,
      );
      while (openStack.length > depth) {
        out.push(`</${openStack.pop().jsxTag}>`);
      }
      i = end + 1;
      continue;
    }

    // Opening tag — find the '>' that is not inside a quoted attribute value.
    let j = lt + 1;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j += 1;
    }
    if (j >= html.length) throw new Error("unterminated tag");

    let inner = html.slice(lt + 1, j);
    const selfClosed = inner.endsWith("/");
    if (selfClosed) inner = inner.slice(0, -1);

    const sp = inner.search(/[\s/]/);
    const tag = (sp < 0 ? inner : inner.slice(0, sp)).toLowerCase();
    const attrsRaw = sp < 0 ? "" : inner.slice(sp);

    // <script> in his pages is the theme bootstrap and the site.js include;
    // both are owned by the app now. Skip the element and its content.
    if (tag === "script" || tag === "style") {
      const close = html.indexOf(`</${tag}>`, j);
      i = close < 0 ? j + 1 : close + tag.length + 3;
      continue;
    }

    const attrs = [];
    for (const [name, value] of parseAttrs(attrsRaw)) {
      const rendered = renderAttr(name, value, tag, ctx);
      if (rendered !== null) attrs.push(rendered);
    }

    // An <a> pointing at an app route becomes a router <Link>.
    const isLink = tag === "a" && attrs.some((a) => a.startsWith("to="));
    const jsxTag = isLink ? "Link" : tag;

    const attrStr = attrs.length ? ` ${attrs.join(" ")}` : "";
    if (VOID.has(tag) || selfClosed) {
      out.push(`<${jsxTag}${attrStr} />`);
    } else {
      out.push(`<${jsxTag}${attrStr}>`);
      openStack.push({ tag, jsxTag });
    }
    i = j + 1;
  }

  // Anything still open at the end is closed, again matching the browser.
  while (openStack.length) {
    const el = openStack.pop();
    ctx.impliedCloses.push(`<${el.tag}> was never closed`);
    out.push(`</${el.jsxTag}>`);
  }

  // Every token can now sit on its own line: all whitespace that HTML would
  // have rendered is carried explicitly by {" "}, so the layout no longer
  // depends on where the line breaks fall.
  const pad = " ".repeat(opts.indent ?? 6);
  let depth = 0;
  const jsx = out
    .filter((t) => t !== "")
    .map((token) => {
      if (/^<\/[a-zA-Z]/.test(token)) depth = Math.max(0, depth - 1);
      const line = pad + "  ".repeat(depth) + token;
      if (/^<[a-zA-Z]/.test(token) && !token.endsWith("/>")) depth += 1;
      return line;
    })
    .join("\n");

  return {
    jsx,
    usesLink: ctx.usesLink,
    strayCloses: ctx.strayCloses,
    impliedCloses: ctx.impliedCloses,
    backendlessForms: ctx.backendlessForms,
  };
}

export default htmlToJsx;
