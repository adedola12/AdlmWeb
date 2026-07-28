// server/services/adlmAiService.js
// Thin client for the ADLM AI Service (separate serverless API on AWS —
// repo: adlm-ai-service, Lambda + API Gateway). It owns the QS cost-
// intelligence features that are grounded in the RateGen library and BESMM 4R:
//
//   POST /api/ai/boq-check     per-item market verdict vs RateGen benchmarks
//   POST /api/ai/outliers      duplicate / unit / quantity / semantic errors
//   POST /api/ai/rate-buildup  a component-level unit-rate build-up
//
// Auth: we forward the CALLER'S OWN access token. The AI service verifies it
// with the shared JWT_ACCESS_SECRET and then resolves entitlements through
// ADLM Cloud's /api/entitlements API. That matters for two reasons:
//   1. the tenant the AI service meters, quotas and audits is the real user —
//      never this server, and never another user;
//   2. we never mint or hold a service-wide credential that could read or
//      spend on someone else's behalf.
// Consequently these tools only work for a logged-in visitor, and only when
// their account has the active `ai` add-on entitlement (403 AI_NOT_ENTITLED
// otherwise, which Ada turns into an upsell rather than an error).
//
// Disabled by default: with ADLM_AI_URL unset, aiServiceEnabled() is false and
// the tools are never offered, so nothing changes for existing deployments.

const BASE = String(process.env.ADLM_AI_URL || "").trim().replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.ADLM_AI_TIMEOUT_MS || 25000);

export function aiServiceEnabled() {
  return !!BASE;
}

/**
 * POST to the AI service on the caller's behalf.
 * @param {string} path   e.g. "/api/ai/boq-check"
 * @param {object} body
 * @param {string} accessToken  the visitor's own Bearer token
 * @returns {Promise<{ok:boolean, status:number, data:any, code?:string}>}
 */
async function post(path, body, accessToken) {
  if (!BASE) return { ok: false, status: 0, code: "NOT_CONFIGURED", data: null };
  if (!accessToken) return { ok: false, status: 401, code: "NO_TOKEN", data: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        // Attributes AI usage to the web product in the service's reporting.
        "x-adlm-product": "cloud",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, code: data?.code || "", data };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    console.error(`[adlmAiService] ${path} failed:`, aborted ? "timeout" : e?.message || e);
    return { ok: false, status: 0, code: aborted ? "TIMEOUT" : "NETWORK", data: null };
  } finally {
    clearTimeout(timer);
  }
}

// One place to turn the service's failure codes into a sentence Ada can say.
// The entitlement case is deliberately phrased as an offer — it is the honest
// answer AND the natural upsell.
function explainFailure({ status, code }) {
  if (code === "NOT_CONFIGURED")
    return "The AI cost-intelligence service isn't configured on this server, so this check can't run. Tell the user this feature isn't available right now and offer WhatsApp.";
  if (status === 403 || code === "AI_NOT_ENTITLED")
    return "The user does NOT have the ADLM AI add-on on their account, which is what powers rate benchmarking and error checking. Explain warmly what the add-on does (checks every BoQ rate against ADLM's RateGen market library, flags unit/quantity/duplicate errors, and builds up rates component by component) and offer it as a next step. Do NOT invent a price — if it isn't in the catalog, offer to have the team reach out.";
  if (status === 429 || code === "QUOTA_EXCEEDED")
    return "The user's monthly AI quota is used up. Say so plainly and offer to connect them to the team about raising it.";
  if (code === "TIMEOUT")
    return "The AI check took too long to respond. Apologise briefly and suggest trying again in a moment.";
  if (status === 401 || code === "NO_TOKEN" || code === "BAD_TOKEN")
    return "The user's session couldn't be verified for this check — ask them to sign in again.";
  if (code === "NOT_YET_AVAILABLE")
    return "That AI feature isn't launched yet. Say so plainly — do NOT improvise the answer.";
  return "The AI cost-intelligence service couldn't be reached. Apologise briefly, answer from the project data you already have if you can, and offer WhatsApp.";
}

