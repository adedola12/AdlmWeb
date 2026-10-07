// A Rate Gen rate picked on a bill line prices that line's Budget at once.
//
// The server has done this since 23 Sep (POST .../bill/:code/price-from-rate,
// server/util/rateToBudget.js): material rows with quantities from the bill
// and the Material Constants and prices from the rate, ONE Labour row and ONE
// Plant row, and O&P back-solved so the bill line reproduces the pick. Nothing
// on the page ever called it, so a pick set the number and left the Budget on
// ₦0 placeholders for the QS to price by hand.
//
// Two rules for the page:
//
//   1. The body says WHICH rate, never what it costs beyond the per-bill-unit
//      figure the cell already showed (a unit conversion only the cell knows).
//      The server re-reads the rate from the user's own library.
//   2. The reply must not wipe the QS's other unsaved work. The rates, stamps,
//      actuals and progress he has not saved live in the page's own maps, not
//      in the project, and the Budget saves as it goes — so only the Budget,
//      the resources, the version and the priced lines themselves are taken
//      from the reply. The version matters: the next save sends it as
//      baseVersion, and a stale one is refused as a conflict.
//
// Pure — no React, no network. Unit-tested in priceFromRate.test.js.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const codeKey = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The request body for a rate-cell change, or null when the change is not a
 * pick out of the Rate Gen library (a typed figure, a cleared cell).
 */
export function priceFromRateBody(value, meta) {
  if (!meta || meta.source !== "rategen") return null;
  const description = String(meta.rateKey || "").trim();
  const unitCost = Math.round(num(value) * 100) / 100;
  if (!description || unitCost <= 0) return null;
  const body = { description, unitCost };
  const unit = String(meta.rateUnit || "").trim();
  if (unit) body.unit = unit;
  return body;
}

/** The API path for one bill line, under the project's own endpoint. */
export function priceFromRatePath(projectPath, code) {
  return `${projectPath}/bill/${encodeURIComponent(String(code))}/price-from-rate`;
}

/**
 * The open project after the server priced `codes` from a rate.
 *
 * Takes the Budget, resources and version from the server, and the priced
 * lines by code; every other line stays exactly as the page holds it.
 */
export function mergePricedProject(prev, server, codes) {
  if (!prev) return server || prev;
  if (!server) return prev;
  const wanted = new Set((codes || []).map(codeKey).filter(Boolean));
  const fromServer = new Map();
  for (const it of Array.isArray(server.items) ? server.items : []) {
    const k = codeKey(it?.code);
    if (k && wanted.has(k)) fromServer.set(k, it);
  }
  const items = (Array.isArray(prev.items) ? prev.items : []).map((it) => {
    const s = fromServer.get(codeKey(it?.code));
    return s ? { ...it, ...s } : it;
  });
  const next = { ...prev, items };
  for (const f of ["budgetItems", "resourceItems", "version", "updatedAt"]) {
    if (server[f] !== undefined) next[f] = server[f];
  }
  return next;
}

/** What to tell the QS when the Budget could not be priced from the pick. */
export function priceFromRateFailure(err) {
  const code = err?.code || err?.data?.code || "";
  if (code === "RATE_HAS_NO_BUILDUP") {
    return "This rate has no build-up, so its material and labour could not be priced. The rate is on the line.";
  }
  if (code === "RATE_NOT_FOUND") {
    return "That rate is no longer in your Rate Gen library, so the Budget was not priced. The rate is on the line.";
  }
  if (code === "VIEW_ONLY" || code === "RATES_MASKED") {
    return "Your access to this project cannot price its Budget. The rate is on the line.";
  }
  return "The Budget could not be priced from this rate. The rate is on the line; try picking it again.";
}
