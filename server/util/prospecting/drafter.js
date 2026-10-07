// server/util/prospecting/drafter.js
//
// Drafts emails for every prospect the finder added that has someone to
// write to, and puts them in the review queue as pending_review. Runs after
// the finder in the daily job. Nothing is sent from here.
//
// A product whose brief in config/products.md is not marked "Status: ready"
// is skipped when `requireReady` is on (the live run), so no email goes into
// the queue built on a half-written brief. Previews turn it off.
import { DraftRejected, productName, writeDraft } from "./writer.js";

export async function runDraftWriter({ store, briefs, create, limit = 20, requireReady = true, log = console.log }) {
  const report = { drafted: [], skipped: [], failed: [] };
  const queue = await store.prospectsToDraft(limit);

  for (const { prospect, contact } of queue) {
    const product = prospect.matchedProduct;
    const status = briefs?.[product]?.status || "placeholder";
    if (requireReady && status !== "ready") {
      report.skipped.push({ domain: prospect.domain, reason: `brief_${status}` });
      await store.noteProspect(prospect._id, `Waiting for the ${productName(product)} brief in config/products.md to be marked ready.`);
      continue;
    }
    try {
      const { emails, model, attempts } = await writeDraft({ prospect, contact, briefs, create });
      const saved = await store.saveDraft({ prospect, contact, emails, model });
      if (saved.saved) report.drafted.push({ domain: prospect.domain, attempts, draft: saved.draft });
      else report.skipped.push({ domain: prospect.domain, reason: saved.reason });
    } catch (err) {
      const why = err instanceof DraftRejected ? err.problems.join(" | ") : String(err?.message || err);
      report.failed.push({ domain: prospect.domain, error: why });
      await store.noteProspect(prospect._id, `Draft failed: ${why.slice(0, 400)}`);
    }
  }
  log(`[drafter] drafted ${report.drafted.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`);
  return report;
}