function pct(n) {
  return Number.isFinite(Number(n)) ? `${Number(n) > 0 ? "+" : ""}${Number(n).toFixed(0)}%` : "—";
}

function naira(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `₦${Math.round(n).toLocaleString("en-NG")}` : "—";
}

/* ─────────────────────────── BoQ market check ─────────────────────────── */
// items: [{ ref, description, unit, quantity, rate }] — built from the user's
// real bill by agentUserData.getBillItemsForAi.
export async function checkRatesAgainstMarket({ items, zone, accessToken, projectName }) {
  const r = await post("/api/ai/boq-check", { items, zone: zone || undefined }, accessToken);
  if (!r.ok) return explainFailure(r);

  const result = r.data?.result || {};
  const s = result.summary || {};
  const verdicts = Array.isArray(result.verdicts) ? result.verdicts : [];
  const byRef = new Map(items.map((i) => [String(i.ref), i]));

  const lines = [];
  lines.push(`Market rate check for "${projectName}" — ${s.items ?? verdicts.length} line(s) checked${result.zone ? ` (zone: ${result.zone})` : ""}.`);
  lines.push(
    `Summary: ${s.overMarket ?? 0} above market, ${s.underMarket ?? 0} below market, ${s.inRange ?? 0} in range, ${s.mismatches ?? 0} unit mismatch(es).`,
  );

  // Lead with the problems — that is the whole value of the check.
  const problems = verdicts.filter((v) => v.verdict !== "in_range");
  if (!problems.length) {
    lines.push("");
    lines.push("Every checked rate sits within market range of the RateGen benchmark. Say so — it's good news worth stating plainly.");
  } else {
    lines.push("");
    lines.push("Lines needing attention (worst first):");
    const ranked = [...problems].sort(
      (a, b) => Math.abs(Number(b.deviationPercent) || 0) - Math.abs(Number(a.deviationPercent) || 0),
    );
    for (const v of ranked.slice(0, 20)) {
      const it = byRef.get(String(v.ref));
      const desc = String(it?.description || `item ${v.ref}`).slice(0, 80);
      const bench = v.benchmark
        ? ` Benchmark: ${naira(v.benchmark.rateNgn)}/${v.benchmark.unit} ("${v.benchmark.description}").`
        : "";
      lines.push(
        `- ${desc} — quoted ${naira(it?.rate)}/${it?.unit || "?"}, verdict ${v.verdict.replace(/_/g, " ")} ${pct(v.deviationPercent)}.${bench} ${v.reason || ""}`.trim(),
      );
    }
    if (ranked.length > 20) lines.push(`(…and ${ranked.length - 20} more flagged lines.)`);
  }

  if (s.unbenchmarked) {
    lines.push("");
    lines.push(
      `${s.unbenchmarked} line(s) had no RateGen library benchmark and were judged by the model instead — flag those as lower confidence.`,
    );
  }
  lines.push("");
  lines.push(
    `Present the verdicts as ADVISORY, exactly as returned — never restate a rate as "correct". ${r.data?.disclaimer || ""}`.trim(),
  );
  return lines.join("\n");
}

/* ─────────────────────────── Error / outlier scan ─────────────────────── */
export async function scanProjectForErrors({ items, accessToken, projectName }) {
  const r = await post("/api/ai/outliers", { items }, accessToken);
  if (!r.ok) return explainFailure(r);

  const result = r.data?.result || {};
  const flags = Array.isArray(result.flags) ? result.flags : [];
  const byRef = new Map(items.map((i) => [String(i.ref), i]));

  const lines = [];
  lines.push(
    `Error scan for "${projectName}" — ${result.itemsChecked ?? items.length} line(s) checked, ${result.flagCount ?? flags.length} issue(s) found.`,
  );

  if (!flags.length) {
    lines.push("No duplicates, unit errors, quantity outliers or semantic problems were found. Say so plainly — that's a clean bill.");
    return lines.join("\n");
  }

  const byType = new Map();
  for (const f of flags) {
    const t = String(f.type || "other");
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  lines.push(`Breakdown: ${[...byType.entries()].map(([t, c]) => `${t.replace(/_/g, " ")} ×${c}`).join(", ")}.`);
  lines.push("");
  lines.push("Issues (highest confidence first):");
  for (const f of [...flags].sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 20)) {
    const it = byRef.get(String(f.ref));
    const desc = String(it?.description || `item ${f.ref}`).slice(0, 80);
    lines.push(
      `- [${String(f.type || "issue").replace(/_/g, " ")}] ${desc} (${it?.quantity ?? "?"} ${it?.unit || "?"} @ ${naira(it?.rate)}) — ${f.reason || ""}`,
    );
  }
  if (flags.length > 20) lines.push(`(…and ${flags.length - 20} more.)`);
  lines.push("");
  lines.push(
    `These are ADVISORY flags for the QS to review, not corrections to apply automatically. ${r.data?.disclaimer || ""}`.trim(),
  );
  return lines.join("\n");
}

