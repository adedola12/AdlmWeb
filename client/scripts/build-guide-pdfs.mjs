// scripts/build-guide-pdfs.mjs
//
// Builds the downloadable PDF user guides from src/content/guides/*.md, the
// same Markdown the website's guide pages read. One book per guide, plus the
// complete book with every guide in it, written to public/docs/.
//
//   node scripts/build-guide-pdfs.mjs              every guide + the complete book
//   node scripts/build-guide-pdfs.mjs quiv heron   only those guides (no complete book)
//   node scripts/build-guide-pdfs.mjs --html       also keep the print HTML beside each PDF
//
// Printing is done by Microsoft Edge (or Chrome) in headless mode, driven over
// the DevTools protocol with Node's own WebSocket, so the footer can carry
// "page X of Y" and nothing needs installing. Set GUIDE_BROWSER to point at a
// different browser executable.
//
// Screenshots written as ![alt](shot:name.png) are read from
// ADLMInstallerHub/Docs/shots (GUIDE_SHOTS overrides) and embedded, so each
// PDF is one self-contained file.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join, extname } from "node:path";
import { tmpdir } from "node:os";
import { splitFrontMatter, renderGuide } from "./lib/guide-md.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(__dirname, "..");
const SRC = process.env.GUIDE_SRC || join(CLIENT, "src/content/guides");
const OUT = process.env.GUIDE_OUT || join(CLIENT, "public/docs");
const SHOTS = process.env.GUIDE_SHOTS || resolve(CLIENT, "../../ADLMInstallerHub/Docs/shots");
const PUB = join(CLIENT, "public");

const args = process.argv.slice(2);
const KEEP_HTML = args.includes("--html");
const only = args.filter((a) => !a.startsWith("--"));

