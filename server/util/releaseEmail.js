// server/util/releaseEmail.js
//
// What a "new version is ready" email says, in HTML and in plain text.
//
// Nothing here reads the database and nothing here sends. It takes the facts it
// needs and returns { subject, html, text }, the contract every message in
// util/emailContent.js honours. The sender (util/releaseNotifier.js) owns the
// audience, the ledger and SES.
//
// WHY THE UPDATE STEPS NAME THE HOST APP
//
// Revit, PlanSwift and Excel hold the very files an update replaces, so an
// update run with the host app open goes wrong. The first step names exactly
// what to close, per product, and says why.
//
// It does NOT say the Installation Center refuses. The Hub customers have
// today only warns when Revit is running and skips tidying old version
// folders (ADLMInstallerHub Services/InstallerService.cs). The guard that
// refuses (Services/HostAppGuard.cs) is on an unreleased Hub branch. Its
// HostsByProductKey table is still where the app names below come from. Once
// that build has shipped, the step can say the Hub will not update while they
// are open.
//
// THE LEGAL NAME
//
// ADLM is the acronym; the CAC-registered name is Academy for Digital Learning
// & Mastery Studios, RC 7440343 (the same line routes/admin.proposals.js prints
// on proposals). It goes in this message's own footer line. The shared frame in
// util/emailLayout.js is left alone, because every other message uses it.

import { wrapEmail } from "./emailLayout.js";
import { sameVersion } from "./releaseVersion.js";

export const LEGAL_LINE =
  "Academy for Digital Learning &amp; Mastery Studios (ADLM Studio) · RC 7440343 · Lagos, Nigeria";

export const TEMPLATE_KEY = "release.update";

/**
 * Deployment key -> how the customer knows the product.
 *
 * The key is the deployment's productKey, which is the same string as the
 * entitlement productKey (routes/me.deployments.js). `slug` is the product's
 * What's New page, `hostApps` the programs to close before updating
 * (HostAppGuard.cs HostsByProductKey), `audienceKeys` whose licence holders
 * hear about it, and `loadsIn` the program a plug-in runs inside (so the last
 * step says "open Revit again" rather than "open QUIV again").
 *
 * excelbridge has no entitlement of its own anywhere, so its audience is empty
 * until somebody decides whether HERON (planswift) holders should hear about
 * it. Changing that is one line: audienceKeys: ["planswift"].
 */
export const PRODUCTS = {
  revit: { name: "QUIV", slug: "quiv", hostApps: ["Revit"], loadsIn: "Revit" },
  mep: { name: "ADLM MEP", slug: "mep", hostApps: ["Revit"], loadsIn: "Revit" },
  planswift: { name: "HERON", slug: "heron", hostApps: ["PlanSwift", "ADLM HERON", "Excel"] },
  rategen: { name: "RateGen", slug: "rategen", hostApps: ["ADLM RateGen"] },
  "qs-takeoff": { name: "ADLM Time Pro", slug: "timepro", hostApps: ["ADLM Time Pro"] },
  civil3d: { name: "CIVIQ", slug: "civiq", hostApps: ["AutoCAD / Civil 3D"], loadsIn: "Civil 3D" },
  archicad: { name: "QUIV for ArchiCAD", slug: "", hostApps: ["QUIV for ArchiCAD"] },
  excelbridge: { name: "Excel Add-in Bridge", slug: "", hostApps: ["Excel"] },
};

/** Everything the message needs to know about a product, for any key. */
export function productFor(productKey, displayName = "") {
  const key = String(productKey || "").trim().toLowerCase();
  const known = PRODUCTS[key];
  const name = known?.name || String(displayName || "").trim() || key.toUpperCase();
  return {
    key,
    name,
    slug: known?.slug || "",
    hostApps: known?.hostApps ? [...known.hostApps] : [],
    loadsIn: known?.loadsIn || "",
    audienceKeys: known?.audienceKeys ? [...known.audienceKeys] : [key],
  };
}

const SITE = () =>
  String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "");

export const whatsNewUrl = (slug) => (slug ? `${SITE()}/whats-new/${slug}` : `${SITE()}/whats-new`);
export const supportUrl = () => `${SITE()}/manage/support`;

