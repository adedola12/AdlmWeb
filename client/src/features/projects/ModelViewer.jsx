// src/features/projects/ModelViewer.jsx
//
// 3D model tab for an open project. Lazy-loaded (it pulls in three.js + the
// web-ifc wasm) so those only download when a user actually opens this tab.
//
// The link that makes this useful: each mesh is tagged with its Revit Element
// ID, so selecting a BoQ line highlights the exact elements its quantity came
// from, and clicking an element traces back to the BoQ lines that measured it.

import React from "react";
import { IfcViewer } from "../../lib/ifcViewer.js";
import { deriveItemDiscipline } from "../../lib/boqCategory.js";
import { API_BASE } from "../../config";

const DISCIPLINE_LABELS = {
  architectural: "Architectural",
  structural: "Structural",
  mep: "MEP",
};

function itemLabel(it) {
  const takeoff = String(it?.takeoffLine || "").trim();
  const mat = String(it?.materialName || "").trim();
  const joined = [takeoff, mat].filter(Boolean).join(" — ");
  return joined || String(it?.description || "").trim() || "(unnamed item)";
}

// A single element's share of a line's quantity. Reads the per-element split
// (elementQuantities) when present; otherwise falls back to an even split of
// the line total across its elements (flagged estimated so the UI shows ≈).
function elementQtyFor(it, id) {
  const eqs = it?.elementQuantities;
  if (Array.isArray(eqs) && eqs.length) {
    const hit = eqs.find((e) => Number(e?.id) === id);
    if (hit && Number.isFinite(Number(hit.qty))) {
      return { qty: Number(hit.qty), estimated: !!it.elementQuantitiesEstimated };
    }
  }
  const ids = it?.elementIds || [];
  const n = ids.length || 1;
  return { qty: (Number(it?.qty) || 0) / n, estimated: true };
}

function fmtQty(n) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// A single element's cost on a line = its quantity share × the line's rate.
// Returns 0 when the rate is absent OR masked — RateGen-gated collaborators
// receive rate 0 from the server, so money simply doesn't render for them.
function elementCostFor(it, id) {
  const { qty } = elementQtyFor(it, id);
  return qty * (Number(it?.rate) || 0);
}