const BROWSERS = [
  process.env.GUIDE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
const dataUri = (file) =>
  `data:${MIME[extname(file).toLowerCase()] || "application/octet-stream"};base64,${readFileSync(file).toString("base64")}`;

const missingShots = new Set();
function shotSrc(name) {
  const file = join(SHOTS, name);
  if (!existsSync(file)) { missingShots.add(name); return null; }
  return dataUri(file);
}

// Links between guides point into the same book when it is the complete book,
// and to the website otherwise (a PDF has no /guides route of its own).
const SITE = "https://adlmstudio.net";
const linkFor = (inBook) => (href) => {
  const g = href.match(/^\/guides\/([a-z0-9-]+)(#.*)?$/);
  if (g && inBook?.has(g[1])) return g[2] ? `#${g[1]}--${g[2].slice(1)}` : `#${g[1]}`;
  return href.startsWith("/") ? SITE + href : href;
};

function loadGuides() {
  if (!existsSync(SRC)) throw new Error(`No guides folder at ${SRC}`);
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
    .map((f) => {
      const { meta, body } = splitFrontMatter(readFileSync(join(SRC, f), "utf8"));
      const id = meta.id || f.replace(/\.md$/, "");
      return { ...meta, id, body, file: f };
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title));
}

const ICONS = { quiv: "ic-quiv.png", heron: "ic-heron.png", mep: "ic-mep.png", rategen: "ic-rategen.png", civiq: "ic-civiq.png", timepro: "ic-timepro.png", archicad: "ic-quiv.png" };
const iconFor = (id) => {
  const f = ICONS[id] && join(PUB, "ds", ICONS[id]);
  return f && existsSync(f) ? dataUri(f) : null;
};
const LOGO_LIGHT = dataUri(join(PUB, "ds/logo-light.svg"));
const LOGO_DARK = dataUri(join(PUB, "ds/logo-dark.svg"));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const longDate = (d) => {
  const t = d ? new Date(d) : new Date();
  return isNaN(t) ? String(d) : t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const CSS = `
@page { size: A4; margin: 18mm 17mm 20mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Lexend", "Segoe UI", Roboto, Arial, sans-serif; color: #061423; font-size: 10pt; line-height: 1.55; }
.cover { height: 297mm; width: 210mm; background: radial-gradient(120% 90% at 80% 0%, #143A66 0%, #071729 55%, #04101F 100%); color: #fff; position: relative; padding: 26mm 22mm; page-break-after: always; overflow: hidden; }
.cover::after { content: ""; position: absolute; right: -40mm; bottom: -40mm; width: 160mm; height: 160mm; border-radius: 50%; border: 1px solid rgba(69,174,255,.25); box-shadow: 0 0 0 18mm rgba(69,174,255,.05), 0 0 0 36mm rgba(69,174,255,.04); }
.cover .logo { height: 13mm; }
.cover .kicker { margin-top: 62mm; font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #6FC2FF; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 5mm 0 4mm; font-weight: 600; }
.cover .tag { font-size: 13pt; color: #CFEAFF; max-width: 140mm; }
.cover .icon { width: 22mm; height: 22mm; border-radius: 5mm; margin-top: 10mm; }
.cover .meta { position: absolute; left: 22mm; bottom: 24mm; font-size: 9.5pt; color: #A5D8FF; line-height: 1.8; }
.cover .meta b { color: #fff; font-weight: 500; }
.contents { page-break-after: always; }
.contents h2 { font-size: 20pt; margin: 0 0 6mm; border: 0; padding: 0; }
.contents ol { list-style: none; padding: 0; margin: 0; }
.contents li { padding: 1.6mm 0; border-bottom: 1px solid #E2EAF2; }
.contents li.l3 { padding-left: 7mm; font-size: 9pt; color: #46586B; border-bottom-color: #F0F4F8; }
.contents li.book { font-size: 12pt; font-weight: 600; padding-top: 4mm; }
.contents a { color: inherit; text-decoration: none; }
.chapter { page-break-before: always; }
.chapter-head { display: flex; align-items: center; gap: 5mm; padding: 0 0 5mm; margin-bottom: 6mm; border-bottom: 2px solid #239CFF; }
.chapter-head img { width: 14mm; height: 14mm; border-radius: 3mm; }
.chapter-head h1 { font-size: 22pt; margin: 0; line-height: 1.15; }
.chapter-head p { margin: 1mm 0 0; color: #46586B; }
h2 { font-size: 15pt; color: #0E2A4C; margin: 9mm 0 3mm; padding-top: 2mm; page-break-after: avoid; break-after: avoid; }
h3 { font-size: 11.5pt; color: #143A66; margin: 6mm 0 2mm; page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 3mm; }
ol, ul { margin: 0 0 3.5mm; padding-left: 6mm; }
li { margin: 0 0 1.3mm; }
li > ol, li > ul { margin-top: 1.3mm; }
a { color: #0765B0; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9pt; background: #EEF3F8; border-radius: 3px; padding: 0 1mm; }
pre { background: #F4F8FC; border: 1px solid #E2EAF2; border-radius: 2mm; padding: 3mm; white-space: pre-wrap; font-size: 8.5pt; }
pre code { background: none; padding: 0; }
kbd { font-family: inherit; font-size: 8.5pt; border: 1px solid #CFDCE8; border-bottom-width: 2px; border-radius: 3px; padding: 0 1.2mm; background: #fff; }
.g-callout { border-left: 3px solid #239CFF; background: #EAF6FF; border-radius: 0 2mm 2mm 0; padding: 2.5mm 4mm; margin: 0 0 4mm; page-break-inside: avoid; break-inside: avoid; }
.g-callout p:last-child { margin-bottom: 0; }
.g-callout-label { display: block; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #0765B0; margin-bottom: 1mm; }
.g-tip { border-color: #15803D; background: #EEF8F1; } .g-tip .g-callout-label { color: #15803D; }
.g-important { border-color: #E86A27; background: #FDF1E9; } .g-important .g-callout-label { color: #C4531A; }
.g-table { margin: 0 0 4mm; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; page-break-inside: auto; }
tr { page-break-inside: avoid; break-inside: avoid; }
th { text-align: left; background: #0E2A4C; color: #fff; font-weight: 500; padding: 1.8mm 2.5mm; }
td { border-bottom: 1px solid #E2EAF2; padding: 1.8mm 2.5mm; vertical-align: top; }
tr:nth-child(even) td { background: #F7FAFD; }
.g-figure { margin: 2mm 0 5mm; text-align: center; page-break-inside: avoid; break-inside: avoid; }
.g-figure img, img.g-shot { max-width: 100%; max-height: 120mm; border: 1px solid #E2EAF2; border-radius: 2mm; }
.g-figure figcaption { font-size: 8.5pt; color: #72859A; margin-top: 1.5mm; }
.back { page-break-before: always; text-align: center; padding-top: 90mm; color: #46586B; }
.back img { height: 12mm; margin-bottom: 6mm; }
`;

function chapterHtml(g, inBook) {
  const { html, toc } = renderGuide(g.body, {
    image: shotSrc,
    link: linkFor(inBook),
  });
  // In the complete book every id is prefixed with the guide id so two guides
  // can both have "#troubleshooting".
  const prefix = inBook ? `${g.id}--` : "";
  const body = inBook ? html.replace(/ id="([^"]+)"/g, ` id="${prefix}$1"`) : html;
  const icon = iconFor(g.id);
  return {
    toc: toc.map((t) => ({ ...t, id: prefix + t.id })),
    html: `<section class="chapter" id="${inBook ? g.id : "start"}">
      <div class="chapter-head">${icon ? `<img src="${icon}" alt="">` : ""}<div><h1>${esc(g.title)}</h1><p>${esc(g.tagline || "")}</p></div></div>
      ${body}
    </section>`,
  };
}

function bookHtml({ title, tagline, kicker, version, updated, platform, icon, chapters, multi }) {
  const contents = chapters
    .map((c) => {
      const head = multi ? `<li class="book"><a href="#${c.guide.id}">${esc(c.guide.title)}</a></li>` : "";
      const items = c.toc
        .filter((t) => (multi ? t.level === 2 : true))
        .map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.title)}</a></li>`)
        .join("");
      return head + items;
    })
    .join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="cover">
  <img class="logo" src="${LOGO_DARK}" alt="ADLM Studio">
  <div class="kicker">${esc(kicker)}</div>
  <h1>${esc(title)}</h1>
  <div class="tag">${esc(tagline || "")}</div>
  ${icon ? `<img class="icon" src="${icon}" alt="">` : ""}
  <div class="meta">${version ? `<b>Version</b> ${esc(version)}<br>` : ""}${platform ? `<b>Runs on</b> ${esc(platform)}<br>` : ""}<b>Updated</b> ${esc(longDate(updated))}<br>adlmstudio.net/guides</div>
</section>
<section class="contents"><h2>Contents</h2><ol>${contents}</ol></section>
${chapters.map((c) => c.html).join("\n")}
<section class="back"><img src="${LOGO_LIGHT}" alt="ADLM Studio"><p>Read the latest version of this guide at adlmstudio.net/guides.<br>Need help? adlmstudio.net/support</p><p>ADLM Studio Ltd · RC 7440343</p></section>
</body></html>`;
}

// ---------------------------------------------------------------- printing --

function findBrowser() {
  const b = BROWSERS.find((p) => existsSync(p));
  if (!b) throw new Error("No Edge or Chrome found. Set GUIDE_BROWSER to the browser executable.");
  return b;
}

async function startBrowser() {
  const profile = join(tmpdir(), `adlm-guide-pdf-${process.pid}`);
  mkdirSync(profile, { recursive: true });
  const proc = spawn(findBrowser(), [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let t = 0; t < 100 && !existsSync(portFile); t++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(portFile)) { proc.kill(); throw new Error("The browser did not start its debugging port."); }
  const port = readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  return {
    port,
    close() { proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ } },
  };
}

async function printPdf(port, htmlFile, pdfFile, footerTitle) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      waiters.filter((w) => w.method === msg.method).forEach((w) => w.resolve(msg.params));
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok, bad) => { const id = ++seq; pending.set(id, { ok, bad }); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));

  await send("Page.enable");
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: pathToFileURL(htmlFile).href });
  await loaded;
  // Web fonts and embedded images finish after load on a cold start.
  await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });

  const foot = `<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5px;color:#72859A;padding:0 17mm;display:flex;justify-content:space-between">
    <span>${esc(footerTitle)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
  const { data } = await send("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: foot,
    generateDocumentOutline: true,
    generateTaggedPDF: true,
  });
  writeFileSync(pdfFile, Buffer.from(data, "base64"));
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}

// --------------------------------------------------------------------- main --

// A guide that replaces one of the September 2026 books keeps that book's file
// name (front matter `pdf:`), so links already sent in emails and shown on
// product pages open the current guide instead of a 404.
export const pdfName = (g) => g.pdf || `ADLM-${g.id}-user-guide.pdf`;
export const COMPLETE_PDF = "ADLM-Software-Complete-Guide.pdf";

async function main() {
  const all = loadGuides();
  const guides = only.length ? all.filter((g) => only.includes(g.id)) : all;
  if (!guides.length) throw new Error(`No guides matched: ${only.join(", ")}`);
  mkdirSync(OUT, { recursive: true });
  const work = join(tmpdir(), "adlm-guide-html");
  mkdirSync(work, { recursive: true });

  const jobs = guides.map((g) => ({
    title: g.title,
    file: pdfName(g),
    // Retired file names that should now serve this guide (front matter
    // `pdfAliases: [old.pdf]`), e.g. the old "Hub & Heron" book now serves HERON.
    aliases: [].concat(g.pdfAliases || []),
    html: bookHtml({
      title: `${g.title} user guide`,
      kicker: "ADLM Studio · User guide",
      tagline: g.tagline,
      version: g.version,
      updated: g.updated,
      platform: g.platform,
      icon: iconFor(g.id),
      chapters: [{ guide: g, ...chapterHtml(g, null) }],
    }),
  }));

  if (!only.length) {
    const ids = new Set(all.map((g) => g.id));
    jobs.push({
      title: "ADLM Complete User Guide",
      file: COMPLETE_PDF,
      html: bookHtml({
        title: "The complete ADLM user guide",
        kicker: "ADLM Studio · Every product",
        tagline: "Every ADLM product in one book: getting started, the Installer Hub, QUIV, HERON, Rate Gen, SERVIQ for Revit MEP, Time Pro and the ADLM Cloud.",
        updated: all.map((g) => g.updated).filter(Boolean).sort().pop(),
        chapters: all.map((g) => ({ guide: g, ...chapterHtml(g, ids) })),
        multi: true,
      }),
    });
  }

  const browser = await startBrowser();
  try {
    for (const j of jobs) {
      const htmlFile = join(work, j.file.replace(/\.pdf$/, ".html"));
      writeFileSync(htmlFile, j.html);
      const pdfFile = join(OUT, j.file);
      await printPdf(browser.port, htmlFile, pdfFile, `${j.title} · adlmstudio.net/guides`);
      if (KEEP_HTML) writeFileSync(pdfFile.replace(/\.pdf$/, ".html"), j.html);
      for (const a of j.aliases || []) copyFileSync(pdfFile, join(OUT, a));
      const kb = Math.round(readFileSync(pdfFile).length / 1024);
      console.log(`  ${j.file}  ${kb} KB`);
    }
  } finally {
    browser.close();
  }
  if (missingShots.size) console.warn(`Screenshots not found in ${SHOTS}: ${[...missingShots].join(", ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