export const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The small amount of markdown a release note uses: **bold**, `code` and
 * [text](https://link). Escaped FIRST, so nothing in a note can become markup
 * it did not ask for, and only https links survive.
 */
export function inlineHtml(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code style="font-family:Consolas,monospace;font-size:13px">$1</code>')
    .replace(
      /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
      (_m, label, href) => `<a href="${href}" style="color:#E86A27">${label}</a>`,
    );
}

/** The same, for the plain-text part: markup removed, links kept readable. */
export const inlineText = (text) =>
  String(text ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, "$1 ($2)");

const joinAnd = (list) =>
  list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

const firstNameOf = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/* ─────────────────────────────────────────────────────────────── notes ── */

const MAX_NOTES_CHARS = 8000;

/** A heading's words -> the What's New group it belongs to. */
function groupTypeOf(heading) {
  const h = String(heading || "").toLowerCase();
  if (/\b(new|added|feature)/.test(h)) return "new";
  if (/\b(improv|change|enhance|better|faster)/.test(h)) return "improved";
  if (/\b(fix|bug|resolved)/.test(h)) return "fixed";
  return String(heading || "").trim();
}

/**
 * Release notes passed with the deployment, as markdown or as a list.
 *
 * Headings start a group, bullets and numbered lines are items, anything else
 * is a paragraph. Deliberately forgiving: a release script that pastes a
 * commit list, a CHANGELOG section or three plain sentences should all produce
 * something readable rather than an error.
 */
export function notesFromMarkdown(input) {
  const lines = (Array.isArray(input) ? input.map((l) => `- ${l}`).join("\n") : String(input || ""))
    .slice(0, MAX_NOTES_CHARS)
    .replace(/\r/g, "")
    .split("\n");

  const groups = [];
  const paragraphs = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      current = { type: groupTypeOf(heading[1]), items: [] };
      groups.push(current);
      continue;
    }

    const bullet = /^(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line);
    if (bullet) {
      if (!current) {
        current = { type: "", items: [] };
        groups.push(current);
      }
      current.items.push(bullet[1].trim());
      continue;
    }

    paragraphs.push(line);
  }

  return {
    source: "request",
    title: "",
    highlight: "",
    groups: groups.filter((g) => g.items.length),
    paragraphs,
  };
}

/**
 * The What's New entry for exactly this version, or null.
 *
 * Exact on the version (normalised, so "v3.1.11" finds "3.1.11"), never
 * "the latest": the What's New page often lags the release by a day, and
 * mailing the previous version's notes under the new version's name is worse
 * than mailing no notes at all.
 */
export function notesFromChangelog(doc, version) {
  const release = (doc?.releases || []).find((r) => sameVersion(r?.version, version));
  if (!release) return null;

  const groups = (release.changes || [])
    .map((g) => ({
      type: String(g?.type || ""),
      items: (g?.items || []).map((s) => String(s).trim()).filter(Boolean),
    }))
    .filter((g) => g.items.length);

  const highlight = String(release.highlight || "").trim();
  const title = String(release.title || "").trim();
  if (!groups.length && !highlight && !title) return null;

  return { source: "changelog", title, highlight, groups, paragraphs: [] };
}

/** When nobody has written anything down yet. Honest rather than inventive. */
export function genericNotes(product) {
  return {
    source: "generic",
    title: "",
    highlight: "",
    groups: [],
    paragraphs: [`This update brings fixes and improvements to ${product.name}.`],
  };
}

/* ───────────────────────────────────────────────────────────── message ── */

const LABELS = { new: "New", improved: "Improved", fixed: "Fixed" };
const labelOf = (type) =>
  LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : "What changed");

/** The most bullets one email carries. The rest are one click away. */
export const MAX_ITEMS = 10;

function capGroups(groups = []) {
  let left = MAX_ITEMS;
  let hidden = 0;
  const out = [];
  for (const g of groups) {
    const items = g.items || [];
    const shown = items.slice(0, Math.max(0, left));
    hidden += items.length - shown.length;
    left -= shown.length;
    if (shown.length) out.push({ type: g.type, items: shown });
  }
  return { groups: out, hidden };
}

/** The update steps, as plain sentences. The HTML and the text part share them. */
export function updateSteps(product, version) {
  const apps = product.hostApps || [];
  // True on every Installation Center a customer has: the shipped Hub only
  // warns when the host app is running, so this must not say it refuses.
  const close = apps.length
    ? `Save your work and close ${joinAnd(apps)} first: the update replaces files ` +
      `${apps.length > 1 ? "they keep" : `${apps[0]} keeps`} open.`
    : `Save your work and close ${product.name} if it is open.`;

  const reopen = product.loadsIn
    ? `When it finishes, open ${product.loadsIn} again. ${product.name} ${version} loads with it.`
    : `When it finishes, open ${product.name} again.`;

  return [
    close,
    "Open the ADLM Installation Center on your computer.",
    `Find ${product.name} in the list and click Update.`,
    reopen,
  ];
}

