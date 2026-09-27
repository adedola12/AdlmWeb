// server/util/workBoardNotice.js
//
// The approver's "new proposal" email, and the hold on it.
//
// The board's server half can go live before its page does (the API deploys
// from a branch, the website only from main). On 26 Sep 2026 Richard got a
// proposal email whose button opened a 404, because /admin/work was not yet in
// the live site. So the email is only sent once the page is live: until then
// the proposal is filed and its notice is marked "held", and the held ones go
// out together, in one email, the first time a check finds the page live.
import { WorkItem } from "../models/WorkItem.js";
import { esc, gateMail, getGateConfig } from "./releaseGate.js";

export function siteBase() {
  return String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "");
}
export const boardUrl = () => `${siteBase()}/admin/work`;

// The site is a single-page app: every path answers 200 with the same shell,
// so the status code proves nothing. The route table is in the entry bundle,
// and the page is live when that bundle carries the "admin/work" route.
export function entryScriptPath(html) {
  const m = String(html || "").match(/<script[^>]+src="(\/assets\/index-[^"]+\.js)"/);
  return m ? m[1] : null;
}
export function bundleHasBoardRoute(js) {
  return /["'`]\/?admin\/work["'`]/.test(String(js || ""));
}

// Any failure reads as "not live": a held email is late, a sent one to a 404
// is the bug this exists to prevent.
export async function boardPageIsLive({ fetchImpl = globalThis.fetch, base = siteBase() } = {}) {
  try {
    const page = await fetchImpl(`${base}/`, { cache: "no-store" });
    if (!page.ok) return false;
    const src = entryScriptPath(await page.text());
    if (!src) return false;
    const js = await fetchImpl(`${base}${src}`, { cache: "no-store" });
    if (!js.ok) return false;
    return bundleHasBoardRoute(await js.text());
  } catch {
    return false;
  }
}

export function proposalMail(items, { lines: extra = [] } = {}) {
  if (items.length === 1) {
    const [i] = items;
    return {
      subject: `New proposal for your approval: ${i.title}`,
      title: "A new feature is waiting for your approval",
      lines: [
        `<strong>${esc(i.title)}</strong>`,
        `Proposed by ${esc(i.submittedBy)}.`,
        i.businessCase?.problem ? `<em>${esc(i.businessCase.problem)}</em>` : "",
        ...extra,
      ].filter(Boolean),
      cta: { label: "Open the work board", href: boardUrl() },
    };
  }
  return {
    subject: `${items.length} new proposals for your approval`,
    title: `${items.length} new features are waiting for your approval`,
    lines: [
      ...items.map((i) => `<strong>${esc(i.title)}</strong><br>Proposed by ${esc(i.submittedBy)}.`),
      ...extra,
    ],
    cta: { label: "Open the work board", href: boardUrl() },
  };
}

// Notify the approver about `item` (a just-filed proposal, or null) plus any
// held earlier. Returns "sent", "held" or "failed".
export async function notifyApprover(item = null, { isLive = boardPageIsLive, lines = [], log = console.log } = {}) {
  const now = new Date();
  if (!(await isLive())) {
    if (item) {
      await WorkItem.updateOne({ _id: item._id }, { $set: { "notice.status": "held", "notice.heldAt": now } });
      log(`Approver email held: ${boardUrl()} is not live yet. It goes out once the page is.`);
    }
    return "held";
  }
  const held = await WorkItem.find({ "notice.status": "held", "decision.status": "pending" }).sort({ createdAt: 1 }).lean();
  const items = [...held, ...(item && !held.some((h) => String(h._id) === String(item._id)) ? [item] : [])];
  if (!items.length) return "sent";
  const cfg = await getGateConfig();
  const ok = await gateMail({ to: [cfg.approverEmail], ...proposalMail(items, { lines }) });
  if (!ok) {
    // SES refused. Keep them held so the next run retries; never another provider.
    if (item) await WorkItem.updateOne({ _id: item._id }, { $set: { "notice.status": "held", "notice.heldAt": now } });
    log("Approver email NOT sent (SES refused); the proposal stays held.");
    return "failed";
  }
  await WorkItem.updateMany({ _id: { $in: items.map((i) => i._id) } }, { $set: { "notice.status": "sent", "notice.sentAt": now } });
  log(`Approver emailed about ${items.length} proposal${items.length === 1 ? "" : "s"}.`);
  return "sent";
}
