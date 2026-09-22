// server/util/releaseDigestEmail.js
//
// What the weekly "your ADLM updates" email says, in HTML and in plain text.
//
// One email per customer per week (util/releaseDigest.js), listing only the
// updates for software that customer holds: each product's latest version,
// what changed, and its own "close <host app>, open the Installation Center,
// click Update" steps. A new Installation Center build, when there is one, is
// listed first with a link to the customer dashboard, /dashboard, whose
// "Download Installer Hub" button (client/src/pages/Dashboard.jsx, the
// "Installer Hub" banner near the top) is shown to every customer with an
// active software subscription. NOT /manage/downloads: the new build's
// Downloads page is staff-only until go-live (components/NewBuildGate.jsx
// sends every customer from it to /dashboard). hubDownloadPageUrl() is the one
// place to switch at go-live, with the step wording below.
//
// Nothing here reads the database and nothing here sends. With exactly one
// product and no Installation Center, the email is the per-release one
// (util/releaseEmail.js buildReleaseMessage), word for word, so a quiet week
// with one release reads exactly as it did before the digest.
//
// Subjects:
//   one product    "QUIV 3.1.11 is ready — update from the Installation Center"
//   several        "This week's ADLM updates: QUIV 3.1.11, RateGen 2.9.2"
//   hub only       "A new ADLM Installation Center is ready"

import { wrapEmail } from "./emailLayout.js";
import {
  LEGAL_LINE,
  buildReleaseMessage,
  esc,
  genericNotes,
  inlineHtml,
  inlineText,
  supportUrl,
  updateSteps,
  whatsNewUrl,
} from "./releaseEmail.js";

export const DIGEST_TEMPLATE_KEY = "release.digest";

/** The Installation Center, as the digest names it. Its What's New slug is "hub". */
export const HUB_PRODUCT = Object.freeze({
  key: "hub",
  name: "ADLM Installation Center",
  shortName: "Installation Center",
  slug: "hub",
  hostApps: ["the ADLM Installation Center"],
  loadsIn: "",
  audienceKeys: [],
});

const SITE = () =>
  String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "");

/**
 * Where a signed-in customer downloads the Installation Center today: the
 * classic dashboard. Switch to `${SITE()}/manage/downloads` (and the wording in
 * hubSteps) only when the new build goes live for customers.
 */
export const hubDownloadPageUrl = () => `${SITE()}/dashboard`;

/** The dashboard button's own label (client/src/pages/Dashboard.jsx). */
export const HUB_BUTTON_LABEL = "Download Installer Hub";

/** Most bullets per product when several share one email; the rest are one click away. */
export const MAX_ITEMS_PER_UPDATE = 6;

const LABELS = { new: "New", improved: "Improved", fixed: "Fixed" };
const labelOf = (type) =>
  LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : "What changed");

const firstNameOf = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

const joinAnd = (list) =>
  list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