const P = (html) => `<p style="margin:0 0 14px">${html}</p>`;
const H = (text) =>
  `<p style="margin:18px 0 8px;font-weight:bold;color:#0E1620">${esc(text)}</p>`;

/**
 * @param firstName        who it is addressed to
 * @param product          from productFor()
 * @param version          the new version, as deployed
 * @param notes            from notesFromMarkdown / notesFromChangelog / genericNotes
 * @param unsubscribeUrl   the per-recipient product-updates opt-out
 * @param replyTo          when set, the mail says replies are read
 */
export function buildReleaseMessage({
  firstName,
  product,
  version,
  notes,
  unsubscribeUrl,
  replyTo = "",
}) {
  const name = product.name;
  const v = String(version || "").trim();
  const n = notes || genericNotes(product);
  const more = whatsNewUrl(product.slug);
  const { groups, hidden } = capGroups(n.groups);
  const steps = updateSteps(product, v);

  const subject = `${name} ${v} is ready — update from the Installation Center`;
  const title = `${name} ${v} is ready`;
  const preheader =
    n.highlight || n.title || `What is new in ${name} ${v}, and how to update.`;

  /* ── html ── */
  let body = "";
  body += P(`Hi ${esc(firstNameOf(firstName))},`);
  body += P(
    `A new version of <strong style="color:#0E1620">${esc(name)}</strong> is ready for you: ` +
      `<strong style="color:#0E1620">${esc(v)}</strong>. It is included in your licence.`,
  );

  body += H(n.title ? `What is new: ${n.title}` : "What is new");
  if (n.highlight) body += P(inlineHtml(n.highlight));
  for (const para of n.paragraphs || []) body += P(inlineHtml(para));
  for (const g of groups) {
    body += `<p style="margin:10px 0 4px;font-weight:bold;color:#0E1620">${esc(labelOf(g.type))}</p>`;
    body += `<ul style="margin:0 0 12px;padding-left:20px">${g.items
      .map((i) => `<li style="margin:0 0 6px">${inlineHtml(i)}</li>`)
      .join("")}</ul>`;
  }
  if (hidden > 0) {
    body += P(
      `…and ${hidden} more change${hidden === 1 ? "" : "s"} on the ` +
        `<a href="${esc(more)}" style="color:#E86A27">What's New page</a>.`,
    );
  }

  body += H("How to update");
  body += `<ol style="margin:0 0 14px;padding-left:20px">${steps
    .map((s) => `<li style="margin:0 0 6px">${esc(s)}</li>`)
    .join("")}</ol>`;

  body += H("Need a hand?");
  body += P(
    "Something not right after updating? Open a ticket from the " +
      `<a href="${esc(supportUrl())}" style="color:#E86A27">Support page</a>` +
      (replyTo ? " or reply to this email" : "") +
      " and we will help you get going.",
  );

  const footNote =
    `You are getting this because you hold an active ${esc(name)} licence. ` +
    `<a href="${esc(unsubscribeUrl)}" style="color:#8A99A8">Stop product update emails</a> ` +
    "(receipts, licence and support mail are not affected).<br>" +
    LEGAL_LINE;

  const html = wrapEmail({
    title: esc(title),
    preheader: esc(inlineText(preheader)),
    body,
    cta: { label: `See everything new in ${esc(v)}`, href: esc(more) },
    footNote,
  });

  /* ── text ── */
  const text = [
    `Hi ${firstNameOf(firstName)},`,
    "",
    `A new version of ${name} is ready for you: ${v}. It is included in your licence.`,
    "",
    n.title ? `WHAT IS NEW: ${n.title}` : "WHAT IS NEW",
    ...(n.highlight ? [inlineText(n.highlight)] : []),
    ...(n.paragraphs || []).map(inlineText),
    ...groups.flatMap((g) => [`${labelOf(g.type)}:`, ...g.items.map((i) => `  - ${inlineText(i)}`)]),
    ...(hidden > 0 ? [`...and ${hidden} more on the What's New page.`] : []),
    `Everything that changed: ${more}`,
    "",
    "HOW TO UPDATE",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Something not right after updating? Open a ticket at ${supportUrl()}${replyTo ? " or reply to this email" : ""}.`,
    "",
    "--",
    `You are getting this because you hold an active ${name} licence.`,
    `Stop product update emails: ${unsubscribeUrl}`,
    LEGAL_LINE.replace(/&amp;/g, "&"),
  ].join("\n");

  return { subject, html, text };
}
