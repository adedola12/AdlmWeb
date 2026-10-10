// server/util/prospecting/finder.js
//
// The daily prospect finder. For each active ideal customer profile: ask
// Claude (with web search) for matching firms, add the ones that pass dedupe,
// suppression and the daily cap, then find the right person at each through
// Hunter.io.
//
// The cap is shared fairly: each profile gets its share of what is left
// today, rounded up, so the first profile cannot use all 20 before the
// others are looked at.
//
// Everything it touches is passed in (store, research, contact search,
// profiles), so the tests and the dry run swap in stand-ins. One profile
// failing does not stop the others; the report lists every failure, and the
// job fails loudly only when nothing at all got through.
import { lagosDay } from "./normalise.js";
import { dailyCap, remainingToday } from "./guards.js";
import { pickContacts } from "./hunter.js";

// Ask for a few more than the share, because some will be duplicates or
// unverifiable. Capped so one call does not balloon.
const overAsk = (share) => Math.min(share + 3, 15);

export async function runProspectFinder({
  store,
  loadProfiles,
  research,
  findContacts,
  now = new Date(),
  cap = dailyCap(),
  runId = `finder-${Date.now()}`,
  log = console.log,
}) {
  const day = lagosDay(now);
  const profiles = await loadProfiles();
  const report = { runId, day, cap, foundBefore: 0, added: 0, costUsd: 0, profiles: [], errors: [] };

  report.foundBefore = await store.foundTodayCount(day);
  if (!profiles.length) {
    log("[finder] no active profiles");
    return report;
  }

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const left = remainingToday(cap, await store.foundTodayCount(day));
    const share = Math.ceil(left / (profiles.length - i));
    const entry = { profile: profile.key, share, added: [], skipped: [], dropped: [], contacts: 0, noContact: [], costUsd: 0 };
    report.profiles.push(entry);

    if (share <= 0) {
      entry.skippedReason = "daily_cap";
      continue;
    }

    try {
      const knownDomains = await store.knownDomains(profile._id);
      const r = await research({ profile, want: overAsk(share), knownDomains });
      entry.costUsd = r.costUsd || 0;
      entry.searches = r.usage?.searches || 0;
      entry.dropped = r.dropped || [];
      report.costUsd += entry.costUsd;

      // Cap this profile at its share even if the day has more room, so the
      // later profiles still get theirs.
      const already = await store.foundTodayCount(day);
      const { inserted, skipped } = await store.addProspects({
        profile,
        candidates: r.candidates,
        runId,
        now,
        cap: Math.min(cap, already + share),
      });
      entry.skipped = skipped;

      for (const p of inserted) {
        entry.added.push(p.domain);
        try {
          const found = await findContacts(p.domain);
          const chosen = pickContacts(found, profile.jobTitles);
          const { inserted: people } = await store.addContacts({ prospect: p, contacts: chosen });
          entry.contacts += people.length;
          if (people.length) {
            await store.setPrimaryContact(p._id, people[0]._id);
          } else {
            entry.noContact.push(p.domain);
            await store.noteProspect(p._id, found.length ? "No contact above the confidence floor." : "No contact found.");
          }
        } catch (err) {
          entry.noContact.push(p.domain);
          report.errors.push({ profile: profile.key, domain: p.domain, stage: "contacts", error: String(err?.message || err) });
          await store.noteProspect(p._id, `Contact search failed: ${String(err?.message || err).slice(0, 200)}`);
        }
      }
      report.added += inserted.length;
      log(`[finder] ${profile.key}: +${inserted.length} (share ${share}), ${entry.contacts} contacts, $${entry.costUsd.toFixed(4)}`);
    } catch (err) {
      entry.error = String(err?.message || err);
      report.errors.push({ profile: profile.key, stage: "research", error: entry.error });
      log(`[finder] ${profile.key}: FAILED ${entry.error}`);
    }
  }

  report.costUsd = Number(report.costUsd.toFixed(6));
  return report;
}

/**
 * Should the scheduled job count this run as failed? Only when every profile
 * that had room to search failed at the research step; a partial run already
 * did useful work and its errors are in the report.
 */
export function runFailed(report) {
  const tried = report.profiles.filter((p) => p.share > 0);
  return tried.length > 0 && tried.every((p) => p.error);
}