function capGroups(groups = [], max = MAX_ITEMS_PER_UPDATE) {
  let left = max;
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

const isHub = (item) => item?.kind === "hub";

/** "QUIV 3.1.11" / "Installation Center 1.0.3": how an update is named in a list. */
export const updateLabel = (item) =>
  `${isHub(item) ? HUB_PRODUCT.shortName : item.product.name} ${String(item.version || "").trim()}`.trim();

/** Hub first (the products' own steps open it), then products by name. */
export function orderUpdates(items = []) {
  return [...items].sort((a, b) => {
    if (isHub(a) !== isHub(b)) return isHub(a) ? -1 : 1;
    return String(a.product?.name || "").localeCompare(String(b.product?.name || ""));
  });
}

/** How to get a new Installation Center: from the dashboard, not from itself. */
export function hubSteps() {
  return [
    "Close the ADLM Installation Center if it is open.",
    `Sign in at ${SITE().replace(/^https?:\/\//, "")} and open your dashboard: ${hubDownloadPageUrl()}`,
    `Click "${HUB_BUTTON_LABEL}" near the top of your dashboard and run the setup.`,
    "Open the Installation Center again when the setup finishes.",
  ];
}

/**
 * The footer's word on how often. "Usually": an admin's emergency send-now
 * (util/releaseDigest.js sendDigestNow) or the per-release send can mail a
 * customer between Mondays, so "at most once a week" would not be true.
 */
export const CADENCE_LINE = "We usually send product updates once a week.";

/** The subject for a set of updates (already filtered to what this customer holds). */
export function digestSubject(items = []) {
  const ordered = orderUpdates(items);
  const products = ordered.filter((i) => !isHub(i));
  if (!products.length) return "A new ADLM Installation Center is ready";
  if (ordered.length === 1) {
    const [only] = ordered;
    return `${only.product.name} ${String(only.version).trim()} is ready — update from the Installation Center`;
  }
  return `This week's ADLM updates: ${ordered.map(updateLabel).join(", ")}`;
}

const P = (html) => `<p style="margin:0 0 14px">${html}</p>`;
const H = (text) => `<p style="margin:18px 0 8px;font-weight:bold;color:#0E1620">${esc(text)}</p>`;
const H2 = (text) =>
  `<p style="margin:26px 0 8px;font-size:17px;font-weight:bold;color:#0E1620;border-top:1px solid #E3E8EE;padding-top:16px">${esc(text)}</p>`;

function notesHtml(n, more, max) {
  const { groups, hidden } = capGroups(n.groups, max);
  let html = "";
  if (n.title) html += P(`<strong style="color:#0E1620">${inlineHtml(n.title)}</strong>`);
  if (n.highlight) html += P(inlineHtml(n.highlight));
  for (const para of n.paragraphs || []) html += P(inlineHtml(para));
  for (const g of groups) {
    html += `<p style="margin:10px 0 4px;font-weight:bold;color:#0E1620">${esc(labelOf(g.type))}</p>`;
    html += `<ul style="margin:0 0 12px;padding-left:20px">${g.items
      .map((i) => `<li style="margin:0 0 6px">${inlineHtml(i)}</li>`)
      .join("")}</ul>`;
  }
  if (hidden > 0) {
    html += P(
      `…and ${hidden} more change${hidden === 1 ? "" : "s"} on the ` +
        `<a href="${esc(more)}" style="color:#E86A27">What's New page</a>.`,
    );
  }
  return html;
}

function notesText(n, more, max) {
  const { groups, hidden } = capGroups(n.groups, max);
  return [
    ...(n.title ? [inlineText(n.title)] : []),
    ...(n.highlight ? [inlineText(n.highlight)] : []),
    ...(n.paragraphs || []).map(inlineText),
    ...groups.flatMap((g) => [`${labelOf(g.type)}:`, ...g.items.map((i) => `  - ${inlineText(i)}`)]),
    ...(hidden > 0 ? [`...and ${hidden} more on the What's New page.`] : []),
    `Everything that changed: ${more}`,
  ];
}

const hubNotes = (version) => ({
  source: "generic",
  title: "",
  highlight: "",
  groups: [],
  paragraphs: [`Version ${version} of the ADLM Installation Center, the app that installs and updates your ADLM software.`],
});

/**
 * @param firstName        who it is addressed to
 * @param items            [{ kind: "product"|"hub", product, version, notes }], only
 *                         the updates this customer holds (the sender filters)
 * @param unsubscribeUrl   the per-recipient product-updates opt-out
 * @param replyTo          when set, the mail says replies are read
 */
export function buildDigestMessage({ firstName, items = [], unsubscribeUrl, replyTo = "" }) {
  const ordered = orderUpdates(items);
  if (!ordered.length) throw new Error("buildDigestMessage: nothing to announce");

  // One product and no Installation Center: the per-release email, unchanged.
  if (ordered.length === 1 && !isHub(ordered[0])) {
    const [only] = ordered;
    return buildReleaseMessage({
      firstName,
      product: only.product,
      version: only.version,
      notes: only.notes,
      unsubscribeUrl,
      replyTo,
    });
  }

  const subject = digestSubject(ordered);
  const products = ordered.filter((i) => !isHub(i));
  const hub = ordered.find(isHub);
  const hubOnly = !products.length;
  const maxPer = ordered.length === 1 ? 10 : MAX_ITEMS_PER_UPDATE;
  const labels = ordered.map(updateLabel);
  const heldNames = [...new Set(products.map((i) => i.product.name))];

  /* ── html ── */
  let body = "";
  body += P(`Hi ${esc(firstNameOf(firstName))},`);
  if (hubOnly) {
    body += P(
      `A new version of the <strong style="color:#0E1620">ADLM Installation Center</strong> is ready: ` +
        `<strong style="color:#0E1620">${esc(hub.version)}</strong>. It is free with your licence.`,
    );
  } else {
    body += P(
      `This week's updates for the ADLM software on your licence are ready: ` +
        `${joinAnd(labels.map((l) => `<strong style="color:#0E1620">${esc(l)}</strong>`))}. ` +
        "They are included in your licence.",
    );
    if (hub) body += P("Update the Installation Center first, then use it to update your software.");
  }

  const textParts = [];

  for (const item of ordered) {
    if (isHub(item)) {
      const n = item.notes || hubNotes(item.version);
      const more = whatsNewUrl(HUB_PRODUCT.slug);
      if (!hubOnly) body += H2(`${HUB_PRODUCT.name} ${item.version}`);
      body += H("What is new");
      body += notesHtml(n, more, maxPer);
      body += H("How to get it");
      body += `<ol style="margin:0 0 14px;padding-left:20px">${hubSteps()
        .map((s, i) =>
          i === 1
            ? `<li style="margin:0 0 6px">Sign in and open <a href="${esc(hubDownloadPageUrl())}" style="color:#E86A27">your dashboard</a>.</li>`
            : `<li style="margin:0 0 6px">${esc(s)}</li>`,
        )
        .join("")}</ol>`;

      textParts.push(
        "",
        `${HUB_PRODUCT.name.toUpperCase()} ${item.version}`,
        ...notesText(n, more, maxPer),
        "",
        "How to get it:",
        ...hubSteps().map((s, i) => `${i + 1}. ${s}`),
      );
      continue;
    }

    const n = item.notes || genericNotes(item.product);
    const more = whatsNewUrl(item.product.slug);
    const steps = updateSteps(item.product, item.version);
    body += H2(`${item.product.name} ${item.version}`);
    body += notesHtml(n, more, maxPer);
    body += H(`How to update ${item.product.name}`);
    body += `<ol style="margin:0 0 14px;padding-left:20px">${steps
      .map((s) => `<li style="margin:0 0 6px">${esc(s)}</li>`)
      .join("")}</ol>`;
    body += P(`<a href="${esc(more)}" style="color:#E86A27">Everything new in ${esc(item.product.name)} ${esc(item.version)}</a>`);

    textParts.push(
      "",
      `${item.product.name.toUpperCase()} ${item.version}`,
      ...notesText(n, more, maxPer),
      "",
      `How to update ${item.product.name}:`,
      ...steps.map((s, i) => `${i + 1}. ${s}`),
    );
  }

  body += H("Need a hand?");
  body += P(
    "Something not right after updating? Open a ticket from the " +
      `<a href="${esc(supportUrl())}" style="color:#E86A27">Support page</a>` +
      (replyTo ? " or reply to this email" : "") +
      " and we will help you get going.",
  );

  const why = heldNames.length
    ? `You are getting this because you hold an active licence for ${esc(joinAnd(heldNames))}.`
    : "You are getting this because you hold an active licence for ADLM software.";
  const footNote =
    `${why} ${CADENCE_LINE} ` +
    `<a href="${esc(unsubscribeUrl)}" style="color:#8A99A8">Stop product update emails</a> ` +
    "(receipts, licence and support mail are not affected).<br>" +
    LEGAL_LINE;

  const title = hubOnly ? `ADLM Installation Center ${hub.version} is ready` : "This week's ADLM updates";
  const preheader = hubOnly
    ? "Download it from your dashboard."
    : `${labels.join(", ")}: what is new, and how to update.`;
  const cta = hubOnly
    ? { label: "Open your dashboard", href: esc(hubDownloadPageUrl()) }
    : { label: "See everything new", href: esc(whatsNewUrl("")) };

  const html = wrapEmail({ title: esc(title), preheader: esc(preheader), body, cta, footNote });

  /* ── text ── */
  const text = [
    `Hi ${firstNameOf(firstName)},`,
    "",
    hubOnly
      ? `A new version of the ADLM Installation Center is ready: ${hub.version}. It is free with your licence.`
      : `This week's updates for the ADLM software on your licence are ready: ${joinAnd(labels)}. They are included in your licence.`,
    ...(!hubOnly && hub ? ["Update the Installation Center first, then use it to update your software."] : []),
    ...textParts,
    "",
    `Something not right after updating? Open a ticket at ${supportUrl()}${replyTo ? " or reply to this email" : ""}.`,
    "",
    "--",
    why.replace(/&amp;/g, "&"),
    CADENCE_LINE,
    `Stop product update emails: ${unsubscribeUrl}`,
    LEGAL_LINE.replace(/&amp;/g, "&"),
  ].join("\n");

  return { subject, html, text };
}
