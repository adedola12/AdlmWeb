// src/pages/ProjectsGeneric.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  FaTrash,
  FaInfoCircle,
  FaLink,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import * as XLSX from "xlsx";

const TITLES = {
  revit: "Revit Projects",
  revitmep: "Revit MEP Projects",
  planswift: "PlanSwift Projects",
  "revit-materials": "Revit Materials",
  "revit-material": "Revit Materials",
};

function normTool(t) {
  return String(t || "")
    .trim()
    .toLowerCase();
}

function isMaterialsTool(tool) {
  const t = normTool(tool);
  return t === "revit-materials" || t === "revit-material";
}

function getEndpoints(tool) {
  const t = normTool(tool);

  if (t === "revit-materials" || t === "revit-material") {
    return {
      list: `/projects/revit/materials`,
      one: (id) => `/projects/revit/materials/${id}`,
      del: (id) => `/projects/revit/materials/${id}`,
    };
  }

  return {
    list: `/projects/${t}`,
    one: (id) => `/projects/${t}/${id}`,
    del: (id) => `/projects/${t}/${id}`,
  };
}

function materialDescription(it) {
  const takeoff = String(it?.takeoffLine || "").trim();
  const mat = String(it?.materialName || "").trim();
  if (takeoff || mat) return [takeoff, mat].filter(Boolean).join(" - ");
  return String(it?.description || "").trim();
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  const x = safeNum(n);
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sanitizeFilename(name) {
  return String(name || "BoQ")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

// tooltip
function Tip({ text }) {
  return (
    <span className="relative inline-flex items-center group">
      <FaInfoCircle className="text-slate-500" />
      <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap text-xs bg-slate-900 text-white px-2 py-1 rounded">
        {text}
      </span>
    </span>
  );
}

function ratesEqual(a, b) {
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (safeNum(A[k]) !== safeNum(B[k])) return false;
  }
  return true;
}

/** ---------------- Local cache helpers ----------------
 * v2 keys so old buggy cache won't override new behavior
 */
function cacheKey(tool, projectId) {
  return `takeoffRates:v2:${normTool(tool)}:${projectId}`;
}
function readCache(tool, projectId) {
  try {
    const raw = localStorage.getItem(cacheKey(tool, projectId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeCache(tool, projectId, payload) {
  try {
    localStorage.setItem(cacheKey(tool, projectId), JSON.stringify(payload));
  } catch {}
}

function linkKey(tool, projectId) {
  return `takeoffLinks:v2:${normTool(tool)}:${projectId}`;
}
function readLinkCache(tool, projectId) {
  try {
    const raw = localStorage.getItem(linkKey(tool, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function writeLinkCache(tool, projectId, payload) {
  try {
    localStorage.setItem(linkKey(tool, projectId), JSON.stringify(payload));
  } catch {}
}

function normalizeUnit(u) {
  const raw = String(u || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "bag" || raw === "bags") return "bag";
  if (
    raw === "t" ||
    raw === "ton" ||
    raw === "tons" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "t";
  const compact = raw.replace(/\s+/g, "");
  if (compact === "m3" || compact === "m³" || compact === "cum") return "m3";
  if (/\b(litre|liter|ltr|l)\b/.test(raw)) return "l";
  return raw;
}

/** ---------------- Similarity auto-grouping (Takeoffs) ---------------- */

const BRACKET_RE = /\[[^\]]*\]/g;
const NON_WORD_RE = /[^a-z0-9\s]/g;

const STOP = new Set([
  "the",
  "and",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "with",
  "without",
  "from",
  "all",
  "multiple",
  "picked",
  "floors",
  "floor",
  "level",
  "levels",
  "type",
  "generic",
  "interior",
  "exterior",
  "complete",
  "including",
  "as",
  "by",
  "into",
]);

const SYN = {
  rebar: "reinforcement",
  bars: "reinforcement",
  bar: "reinforcement",
  steel: "reinforcement",
  rendering: "render",
  plastering: "render",
  plaster: "render",
  rc: "concrete",
  rcc: "concrete",
};

function stripMeta(desc) {
  return String(desc || "")
    .replace(BRACKET_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(w) {
  const t = String(w || "").trim();
  if (!t) return "";
  return SYN[t] || t;
}

function tokenize(desc) {
  const s = stripMeta(desc)
    .toLowerCase()
    .replace(/–|—/g, "-")
    .replace(NON_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return [];

  const parts = s.split(" ").filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (STOP.has(p)) continue;
    if (/^\d+$/.test(p)) continue;
    if (p.length < 2) continue;
    out.push(normalizeToken(p));
  }
  return out.filter(Boolean);
}

function groupLabelFromDesc(desc) {
  const s = stripMeta(desc);
  if (!s) return "Similar items";
  const parts = s
    .split(" - ")
    .map((x) => x.trim())
    .filter(Boolean);
  const label = parts.slice(0, 2).join(" - ") || s;
  return label.length > 60 ? `${label.slice(0, 60)}…` : label;
}

function buildSimilarityGroups(items, getText) {
  const N = Array.isArray(items) ? items.length : 0;
  if (!N) return { itemGroupId: [], groupMeta: {} };

  const tokenSets = new Array(N);
  const df = new Map();

  for (let i = 0; i < N; i++) {
    const text = getText(items[i]);
    const toks = tokenize(text);
    const set = new Set(toks);
    tokenSets[i] = set;

    for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  }

  const idf = new Map();
  for (const [t, c] of df.entries()) {
    const w = Math.log((N + 1) / (c + 1)) + 1;
    idf.set(t, w);
  }

  const SIG_TOKENS = 4;
  const itemGroupId = new Array(N);
  const groupMeta = {};

  for (let i = 0; i < N; i++) {
    const set = tokenSets[i];
    const arr = Array.from(set);

    arr.sort((a, b) => {
      const wa = idf.get(a) || 1;
      const wb = idf.get(b) || 1;
      if (wb !== wa) return wb - wa;
      return a.localeCompare(b);
    });

    const top = arr.slice(0, SIG_TOKENS).sort((a, b) => a.localeCompare(b));
    const sig = top.length ? top.join("|") : "misc";

    itemGroupId[i] = sig;

    if (!groupMeta[sig]) {
      groupMeta[sig] = {
        id: sig,
        label: groupLabelFromDesc(getText(items[i])),
        count: 0,
      };
    }
    groupMeta[sig].count += 1;
  }

  return { itemGroupId, groupMeta };
}

/** ---------------- Materials grouping (by materialName) ---------------- */

const PAREN_RE = /\([^)]*\)/g;

function normalizeMaterialName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(PAREN_RE, " ")
    .replace(BRACKET_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTakeoffLine(line) {
  return String(line || "")
    .replace(BRACKET_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isBlockMaterial(materialNameNorm) {
  return /\bblocks?\b/.test(materialNameNorm);
}

function buildMaterialGroups(items) {
  const N = Array.isArray(items) ? items.length : 0;
  if (!N) return { itemGroupId: [], groupMeta: {} };

  const itemGroupId = new Array(N);
  const groupMeta = {};

  for (let i = 0; i < N; i++) {
    const it = items[i] || {};
    const matNorm = normalizeMaterialName(it.materialName);
    const takeoffNorm = normalizeTakeoffLine(it.takeoffLine);

    const gid = isBlockMaterial(matNorm)
      ? `block|${matNorm}|${takeoffNorm || "na"}`
      : `mat|${matNorm || "unknown"}`;

    itemGroupId[i] = gid;

    if (!groupMeta[gid]) {
      const label = isBlockMaterial(matNorm)
        ? `${(it.materialName || "Block").trim()} — ${(it.takeoffLine || "").trim()}`.trim()
        : `${(it.materialName || "Unknown Material").trim()}`;

      groupMeta[gid] = {
        id: gid,
        label: label.length > 60 ? `${label.slice(0, 60)}…` : label,
        count: 0,
      };
    }

    groupMeta[gid].count += 1;
  }

  return { itemGroupId, groupMeta };
}

/** ---------------- RateGen entitlement + auto-fill ---------------- */

const AUTO_FILL_PREF_KEY = "adlm:autoFillMaterialsRates:v1";
function readAutoFillPref() {
  try {
    const raw = localStorage.getItem(AUTO_FILL_PREF_KEY);
    if (raw == null) return null;
    return raw === "1";
  } catch {
    return null;
  }
}
function writeAutoFillPref(v) {
  try {
    localStorage.setItem(AUTO_FILL_PREF_KEY, v ? "1" : "0");
  } catch {}
}

function entitlementActive(ent) {
  if (!ent) return false;
  if (String(ent.status || "").toLowerCase() !== "active") return false;
  if (ent.expiresAt && new Date(ent.expiresAt).getTime() < Date.now())
    return false;
  return true;
}

function pickKeyFromCandidate(c) {
  return `${normalizeMaterialName(c?.description)}|${normalizeUnit(c?.unit)}`;
}

export default function ProjectsGeneric() {
  const { tool } = useParams();
  const title = TITLES[tool] || "Projects";
  const { accessToken } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();

  const endpoints = React.useMemo(() => getEndpoints(tool), [tool]);
  const showMaterials = isMaterialsTool(tool);

  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [err, setErr] = React.useState("");

  // rates editing
  const [rates, setRates] = React.useState({});
  const [baseRates, setBaseRates] = React.useState({});

  // linked groups
  const [linkedGroups, setLinkedGroups] = React.useState({});
  const [onlyFillEmpty, setOnlyFillEmpty] = React.useState(true);

  // save UX
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  // search (items)
  const [itemQuery, setItemQuery] = React.useState("");

  // optional: search projects list
  const [projectQuery, setProjectQuery] = React.useState("");

  // material resolve + picks
  const [matResolved, setMatResolved] = React.useState({
    pricesByKey: {},
    candidatesByKey: {},
  });
  const [matPicks, setMatPicks] = React.useState({});
  const [openPickKey, setOpenPickKey] = React.useState(null);

  // entitlement + auto-fill
  const [canRateGen, setCanRateGen] = React.useState(false);
  const [autoFillMaterialsRates, setAutoFillMaterialsRates] =
    React.useState(false);
  const [autoFillBusy, setAutoFillBusy] = React.useState(false);
  const autoFillAppliedRef = React.useRef({});

  const rowId = (r) => r?._id || r?.id || null;
  const selectedId = sel?._id || sel?.id;

  function itemKey(it, i) {
    const sn = it?.sn ?? i + 1;
    const code = String(it?.code || "");
    const desc = showMaterials
      ? materialDescription(it)
      : String(it?.description || "");
    return `${sn}::${code}::${desc}`;
  }

  function itemText(it) {
    return showMaterials
      ? materialDescription(it)
      : String(it?.description || "");
  }

  const items = Array.isArray(sel?.items) ? sel.items : [];
  const { itemGroupId, groupMeta } = React.useMemo(() => {
    if (showMaterials) return buildMaterialGroups(items);
    return buildSimilarityGroups(items, itemText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, showMaterials, items.length]);

  function groupIdForIndex(i) {
    return itemGroupId?.[i] || "";
  }
  function groupLabel(groupId) {
    return groupMeta?.[groupId]?.label || "Similar items";
  }
  function groupCount(groupId) {
    return safeNum(groupMeta?.[groupId]?.count);
  }
  function isGroupLinked(groupId) {
    return !!(groupId && linkedGroups?.[groupId]);
  }

  function initRatesFromProject(project) {
    const its = Array.isArray(project?.items) ? project.items : [];

    const base = {};
    const ui = {};

    for (let i = 0; i < its.length; i++) {
      const k = itemKey(its[i], i);
      const r = safeNum(its[i]?.rate);
      base[k] = r;
      ui[k] = r > 0 ? String(r) : "";
    }

    setBaseRates(base);

    const cached = project?._id ? readCache(tool, project._id) : null;
    if (cached && cached?.rates && typeof cached.rates === "object") {
      const nextUi = { ...ui };
      for (const [k, v] of Object.entries(cached.rates)) {
        if (!(k in nextUi)) continue;
        const serverVal = safeNum(base[k]);
        const cacheVal = safeNum(v);
        if (serverVal === 0 && cacheVal !== 0) nextUi[k] = String(cacheVal);
      }
      setRates(nextUi);
    } else {
      setRates(ui);
    }

    if (project?._id) {
      const lk = readLinkCache(tool, project._id);
      if (lk && typeof lk === "object") {
        setLinkedGroups(lk.linkedGroups || {});
        setMatPicks(lk.matPicks || {});
      } else {
        setLinkedGroups({});
        setMatPicks({});
      }
    } else {
      setLinkedGroups({});
      setMatPicks({});
    }
  }

  async function load() {
    setErr("");
    setNotice("");

    try {
      const list = await apiAuthed(endpoints.list, { token: accessToken });
      const safeList = Array.isArray(list) ? list : [];
      setRows(safeList);

      const preselectId = searchParams.get("project");
      const found = preselectId
        ? safeList.find((x) => rowId(x) === preselectId)
        : null;
      const firstId = rowId(safeList?.[0]);
      const toOpen = rowId(found) || firstId;

      if (toOpen) await view(toOpen);
      else {
        setSel(null);
        setRates({});
        setBaseRates({});
        setLinkedGroups({});
      }
    } catch (e) {
      setErr(e.message || "Failed to load projects");
      setSel(null);
      setRates({});
      setBaseRates({});
      setLinkedGroups({});
    }
  }

  async function view(id) {
    if (!id || id === "undefined") {
      setErr("Invalid project id");
      return;
    }

    setErr("");
    setNotice("");
    setItemQuery("");

    try {
      const p = await apiAuthed(endpoints.one(id), { token: accessToken });
      setSel(p);

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", id);
        return next;
      });

      initRatesFromProject(p);
    } catch (e) {
      setErr(e.message || "Failed to open project");
      setSel(null);
      setRates({});
      setBaseRates({});
      setLinkedGroups({});
    }
  }

  async function delProject(id, name) {
    if (!id) return;

    const ok = window.confirm(
      `Delete this saved project?\n\n${name || "Untitled"}\n\nThis cannot be undone.`,
    );
    if (!ok) return;

    setErr("");
    setNotice("");

    try {
      await apiAuthed(endpoints.del(id), {
        token: accessToken,
        method: "DELETE",
      });

      setRows((prev) =>
        Array.isArray(prev) ? prev.filter((r) => rowId(r) !== id) : [],
      );

      if (selectedId === id) {
        setSel(null);
        setRates({});
        setBaseRates({});
        setLinkedGroups({});

        const remaining = rows.filter((r) => rowId(r) !== id);
        const nextId = rowId(remaining?.[0]);
        if (nextId) await view(nextId);
      }
    } catch (e) {
      setErr(e?.message || "Failed to delete project");
    }
  }

  function applyRateToGroupFromRow(groupId, rowIndex, rateValueRaw) {
    if (!sel || !groupId) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const gv = safeNum(rateValueRaw);
    if (gv === 0) return;

    setRates((prev) => {
      const next = { ...(prev || {}) };

      for (let j = 0; j < its.length; j++) {
        if (j === rowIndex) continue;
        if (groupIdForIndex(j) !== groupId) continue;

        const kj = itemKey(its[j], j);

        const existing = (() => {
          const raw = next[kj];
          if (String(raw ?? "").trim() === "") return safeNum(its[j]?.rate);
          return safeNum(raw);
        })();

        if (onlyFillEmpty && existing !== 0) continue;
        next[kj] = String(gv);
      }
      return next;
    });
  }

  function toggleGroupLink(groupId, currentRowIndex) {
    if (!groupId) return;
    if (groupCount(groupId) < 2) return;

    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[currentRowIndex];
    if (!it) return;

    const k0 = itemKey(it, currentRowIndex);
    const currentVal =
      String(rates?.[k0] ?? "").trim() === ""
        ? safeNum(it?.rate)
        : safeNum(rates?.[k0]);

    setLinkedGroups((prev) => {
      const next = { ...(prev || {}) };
      const nowOn = !next[groupId];
      next[groupId] = nowOn;

      if (nowOn && currentVal !== 0) {
        setTimeout(
          () => applyRateToGroupFromRow(groupId, currentRowIndex, currentVal),
          0,
        );
      }
      return next;
    });
  }

  function handleRateChange(rowIndex, value) {
    if (!sel) return;
    const its = Array.isArray(sel?.items) ? sel.items : [];
    const it = its[rowIndex];
    if (!it) return;

    const k0 = itemKey(it, rowIndex);
    const groupId = groupIdForIndex(rowIndex);

    setRates((prev) => {
      const next = { ...(prev || {}), [k0]: value };

      if (!groupId || !isGroupLinked(groupId)) return next;
      if (String(value ?? "").trim() === "") return next;

      for (let j = 0; j < its.length; j++) {
        if (j === rowIndex) continue;
        if (groupIdForIndex(j) !== groupId) continue;

        const kj = itemKey(its[j], j);

        const existing =
          String(next[kj] ?? "").trim() === ""
            ? safeNum(its[j]?.rate)
            : safeNum(next[kj]);

        if (onlyFillEmpty && existing !== 0) continue;
        next[kj] = value;
      }
      return next;
    });
  }

  const isDirty = !ratesEqual(rates, baseRates);

  async function saveRatesToCloud() {
    if (!sel || !selectedId) return;
    if (!isDirty) return;

    setSaving(true);
    setErr("");
    setNotice("");

    try {
      const its = Array.isArray(sel?.items) ? sel.items : [];

      const updatedItems = its.map((it, i) => {
        const k = itemKey(it, i);
        const raw = rates?.[k];
        const use =
          String(raw ?? "").trim() === "" ? safeNum(it?.rate) : safeNum(raw);
        return { ...it, rate: use };
      });

      const payload = { baseVersion: sel?.version, items: updatedItems };

      const updated = await apiAuthed(endpoints.one(selectedId), {
        token: accessToken,
        method: "PUT",
        body: payload,
      });

      setSel(updated);
      initRatesFromProject(updated);

      setNotice("Saved. Your rates will remain after refresh/reload.");
    } catch (e) {
      const msg = e?.message || "Failed to save";
      if (String(msg).toLowerCase().includes("conflict")) {
        setErr(
          "This project was updated elsewhere. Please refresh and try again.",
        );
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    if (!selectedId) return;
    writeCache(tool, selectedId, {
      version: sel?.version ?? 0,
      rates: rates || {},
      savedAt: Date.now(),
    });
  }, [tool, selectedId, sel?.version, rates]);

  React.useEffect(() => {
    if (!selectedId) return;
    writeLinkCache(tool, selectedId, {
      linkedGroups: linkedGroups || {},
      matPicks: matPicks || {},
      savedAt: Date.now(),
    });
  }, [tool, selectedId, linkedGroups, matPicks]);

  /** ---------------- Entitlements check (RateGen) ---------------- */
  React.useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        const resp = await apiAuthed("/api/entitlements", {
          token: accessToken,
        });
        const ents = Array.isArray(resp?.entitlements) ? resp.entitlements : [];
        const rg = ents.find(
          (e) => String(e.productKey || "").toLowerCase() === "rategen",
        );
        const ok = entitlementActive(rg);
        if (!cancelled) setCanRateGen(ok);
      } catch {
        if (!cancelled) setCanRateGen(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  React.useEffect(() => {
    if (!showMaterials) return;

    if (!canRateGen) {
      setAutoFillMaterialsRates(false);
      return;
    }

    const pref = readAutoFillPref();
    if (pref == null) {
      setAutoFillMaterialsRates(true);
      writeAutoFillPref(true);
    } else {
      setAutoFillMaterialsRates(!!pref);
    }
  }, [showMaterials, canRateGen]);

  /** ---------------- Auto-fill material rates from RateGen ---------------- */
  async function resolveMaterialPrices(itemsReq) {
    return await apiAuthed("/rategen-v2/library/material-prices/resolve", {
      token: accessToken,
      method: "POST",
      body: {
        items: itemsReq,
        names: itemsReq.map((x) => x.name),
        includeMaster: true,
        includeUser: true,
        limitCandidates: 10,
      },
    });
  }

  async function autoFillMaterialRates(project) {
    if (!showMaterials) return;
    if (!canRateGen) return;
    if (!project?._id) return;

    const its = Array.isArray(project?.items) ? project.items : [];

    const uniq = new Map();
    for (const it of its) {
      const name = String(it?.materialName || "").trim();
      if (!name) continue;
      const unit = String(it?.unit || "").trim();
      const key = `${normalizeMaterialName(name)}|${normalizeUnit(unit)}`;
      if (!uniq.has(key)) uniq.set(key, { name, unit });
    }

    const reqItems = Array.from(uniq.values());
    if (!reqItems.length) return;

    setAutoFillBusy(true);
    setErr("");
    setNotice("");

    try {
      const resp = await resolveMaterialPrices(reqItems);

      const pricesByKey =
        resp?.pricesByKey && typeof resp.pricesByKey === "object"
          ? resp.pricesByKey
          : {};
      const candidatesByKey =
        resp?.candidatesByKey && typeof resp.candidatesByKey === "object"
          ? resp.candidatesByKey
          : {};

      setMatResolved({ pricesByKey, candidatesByKey });

      let matched = 0;
      let filled = 0;
      let unitConflicts = 0;

      setRates((prev) => {
        const next = { ...(prev || {}) };

        for (let i = 0; i < its.length; i++) {
          const it = its[i] || {};
          const k = itemKey(it, i);

          const matKey = normalizeMaterialName(it.materialName);
          const candidates = Array.isArray(candidatesByKey?.[matKey])
            ? candidatesByKey[matKey]
            : [];

          const pickedKey = matPicks?.[matKey] || null;
          const picked = pickedKey
            ? candidates.find((c) => pickKeyFromCandidate(c) === pickedKey)
            : null;

          const best = picked || pricesByKey?.[matKey];
          if (!best) continue;

          matched += 1;

          const price = safeNum(best.price);
          if (price <= 0) continue;

          const reqUnit = normalizeUnit(it.unit);
          const hitUnit = normalizeUnit(best.unit);
          if (reqUnit && hitUnit && reqUnit !== hitUnit) {
            unitConflicts += 1;
            continue;
          }

          const existing =
            String(next[k] ?? "").trim() === ""
              ? safeNum(it?.rate)
              : safeNum(next[k]);

          if (onlyFillEmpty && existing !== 0) continue;

          next[k] = String(price);
          filled += 1;
        }

        return next;
      });

      setNotice(
        filled > 0
          ? `Auto-filled ${filled} material rate(s). (${matched} match(es) found${
              unitConflicts ? `, ${unitConflicts} unit conflict(s)` : ""
            })`
          : `No rates were auto-filled. (${matched} match(es) found${
              unitConflicts ? `, ${unitConflicts} unit conflict(s)` : ""
            })`,
      );
    } catch (e) {
      setErr(e?.message || "Failed to auto-fill material rates");
    } finally {
      setAutoFillBusy(false);
    }
  }

  React.useEffect(() => {
    if (!showMaterials) return;
    if (!autoFillMaterialsRates) return;
    if (!canRateGen) return;
    if (!sel || !selectedId) return;

    if (autoFillAppliedRef.current[selectedId]) return;
    autoFillAppliedRef.current[selectedId] = true;

    autoFillMaterialRates(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaterials, autoFillMaterialsRates, canRateGen, selectedId]);

  function toggleAutoFill(v) {
    setAutoFillMaterialsRates(v);
    writeAutoFillPref(v);

    if (selectedId) delete autoFillAppliedRef.current[selectedId];
    if (v && sel) autoFillMaterialRates(sel);
  }

  // compute all rows
  const computedAll = items.map((it, i) => {
    const k = itemKey(it, i);
    const qty = safeNum(it?.qty);

    const rate =
      String(rates?.[k] ?? "").trim() === ""
        ? safeNum(it?.rate)
        : safeNum(rates?.[k]);

    const amount = rate * qty;
    const gid = groupIdForIndex(i);

    return {
      i,
      key: k,
      sn: it?.sn ?? i + 1,
      description: itemText(it),
      qty,
      unit: String(it?.unit || ""),
      groupId: gid,
      groupLabel: groupLabel(gid),
      groupCount: groupCount(gid),
      rate,
      amount,
    };
  });

  const totalAmount = computedAll.reduce(
    (acc, r) => acc + safeNum(r.amount),
    0,
  );

  const q = String(itemQuery || "")
    .trim()
    .toLowerCase();
  const computedShown = !q
    ? computedAll
    : computedAll.filter((r) => {
        return (
          String(r.description || "")
            .toLowerCase()
            .includes(q) ||
          String(r.groupLabel || "")
            .toLowerCase()
            .includes(q) ||
          String(r.sn || "")
            .toLowerCase()
            .includes(q)
        );
      });

  function exportBoQ() {
    if (!sel) return;

    const headers = ["S/N", "Description", "Qty", "Unit", "Rate", "Amount"];

    const rowsAoa = computedAll.map((r) => [
      r.sn,
      r.description,
      Number(r.qty.toFixed(2)),
      r.unit,
      Number(r.rate.toFixed(2)),
      Number(r.amount.toFixed(2)),
    ]);

    rowsAoa.push(["", "", "", "", "TOTAL", Number(totalAmount.toFixed(2))]);

    const aoa = [headers, ...rowsAoa];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 60 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BoQ");

    const filename = `${sanitizeFilename(sel?.name || "Project")} - BoQ.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [accessToken, tool]);

  const showRevitToggle = normTool(tool) === "revit" || isMaterialsTool(tool);

  const projectQ = String(projectQuery || "")
    .trim()
    .toLowerCase();
  const rowsShown = !projectQ
    ? rows
    : rows.filter((r) =>
        String(r?.name || "")
          .toLowerCase()
          .includes(projectQ),
      );

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* LEFT LIST */}
      <div className="card md:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-semibold">{title}</h1>

            {showRevitToggle && (
              <div className="mt-2 flex gap-2">
                <Link
                  to="/projects/revit"
                  className={`btn btn-sm ${normTool(tool) === "revit" ? "btn-primary" : ""}`}
                >
                  Takeoffs
                </Link>

                <Link
                  to="/projects/revit-materials"
                  className={`btn btn-sm ${isMaterialsTool(tool) ? "btn-primary" : ""}`}
                >
                  Materials
                </Link>
              </div>
            )}
          </div>

          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}

        {/* project search */}
        <div className="mt-3">
          <div className="flex items-center gap-2 border rounded-md px-2 py-1 bg-white">
            <FaSearch className="text-slate-500" />
            <input
              className="w-full outline-none text-sm"
              placeholder="Search projects..."
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
            />
            {!!projectQuery && (
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                onClick={() => setProjectQuery("")}
                title="Clear"
              >
                <FaTimes />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {rowsShown.map((r) => {
            const id = rowId(r);
            const active = selectedId === id;

            return (
              <div
                key={id || Math.random()}
                role="button"
                tabIndex={0}
                onClick={() => id && view(id)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && id) view(id);
                }}
                className={`w-full p-2 border rounded transition hover:bg-slate-50 flex items-start justify-between gap-3 ${
                  active ? "bg-blue-50 border-blue-200" : ""
                } ${!id ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-slate-600">
                    {r.itemCount} items ·{" "}
                    {new Date(r.updatedAt).toLocaleString()}
                  </div>
                </div>

                <button
                  type="button"
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    delProject(id, r?.name);
                  }}
                  disabled={!id}
                >
                  <FaTrash />
                </button>
              </div>
            );
          })}

          {rowsShown.length === 0 && (
            <div className="text-sm text-slate-600">No projects found.</div>
          )}
        </div>
      </div>

      {/* RIGHT BREAKDOWN */}
      <div className="card md:col-span-2">
        {!sel ? (
          <div className="text-sm text-slate-600">Select a project</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold mb-2">{sel.name}</h2>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={onlyFillEmpty}
                      onChange={(e) => setOnlyFillEmpty(e.target.checked)}
                    />
                    Only fill empty rates
                  </label>

                  {showMaterials && canRateGen && (
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoFillMaterialsRates}
                        onChange={(e) => toggleAutoFill(e.target.checked)}
                        disabled={autoFillBusy}
                      />
                      Auto-fill material rates (Rate Gen)
                    </label>
                  )}

                  {showMaterials && canRateGen && (
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => sel && autoFillMaterialRates(sel)}
                      disabled={autoFillBusy}
                      title="Fetch prices and auto-fill again"
                    >
                      {autoFillBusy ? "Syncing..." : "Sync prices"}
                    </button>
                  )}

                  <span className="inline-flex items-center gap-2">
                    <Tip
                      text={
                        showMaterials
                          ? canRateGen
                            ? "Auto-fill uses Admin RateGen + your saved material prices."
                            : "Subscribe to Rate Gen to auto-fill material prices."
                          : "Subscribe to the Rate Gen for rate update."
                      }
                    />
                  </span>

                  <span className="text-slate-500">
                    Linked groups:{" "}
                    <b className="text-slate-700">
                      {Object.keys(linkedGroups).filter((g) => linkedGroups[g])
                        .length || 0}
                    </b>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className={`btn btn-sm ${isDirty ? "btn-primary" : ""}`}
                  onClick={saveRatesToCloud}
                  disabled={!isDirty || saving}
                  title={
                    !isDirty ? "No changes to save" : "Save rates to cloud"
                  }
                >
                  {saving ? "Saving..." : "Save"}
                </button>

                <button className="btn btn-sm" onClick={exportBoQ}>
                  Export to Excel BoQ
                </button>
              </div>
            </div>

            {notice && (
              <div className="text-green-700 text-sm mt-2">{notice}</div>
            )}
            {err && <div className="text-red-600 text-sm mt-2">{err}</div>}

            {/* item search */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 border rounded-md px-2 py-2 bg-white w-full">
                <FaSearch className="text-slate-500" />
                <input
                  className="w-full outline-none text-sm"
                  placeholder="Search items (description / group / S/N)..."
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                />
                {!!itemQuery && (
                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-700"
                    onClick={() => setItemQuery("")}
                    title="Clear"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 mb-3 flex items-center justify-end">
              <div className="px-3 py-2 rounded-lg bg-slate-50 border text-sm">
                <span className="text-slate-600 mr-2">Total Amount:</span>
                <span className="font-semibold">{money(totalAmount)}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">S/N</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit</th>
                    <th className="py-2 pr-4">Rate</th>
                    <th className="py-2 pr-4">Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {computedShown.map((r) => {
                    const it = items[r.i];
                    const gid = r.groupId;
                    const linked = isGroupLinked(gid);
                    const canLink = gid && r.groupCount >= 2;

                    const matKey = showMaterials
                      ? normalizeMaterialName(it?.materialName)
                      : "";
                    const candidates = showMaterials
                      ? Array.isArray(matResolved?.candidatesByKey?.[matKey])
                        ? matResolved.candidatesByKey[matKey]
                        : []
                      : [];

                    const pickCandidate = (cand) => {
                      if (!cand) return;
                      const it0 = items[r.i];
                      if (!it0) return;

                      const mk = normalizeMaterialName(it0.materialName);
                      const pk = pickKeyFromCandidate(cand);

                      setMatPicks((prev) => ({ ...(prev || {}), [mk]: pk }));
                      handleRateChange(r.i, String(safeNum(cand.price) || 0));
                      setOpenPickKey(null);
                    };

                    return (
                      <tr key={r.key || r.i} className="border-b align-top">
                        <td className="py-2 pr-4">{r.sn}</td>
                        <td className="py-2 pr-4">{r.description}</td>
                        <td className="py-2 pr-4">{r.qty.toFixed(2)}</td>
                        <td className="py-2 pr-4">{r.unit}</td>

                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <input
                              className="input !h-9 !py-1 !px-2 w-[140px]"
                              type="number"
                              step="any"
                              value={rates?.[r.key] ?? ""}
                              placeholder={String(safeNum(it?.rate) || 0)}
                              onChange={(e) =>
                                handleRateChange(r.i, e.target.value)
                              }
                            />

                            <button
                              type="button"
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition ${
                                canLink
                                  ? linked
                                    ? "bg-blue-50 border-blue-300"
                                    : "hover:bg-slate-50"
                                  : "opacity-40 cursor-not-allowed"
                              }`}
                              title={
                                canLink
                                  ? linked
                                    ? `Linked: changes propagate to similar items`
                                    : `Click to link similar items`
                                  : "No similar items found to link"
                              }
                              disabled={!canLink}
                              onClick={() => toggleGroupLink(gid, r.i)}
                            >
                              <FaLink
                                className={
                                  linked ? "text-blue-700" : "text-slate-600"
                                }
                              />
                            </button>

                            {showMaterials && candidates.length > 0 && (
                              <div className="relative">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-md border hover:bg-slate-50"
                                  title="Pick matching material from RateGen"
                                  onClick={() =>
                                    setOpenPickKey(
                                      openPickKey === r.key ? null : r.key,
                                    )
                                  }
                                >
                                  <FaSearch className="text-slate-600" />
                                </button>

                                {openPickKey === r.key && (
                                  <div className="absolute right-0 mt-2 w-80 z-30 bg-white border rounded-lg shadow-lg overflow-hidden">
                                    <div className="px-3 py-2 text-xs text-slate-600 border-b">
                                      Choose match for:{" "}
                                      <b>
                                        {String(it?.materialName || "").trim()}
                                      </b>
                                    </div>

                                    <div className="max-h-64 overflow-auto">
                                      {candidates.slice(0, 10).map((c) => {
                                        const unitBad =
                                          normalizeUnit(it?.unit) &&
                                          normalizeUnit(c?.unit) &&
                                          normalizeUnit(it?.unit) !==
                                            normalizeUnit(c?.unit);

                                        return (
                                          <button
                                            key={pickKeyFromCandidate(c)}
                                            type="button"
                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b"
                                            onClick={() => pickCandidate(c)}
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="font-medium truncate">
                                                {c.description}
                                              </div>
                                              <div className="font-semibold">
                                                {money(c.price)}
                                              </div>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                              {c.unit} • {c.source}
                                              {unitBad && (
                                                <span className="text-amber-700 font-medium">
                                                  {" "}
                                                  • unit mismatch
                                                </span>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div className="p-2 flex justify-end">
                                      <button
                                        type="button"
                                        className="btn btn-xs"
                                        onClick={() => setOpenPickKey(null)}
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {!!gid && (
                            <div className="text-[11px] mt-1">
                              <span className="text-slate-500">Group:</span>{" "}
                              <span className="text-slate-700">
                                {r.groupLabel} ({r.groupCount})
                              </span>{" "}
                              {linked && (
                                <span className="text-blue-700 font-medium">
                                  • linked
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-2 pr-4 font-medium">
                          {money(r.amount)}
                        </td>
                      </tr>
                    );
                  })}

                  {items.length > 0 && (
                    <tr className="border-t">
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4 font-semibold">TOTAL</td>
                      <td className="py-3 pr-4 font-semibold">
                        {money(totalAmount)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-500 mt-3 space-y-1">
              <div>
                Project ID: <code>{selectedId}</code>
              </div>
              <div>
                <b>Tip:</b> You can still use the Project ID in your Windows
                plugin’s “Open from Cloud”.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