export default function ModelViewer({
  projectModels = {},
  items = [],
  materialItems = [],
  productKey = "",
  projectId = "",
  accessToken = "",
  // Work area: a canvas-only viewer driven from outside. `highlightIds` are
  // the element IDs to light up (empty clears), `onPickElement` reports a
  // click on the model, and `height` sizes the canvas.
  compact = false,
  height = 600,
  highlightIds = null,
  onPickElement = null,
}) {
  // Disciplines that actually have an attached model.
  const available = React.useMemo(
    () =>
      ["architectural", "structural", "mep"].filter(
        (d) => projectModels?.[d]?.url,
      ),
    [projectModels],
  );

  const [discipline, setDiscipline] = React.useState(available[0] || null);
  React.useEffect(() => {
    if (!discipline || !available.includes(discipline)) {
      setDiscipline(available[0] || null);
    }
  }, [available, discipline]);

  const model = discipline ? projectModels?.[discipline] : null;
  const modelUrl = model?.url || "";
  const isFragments = model?.format === "fragments";

  // BoQ lines (with elementIds) belonging to the selected discipline.
  const disciplineItems = React.useMemo(() => {
    if (!discipline) return [];
    return (items || []).filter(
      (it) =>
        Array.isArray(it?.elementIds) &&
        it.elementIds.length > 0 &&
        deriveItemDiscipline(it, productKey) === discipline,
    );
  }, [items, discipline, productKey]);

  const containerRef = React.useRef(null);
  const viewerRef = React.useRef(null);
  const [status, setStatus] = React.useState("idle"); // idle|loading|ready|error
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [selectedItemKey, setSelectedItemKey] = React.useState(null);
  const [pickedId, setPickedId] = React.useState(0);
  // The latest pick callback, read by the viewer without re-creating it.
  const pickRef = React.useRef(onPickElement);
  React.useEffect(() => {
    pickRef.current = onPickElement;
  }, [onPickElement]);

  // Highlight driven from outside (the work area). Re-applied once the model
  // is ready, since a selection can be made while it is still loading.
  const highlightKey = Array.isArray(highlightIds) ? highlightIds.join(",") : null;
  React.useEffect(() => {
    if (highlightKey === null || status !== "ready") return;
    const v = viewerRef.current;
    if (!v) return;
    if (highlightIds.length) v.highlight(highlightIds);
    else v.clearHighlight();
    // highlightKey stands in for the array's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, status]);

  // (Re)create the viewer whenever the selected model changes.
  React.useEffect(() => {
    setSelectedItemKey(null);
    setPickedId(0);
    if (!containerRef.current || !modelUrl) {
      setStatus("idle");
      return undefined;
    }
    if (isFragments) {
      setStatus("error");
      setError(
        "This slot holds a pre-converted .frag model, which the viewer can't open yet. Upload the source .ifc to view and verify it.",
      );
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setProgress(0);
    setError("");

    let viewer;
    try {
      viewer = new IfcViewer(containerRef.current);
    } catch (e) {
      setStatus("error");
      setError(e?.message || "WebGL isn't available in this browser.");
      return undefined;
    }
    viewer.onPick = (id) => {
      setPickedId(id);
      pickRef.current?.(id);
    };
    viewerRef.current = viewer;

    // Fetch the IFC through the SAME-ORIGIN API proxy (not the R2 URL directly):
    // the public r2.dev URLs don't send CORS headers, which showed up as
    // "Failed to fetch" in the viewer. The proxy is authed, so send the token.
    (async () => {
      try {
        const base = API_BASE || window.location.origin;
        const proxyUrl = `${base}/projects/${productKey}/${projectId}/models/${discipline}/file`;
        const res = await fetch(proxyUrl, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Couldn't load the model (HTTP ${res.status}).`);
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        await viewer.loadFromBuffer(buf, (p) => {
          if (!cancelled) setProgress(p);
        });
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e?.message || "Failed to load the model.");
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        viewer.dispose();
      } catch {
        /* ignore */
      }
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, [modelUrl, isFragments, productKey, projectId, discipline, accessToken]);

  function selectItem(it, key) {
    setSelectedItemKey(key);
    setPickedId(0);
    viewerRef.current?.highlight(it?.elementIds || []);
  }

  function clearSelection() {
    setSelectedItemKey(null);
    setPickedId(0);
    viewerRef.current?.clearHighlight();
  }

  // BoQ (takeoff) lines that reference the clicked element.
  const pickedBoqItems = React.useMemo(() => {
    if (!pickedId) return [];
    return (items || []).filter((it) =>
      (it?.elementIds || []).some((n) => Number(n) === pickedId),
    );
  }, [pickedId, items]);

  // Material/labour (budget) lines that reference the clicked element — its
  // material breakdown.
  const pickedMaterialItems = React.useMemo(() => {
    if (!pickedId) return [];
    return (materialItems || []).filter((it) =>
      (it?.elementIds || []).some((n) => Number(n) === pickedId),
    );
  }, [pickedId, materialItems]);

  // This element's own cost (Σ qty-share × rate over its BoQ lines) and budget
  // (same over its material/labour breakdown). Stays 0 when rates are masked.
  const pickedBoqCost = React.useMemo(
    () => pickedBoqItems.reduce((a, it) => a + elementCostFor(it, pickedId), 0),
    [pickedBoqItems, pickedId],
  );
  const pickedBudgetCost = React.useMemo(
    () =>
      pickedMaterialItems.reduce((a, it) => a + elementCostFor(it, pickedId), 0),
    [pickedMaterialItems, pickedId],
  );

  if (available.length === 0) {
    return (
      <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
        {/* <strong>, not <b>: a <b> inside a .wk-empty is now the empty
            state's heading and is laid out as a block of its own, which would
            snap this tab name onto its own line mid-sentence. */}
        No model attached yet. Upload a validated IFC from the{" "}
        <strong style={{ fontWeight: 500, color: "var(--ink)" }}>Bill of Quantity</strong> tab to
        view it here.
      </div>
    );
  }

  return (
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      {/* Discipline selector, in his switch */}
      <div className="wk-ph" style={{ flexWrap: "wrap" }}>
        <div className="wk-loc-sw" role="tablist" aria-label="Model discipline">
        {available.map((d) => {
          const v = projectModels?.[d]?.validation;
          const active = d === discipline;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDiscipline(d)}
              className={active ? "on" : ""}
              title={v?.status === "valid" ? "Element IDs verified" : undefined}
            >
              {DISCIPLINE_LABELS[d] || d}
              {v?.status === "valid" ? (
                <span style={{ marginLeft: 6, color: "var(--action)" }}>✓</span>
              ) : null}
            </button>
          );
        })}
        </div>
        <span className="wk-locnote" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {model?.sourceFile}
        </span>
      </div>

      <div
        className={compact ? "grid" : "grid gap-3 md:grid-cols-[1fr_320px]"}
        style={{ padding: compact ? 12 : 16 }}
      >
        {/* 3D canvas */}
        <div
          className="relative overflow-hidden"
          style={{ height, borderRadius: 14, border: "1px solid var(--line)", background: "var(--bg-alt)" }}
        >
          <div ref={containerRef} className="absolute inset-0" />
          {status === "loading" ? (
            <div
              className="wk-locnote absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ background: "color-mix(in srgb, var(--bg-alt) 85%, transparent)", fontSize: 13 }}
            >
              <div className="dsh-meter" style={{ width: 192 }}>
                <div className="track">
                  <i style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
              Loading model… {Math.round(progress * 100)}%
            </div>
          ) : null}
          {status === "error" ? (
            <div
              className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
              style={{ color: "var(--pal-orange-key)" }}
            >
              {error}
            </div>
          ) : null}
          {status === "ready" && selectedItemKey ? (
            <button
              type="button"
              onClick={clearSelection}
              className="ds-btn ds-btn-sm btn-o absolute right-2 top-2"
              style={{ background: "var(--bg)" }}
            >
              Clear highlight
            </button>
          ) : null}
        </div>

        {/* Side panel: BoQ lines + pick info (the work area shows its own) */}
        {compact ? null : (
        <div className="flex flex-col gap-3" style={{ height }}>
          {/* Clicked element trace: this element's own BoQ qty + materials */}
          {pickedId ? (
            <div
              className="mk-note"
              style={{
                margin: 0,
                fontSize: 12,
                background: "var(--pal-orange-wash)",
                color: "var(--pal-orange-key)",
                borderColor: "var(--pal-orange-line)",
              }}
            >
              <div style={{ fontWeight: 500, color: "var(--ink)" }}>
                Element ID {pickedId}
              </div>

              {pickedBoqCost > 0 || pickedBudgetCost > 0 ? (
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  {pickedBoqCost > 0 ? (
                    <span>
                      Cost{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtMoney(pickedBoqCost)}
                      </span>
                    </span>
                  ) : null}
                  {pickedBudgetCost > 0 ? (
                    <span>
                      Budget{" "}
                      <span className="font-semibold tabular-nums">
                        {fmtMoney(pickedBudgetCost)}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {pickedBoqItems.length ? (
                <div className="mt-1.5">
                  <p className="wk-grp" style={{ padding: 0, margin: 0, color: "inherit" }}>
                    Bill of Quantity
                  </p>
                  <ul className="mt-0.5 space-y-0.5" style={{ color: "var(--ink-2)" }}>
                    {pickedBoqItems.slice(0, 8).map((it, i) => {
                      const q = elementQtyFor(it, pickedId);
                      const cost = elementCostFor(it, pickedId);
                      return (
                        <li
                          key={i}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="truncate" title={itemLabel(it)}>
                            {itemLabel(it)}
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="font-medium">
                              {q.estimated ? "≈" : ""}
                              {fmtQty(q.qty)} {it.unit || ""}
                            </span>
                            {cost > 0 ? (
                              <span className="block text-[11px] font-semibold" style={{ color: "var(--pal-orange-key)" }}>
                                {fmtMoney(cost)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {pickedMaterialItems.length ? (
                <div className="mt-2">
                  <p className="wk-grp" style={{ padding: 0, margin: 0, color: "inherit" }}>
                    Material breakdown
                  </p>
                  <ul className="mt-0.5 space-y-0.5" style={{ color: "var(--ink-2)" }}>
                    {pickedMaterialItems.slice(0, 12).map((it, i) => {
                      const q = elementQtyFor(it, pickedId);
                      const cost = elementCostFor(it, pickedId);
                      return (
                        <li
                          key={i}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="truncate" title={itemLabel(it)}>
                            {itemLabel(it)}
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="font-medium">
                              {q.estimated ? "≈" : ""}
                              {fmtQty(q.qty)} {it.unit || ""}
                            </span>
                            {cost > 0 ? (
                              <span className="block text-[11px] font-semibold" style={{ color: "var(--pal-orange-key)" }}>
                                {fmtMoney(cost)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {!pickedBoqItems.length && !pickedMaterialItems.length ? (
                <div className="mt-1">
                  Not referenced by any quantity in this project.
                </div>
              ) : (
                <div className="mt-1.5 text-[11px]" style={{ opacity: 0.85 }}>
                  ≈ = estimated (even split across this line&apos;s elements)
                </div>
              )}
            </div>
          ) : null}

          <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
            {DISCIPLINE_LABELS[discipline] || discipline} quantities (
            {disciplineItems.length})
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ borderRadius: 14, border: "1px solid var(--line)" }}>
            {disciplineItems.length === 0 ? (
              <div className="wk-empty" style={{ padding: 18, fontSize: 13 }}>
                No quantities with element links in this discipline.
              </div>
            ) : (
              disciplineItems.map((it, i) => {
                const key = `${it.code || ""}-${it.sn ?? i}-${i}`;
                const active = key === selectedItemKey;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={status !== "ready"}
                    onClick={() => selectItem(it, key)}
                    className="block w-full px-3 py-2 text-left text-[12px] disabled:opacity-50"
                    style={{
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      cursor: "pointer",
                      background: active ? "var(--pal-orange-wash)" : "transparent",
                    }}
                  >
                    <div className="truncate" style={{ fontWeight: 500, color: "var(--ink)" }} title={itemLabel(it)}>
                      {itemLabel(it)}
                    </div>
                    <div style={{ color: "var(--ink-3)" }}>
                      {Number(it.qty) || 0} {it.unit || ""} ·{" "}
                      {(it.elementIds || []).length} element
                      {(it.elementIds || []).length === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="wk-locnote">
            Tip: click a line to highlight its elements, or click an element in
            the model to see its quantities.
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
