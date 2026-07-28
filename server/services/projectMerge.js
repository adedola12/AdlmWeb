// server/services/projectMerge.js
//
// Federated multi-discipline projects.
//
// THE PROBLEM
// A QUIV user measures the architectural Revit model and saves it, then
// measures the structural model and saves that. Both land as `revit` projects
// but as SEPARATE documents, because the plugin identifies a project by
// (userId, productKey, clientProjectKey, modelFingerprint) and the two models
// have different fingerprints. On the web the QS wants one project: one bill,
// one budget, one valuation. In the plugin they must stay separate, because
// each Revit model can only re-save the lines it actually measured.
//
// THE APPROACH — federate, never absorb
// The container is a document that owns NO items. It links its sources with
// linkType "merge" and resolves their bills and budgets on read. The sources
// are untouched and remain the plugin's save/open target, so QUIV and HERON
// need no change and no rebuild: "only architectural opens for architectural"
// falls out for free, because the plugin never stops talking to the same
// document it always did. Re-saving from the plugin therefore flows straight
// through to the merged view on the next read.
//
// The alternative — copying items into one document and deleting the sources —
// would need the plugins to ask for a single discipline on reopen, which means
// changing and redistributing the C# plugins. That is the whole reason this
// module resolves rather than copies.
//
// LINE IDENTITY
// Two sources can easily use the same bill code ("C1" in both architectural
// and structural). Identity is therefore namespaced with the source id on the
// way out, so nothing collides and every resolved line can be routed back to
// the document that owns it.

import { TakeoffProject } from "../models/TakeoffProject.js";

// Separator for namespaced identities. "::" cannot appear in a Mongo ObjectId
// or in the plugin-generated codes, so it round-trips unambiguously.
const NS = "::";

export function isMergeContainer(project) {
  return !!project?.mergeContainer;
}

export function mergeLinks(project) {
  return (Array.isArray(project?.linkedProjects) ? project.linkedProjects : []).filter(
    (l) => l && l.linkType === "merge" && l.projectId,
  );
}

// "<sourceId>::<originalIdentity>" — unique across sources, and reversible.
export function namespacedIdentity(sourceId, identity) {
  return `${String(sourceId)}${NS}${String(identity ?? "")}`;
}

// Split a namespaced identity back into { sourceProjectId, identity }, or null
// when the value is not namespaced (i.e. it belongs to a normal project).
export function splitIdentity(value) {
  const s = String(value ?? "");
  const i = s.indexOf(NS);
  if (i <= 0) return null;
  return { sourceProjectId: s.slice(0, i), identity: s.slice(i + NS.length) };
}

function discOf(link, project) {
  const d = String(link?.discipline || "").trim().toLowerCase();
  if (d && d !== "other") return d;
  // Fall back to whatever the source's own lines agree on, then to "other".
  const seen = new Set(
    (Array.isArray(project?.items) ? project.items : [])
      .map((it) => String(it?.discipline || "").trim().toLowerCase())
      .filter(Boolean),
  );
  return seen.size === 1 ? [...seen][0] : "other";
}

/**
 * Load the source projects behind a container, in the order they were linked.
 * Owner-scoped: only the caller's own projects resolve, so a collaborator on
 * the container can never pull in a project they were not given access to.
 *
 * @returns {Promise<Array<{ link, project, discipline }>>} missing sources are
 *          dropped (reported separately by resolveMergedProject).
 */
export async function loadMergeSources(container, userId) {
  const links = mergeLinks(container);
  if (!links.length) return [];
  const ids = links.map((l) => l.projectId);
  const rows = await TakeoffProject.find({ _id: { $in: ids }, userId }).lean();
  const byId = new Map(rows.map((p) => [String(p._id), p]));
  const out = [];
  for (const link of links) {
    const project = byId.get(String(link.projectId));
    if (!project) continue;
    out.push({ link, project, discipline: discOf(link, project) });
  }
  return out;
}

