// server/util/rategenCustomRateGuard.js
//
// WHY A CLIENT'S LIST CAN NO LONGER DELETE CUSTOM RATES.
//
// Rate Gen desktop up to 2.9.x never downloads custom rates. When it syncs
// (after an edit, at sign-in and at sign-out) it takes its own local Saved
// Rates as the whole truth: every cloud custom rate missing from that list was
// sent a DELETE, or the whole list was replaced by a bulk PUT. A rate built on
// the website's custom rate builder, or on another PC, was never on that list,
// so the next desktop sync erased it. A fresh install with no saved rates
// erased the lot.
//
// The rules here:
//   - A bulk PUT is an upsert. A rate missing from it is never removed, except
//     a desktop-made rate that an old desktop omitted (it may be that desktop's
//     own deletion), and that one is archived, not destroyed.
//   - An old desktop's DELETE of a rate made anywhere but a desktop is refused:
//     no old desktop ever held it, so it cannot be asking to delete it.
//   - Every removal is archived (deletedCustomRates) and can be restored.
//
// A desktop that pulls before it pushes and deletes only what its user
// deleted sends X-ADLM-Rates-Sync: 2, and its DELETE is taken at its word.

export const RATES_SYNC_HEADER = "x-adlm-rates-sync";
export const ARCHIVE_LIMIT = 200;

// Rate Gen desktop keys a custom rate by a .NET Guid (CustomRate.Id). The
// website builder keys it by a slug (customRateDraft.js newCustomRateId), so
// a rate stored before `origin` existed can still be placed.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clientIsSyncAware(req) {
  const v = Number(req?.get?.(RATES_SYNC_HEADER) ?? req?.headers?.[RATES_SYNC_HEADER]);
  return Number.isFinite(v) && v >= 2;
}

export function customRateOrigin(rate) {
  const stated = String(rate?.origin || "").trim().toLowerCase();
  if (stated) return stated;
  return GUID_RE.test(String(rate?.customRateId || "").trim()) ? "desktop" : "web";
}

const plain = (r) => (r && typeof r.toObject === "function" ? r.toObject() : r);
const idOf = (r) => String(r?.customRateId || r?.id || "").trim();

/** Put a removed rate in the archive, newest first, one copy per id. */
export function archiveCustomRate(lib, rate, reason) {
  const item = plain(rate);
  const id = idOf(item);
  if (!id) return;
  const rest = (lib.deletedCustomRates || []).map(plain).filter((r) => idOf(r) !== id);
  lib.deletedCustomRates = [
    { ...item, origin: customRateOrigin(item), deletedAt: new Date(), deletedReason: reason },
    ...rest,
  ].slice(0, ARCHIVE_LIMIT);
}

/**
 * The custom rates to store after a bulk PUT. `incoming` is already normalized
 * (and plant-preserved). Stored rates the payload left out are kept, unless an
 * old desktop left out a desktop-made rate: then it is archived and dropped.
 */
export function mergeBulkCustomRates(lib, incoming, { syncAware }) {
  const next = Array.isArray(incoming) ? [...incoming] : [];
  const sent = new Set(next.map(idOf));
  const sentAny = next.length > 0;
  const kept = [];
  const archived = [];

  for (const raw of lib.customRates || []) {
    const stored = plain(raw);
    const id = idOf(stored);
    if (!id || sent.has(id)) continue;

    // An empty list from an old desktop is a fresh install or an empty Saved
    // Rates, never "delete everything".
    const mayDrop =
      !syncAware && sentAny && customRateOrigin(stored) === "desktop";

    if (mayDrop) {
      archiveCustomRate(lib, stored, "omitted-by-desktop-sync");
      archived.push(id);
    } else {
      next.push(stored);
      kept.push(id);
    }
  }

  // Remember where each rate came from, so the rule above survives an id
  // format change.
  const byId = new Map((lib.customRates || []).map((r) => [idOf(r), plain(r)]));
  return {
    customRates: next.map((r) => ({
      ...r,
      origin: byId.has(idOf(r)) ? customRateOrigin(byId.get(idOf(r))) : customRateOrigin(r),
    })),
    kept,
    archived,
  };
}

/** Whether a DELETE of `stored` should be carried out. */
export function deleteDecision(stored, { syncAware }) {
  if (syncAware) return { allow: true, reason: "deleted-by-client" };
  if (customRateOrigin(stored) !== "desktop") {
    return { allow: false, reason: "made-elsewhere-legacy-desktop-cannot-delete" };
  }
  return { allow: true, reason: "deleted-by-legacy-desktop" };
}
