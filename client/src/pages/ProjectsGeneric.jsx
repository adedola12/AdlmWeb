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

// grouping
function rateGroupFromText(text) {
  const s = String(text || "").toLowerCase();

  if (s.includes("concrete")) return "concrete";
  if (s.includes("formwork")) return "formwork";
  if (s.includes("block")) return "blockwork";
  if (s.includes("rebar") || s.includes("reinforcement"))
    return "reinforcement";
  if (s.includes("plaster") || s.includes("render")) return "plastering";
  if (s.includes("paint")) return "painting";
  if (s.includes("tile") || s.includes("tiling")) return "tiling";
  if (s.includes("roof")) return "roofing";
  if (
    s.includes("excavation") ||
    s.includes("earthwork") ||
    s.includes("earth work")
  )
    return "earthwork";

  return "";
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

// local cache helpers (prevents reload loss if user didn’t save or server response is delayed)
function cacheKey(tool, projectId) {
  return `takeoffRates:${normTool(tool)}:${projectId}`;
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

  // linked groups (controls auto-copy)
  const [linkedGroups, setLinkedGroups] = React.useState({}); // { concrete: true, ... }
  const [onlyFillEmpty, setOnlyFillEmpty] = React.useState(true);

  // save UX
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  // search (items)
  const [itemQuery, setItemQuery] = React.useState("");

  // optional: search projects list
  const [projectQuery, setProjectQuery] = React.useState("");

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

  function rateGroupForItem(it) {
    return rateGroupFromText(itemText(it));
  }

  function isGroupLinked(group) {
    return !!(group && linkedGroups?.[group]);
  }

  function toggleGroupLink(group, currentRowIndex) {
    if (!group) return;

    setLinkedGroups((prev) => {
      const next = { ...(prev || {}) };
      next[group] = !next[group];
      return next;
    });

    // nice UX: if enabling link and current row has a rate, apply it immediately to others
    const items = Array.isArray(sel?.items) ? sel.items : [];
    const it = items[currentRowIndex];
    if (!it) return;

    const k0 = itemKey(it, currentRowIndex);
    const vRaw = rates?.[k0];
    const v =
      String(vRaw ?? "").trim() === "" ? safeNum(it?.rate) : safeNum(vRaw);

    if (v === 0) return;

    // apply current rate to others in the same group (respect onlyFillEmpty)
    setRates((prev) => {
      const next = { ...(prev || {}) };
      for (let j = 0; j < items.length; j++) {
        if (j === currentRowIndex) continue;
        if (rateGroupForItem(items[j]) !== group) continue;

        const kj = itemKey(items[j], j);
        const already =
          String(next[kj] ?? "").trim() === ""
            ? safeNum(items[j]?.rate)
            : safeNum(next[kj]);
        if (onlyFillEmpty && already !== 0) continue;

        next[kj] = v;
      }
      return next;
    });
  }

  function initRatesFromProject(project) {
    const items = Array.isArray(project?.items) ? project.items : [];
    const map = {};
    for (let i = 0; i < items.length; i++) {
      const k = itemKey(items[i], i);
      map[k] = safeNum(items[i]?.rate);
    }

    // set base from server
    setBaseRates(map);

    // overlay any cached rates (so reload won’t “lose” in-progress edits)
    const cached = project?._id ? readCache(tool, project._id) : null;
    if (cached && cached?.rates && typeof cached.rates === "object") {
      // if cache is same or newer version, apply it
      if (
        typeof cached.version === "number" &&
        typeof project.version === "number"
      ) {
        if (cached.version >= project.version) {
          setRates({ ...map, ...cached.rates });
          return;
        }
      }
      // fallback: if server rates look empty but cache has values, apply cache
      const serverAllZero = Object.values(map).every((x) => safeNum(x) === 0);
      const cacheHasAny = Object.values(cached.rates).some(
        (x) => safeNum(x) !== 0,
      );
      if (serverAllZero && cacheHasAny) {
        setRates({ ...map, ...cached.rates });
        return;
      }
    }

    setRates(map);
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
      }
    } catch (e) {
      setErr(e.message || "Failed to load projects");
      setSel(null);
      setRates({});
      setBaseRates({});
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

      // ✅ keep selection in URL so reload opens same project
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

        const remaining = rows.filter((r) => rowId(r) !== id);
        const nextId = rowId(remaining?.[0]);
        if (nextId) await view(nextId);
      }
    } catch (e) {
      setErr(e?.message || "Failed to delete project");
    }
  }

  function handleRateChange(rowIndex, value) {
    if (!sel) return;
    const items = Array.isArray(sel?.items) ? sel.items : [];
    const it = items[rowIndex];
    if (!it) return;

    const k0 = itemKey(it, rowIndex);
    const group = rateGroupForItem(it);

    setRates((prev) => {
      const next = { ...(prev || {}), [k0]: value };

      // ✅ auto-copy only when that group is linked
      if (!group || !isGroupLinked(group)) return next;

      if (String(value ?? "").trim() === "") return next; // don’t propagate blank

      for (let j = 0; j < items.length; j++) {
        if (j === rowIndex) continue;
        if (rateGroupForItem(items[j]) !== group) continue;

        const kj = itemKey(items[j], j);

        const existing =
          String(next[kj] ?? "").trim() === ""
            ? safeNum(items[j]?.rate)
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
      const items = Array.isArray(sel?.items) ? sel.items : [];

      const updatedItems = items.map((it, i) => {
        const k = itemKey(it, i);
        const raw = rates?.[k];

        // important: if user left blank, keep existing it.rate (server value)
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

      // If backend returns the updated doc with rates, great.
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

  // ✅ Cache rates locally so reload doesn’t wipe unsaved work
  React.useEffect(() => {
    if (!selectedId) return;
    // store only when there is a selection
    writeCache(tool, selectedId, {
      version: sel?.version ?? 0,
      rates: rates || {},
      savedAt: Date.now(),
    });
  }, [tool, selectedId, sel?.version, rates]);

  const items = Array.isArray(sel?.items) ? sel.items : [];

  // compute all rows (for totals + export)
  const computedAll = items.map((it, i) => {
    const k = itemKey(it, i);
    const qty = safeNum(it?.qty);

    const rate =
      String(rates?.[k] ?? "").trim() === ""
        ? safeNum(it?.rate)
        : safeNum(rates?.[k]);

    const amount = rate * qty;

    return {
      i,
      key: k,
      sn: it?.sn ?? i + 1,
      description: itemText(it),
      qty,
      unit: String(it?.unit || ""),
      group: rateGroupForItem(it),
      rate,
      amount,
    };
  });

  const totalAmount = computedAll.reduce(
    (acc, r) => acc + safeNum(r.amount),
    0,
  );

  // ✅ item search filter (does not affect totals/export)
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
          String(r.group || "")
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

  // project list filter
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

                  <span className="inline-flex items-center gap-2">
                    <Tip text="Subscribe to the Rate Gen for rate update." />
                  </span>

                  <span className="text-slate-500">
                    Linked groups:{" "}
                    <b className="text-slate-700">
                      {Object.keys(linkedGroups)
                        .filter((g) => linkedGroups[g])
                        .join(", ") || "None"}
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
                    const group = r.group;
                    const linked = isGroupLinked(group);

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

                            {/* ✅ Link toggle (highlights when active) */}
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition ${
                                group
                                  ? linked
                                    ? "bg-blue-50 border-blue-300"
                                    : "hover:bg-slate-50"
                                  : "opacity-40 cursor-not-allowed"
                              }`}
                              title={
                                group
                                  ? linked
                                    ? `Linked: changes propagate to (${group}) items`
                                    : `Click to link (${group}) items`
                                  : "No similar group detected"
                              }
                              disabled={!group}
                              onClick={() => toggleGroupLink(group, r.i)}
                            >
                              <FaLink
                                className={
                                  linked ? "text-blue-700" : "text-slate-600"
                                }
                              />
                            </button>
                          </div>

                          {group && (
                            <div className="text-[11px] mt-1">
                              <span className="text-slate-500">Group:</span>{" "}
                              <span className="text-slate-700">{group}</span>{" "}
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