// Tag one source's lines with where they came from and namespace their
// identity. `codeField` differs between bill items (`code`) and budget lines
// (`billIdentity`), and both must be namespaced or the budget would bind to
// the wrong discipline's bill line.
function tagLines(lines, { sourceId, sourceName, discipline, productKey }, codeField) {
  return (Array.isArray(lines) ? lines : []).map((raw) => {
    const line = { ...raw };
    line.sourceProjectId = String(sourceId);
    line.sourceName = sourceName;
    line.sourceProductKey = productKey;
    if (!String(line.discipline || "").trim()) line.discipline = discipline;
    if (codeField && line[codeField]) {
      line[`${codeField}Original`] = line[codeField];
      line[codeField] = namespacedIdentity(sourceId, line[codeField]);
    }
    return line;
  });
}

/**
 * Resolve a container into a project-shaped object with a combined bill and
 * budget. The returned object is NOT a mongoose document and is never saved —
 * it exists only to be read.
 *
 * Commercial state (contract, certificates, final account, valuation settings)
 * is deliberately taken from the CONTAINER, not from the sources: the merged
 * project is the commercial entity, so one contract sum and one certificate
 * series govern all disciplines.
 */
export async function resolveMergedProject(container, userId) {
  const sources = await loadMergeSources(container, userId);
  const linked = mergeLinks(container);

  const items = [];
  const budgetItems = [];
  const materialItems = [];
  const provisionalSums = [];
  const variations = [];
  const parts = [];

  for (const { project, discipline } of sources) {
    const meta = {
      sourceId: project._id,
      sourceName: project.name,
      discipline,
      productKey: project.productKey,
    };
    const srcItems = tagLines(project.items, meta, "code");
    const srcBudget = tagLines(project.budgetItems, meta, "billIdentity");
    const srcMaterial = tagLines(project.materialItems, meta, "sourceTakeoffCode");

    items.push(...srcItems);
    budgetItems.push(...srcBudget);
    materialItems.push(...srcMaterial);
    // Provisional sums and variations are measurements too, so they travel
    // with their source. Contract/certificates deliberately do not.
    provisionalSums.push(...tagLines(project.provisionalSums, meta, null));
    variations.push(...tagLines(project.variations, meta, null));

    parts.push({
      projectId: String(project._id),
      name: project.name,
      productKey: project.productKey,
      discipline,
      itemCount: srcItems.length,
      budgetCount: srcBudget.length,
      updatedAt: project.updatedAt,
      version: project.version,
      // Surfaced so the UI can warn that a source is separately locked; the
      // container owns the commercial state, so a locked source is a leftover
      // from before the merge rather than something that governs it.
      sourceContractLocked: !!project?.contract?.locked,
    });
  }

  const resolvedIds = new Set(sources.map((s) => String(s.project._id)));
  const missing = linked
    .filter((l) => !resolvedIds.has(String(l.projectId)))
    .map((l) => ({ projectId: String(l.projectId), label: l.label || "" }));

  const plain = typeof container.toObject === "function" ? container.toObject() : { ...container };

  return {
    ...plain,
    items,
    budgetItems,
    materialItems,
    provisionalSums,
    variations,
    // Merge-specific read-only metadata for the client.
    merge: {
      isContainer: true,
      parts,
      // A source the caller can't load (deleted, or owned by someone else).
      // Reported rather than silently dropped so the QS knows the combined
      // total is short.
      missing,
      disciplines: [...new Set(parts.map((p) => p.discipline))],
    },
  };
}

/**
 * Route a namespaced identity back to the source document that owns it.
 * Every write against a merged project must go through this — the container
 * holds no items, so writing to it would silently discard the edit.
 *
 * @returns {Promise<{ project, identity } | null>}
 */
export async function resolveSourceForIdentity(container, userId, namespaced) {
  const split = splitIdentity(namespaced);
  if (!split) return null;
  const allowed = new Set(mergeLinks(container).map((l) => String(l.projectId)));
  if (!allowed.has(split.sourceProjectId)) return null;
  const project = await TakeoffProject.findOne({
    _id: split.sourceProjectId,
    userId,
  });
  if (!project) return null;
  return { project, identity: split.identity };
}