/* ─────────────────────────── Rate build-up ────────────────────────────── */
export async function buildUpRate({ description, unit, zone, accessToken }) {
  const r = await post("/api/ai/rate-buildup", { description, unit: unit || undefined, zone: zone || undefined }, accessToken);
  if (!r.ok) return explainFailure(r);

  // Shape from rateBuildupService.totalize():
  // { unit, zone, components:[{kind,name,quantity,unit,unitPriceNgn,totalNgn,
  //   source,libraryRef,pricedZone}], overheadPercent, profitPercent,
  //   netCostNgn, overheadNgn, profitNgn, rateNgn, notes }
  const result = r.data?.result || {};
  const components = Array.isArray(result.components) ? result.components : [];
  const lines = [];
  lines.push(
    `Rate build-up for "${description}"${result.unit ? ` — per ${result.unit}` : unit ? ` — per ${unit}` : ""}${result.zone ? ` (zone: ${result.zone})` : ""}:`,
  );

  if (result.rateNgn !== undefined && result.rateNgn !== null) {
    lines.push(`UNIT RATE: ${naira(result.rateNgn)}${result.unit ? ` per ${result.unit}` : ""}`);
  }

  if (components.length) {
    lines.push("");
    lines.push("Build-up:");
    for (const c of components.slice(0, 30)) {
      const src = c.source === "library" ? "library" : "inferred by model";
      const zoneTag = c.pricedZone ? `, ${c.pricedZone} price` : "";
      lines.push(
        `- ${c.name || "(component)"} [${c.kind || "material"}]: ${c.quantity ?? "?"} ${c.unit || ""} @ ${naira(c.unitPriceNgn)} = ${naira(c.totalNgn)} (${src}${zoneTag})`,
      );
    }
    if (components.length > 30) lines.push(`(…and ${components.length - 30} more components.)`);

    const fromLibrary = components.filter((c) => c.source === "library").length;
    lines.push("");
    lines.push(
      `${fromLibrary} of ${components.length} components were looked up in the RateGen library; the rest were inferred by the model.`,
    );
  }

  lines.push("");
  lines.push(
    `Net cost ${naira(result.netCostNgn)} + overhead ${result.overheadPercent ?? 0}% (${naira(result.overheadNgn)}) + profit ${result.profitPercent ?? 0}% (${naira(result.profitNgn)}) = ${naira(result.rateNgn)}.`,
  );
  if (result.notes) lines.push(`Notes: ${result.notes}`);
  if (Array.isArray(result.libraryCandidatesConsidered) && result.libraryCandidatesConsidered.length) {
    lines.push(`Library items considered: ${result.libraryCandidatesConsidered.join("; ")}.`);
  }

  const conf = r.data?.audit?.confidence;
  lines.push("");
  lines.push(
    `Quote these figures exactly and say which components came from the library versus were inferred — that is the difference between a benchmark and an estimate.${
      typeof conf === "number" ? ` Overall confidence ${(conf * 100).toFixed(0)}%.` : ""
    } ${r.data?.disclaimer || ""}`.trim(),
  );
  // Raw fallback so Ada is never left empty-handed if the service's shape shifts.
  if (!components.length && result.rateNgn === undefined) {
    lines.push("");
    lines.push(`Raw result: ${JSON.stringify(result).slice(0, 1500)}`);
  }
  return lines.join("\n");
}
