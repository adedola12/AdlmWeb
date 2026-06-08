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

export default function ModelViewer({
  projectModels = {},
  items = [],
  productKey = "",
  projectId = "",
  accessToken = "",
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
    viewer.onPick = (id) => setPickedId(id);
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

  // BoQ lines that reference the clicked element.
  const pickedItems = React.useMemo(() => {
    if (!pickedId) return [];
    return (items || []).filter((it) =>
      (it?.elementIds || []).some((n) => Number(n) === pickedId),
    );
  }, [pickedId, items]);

  if (available.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-depth">
        No model attached yet. Upload a validated IFC from the{" "}
        <span className="font-semibold">Bill of Quantity</span> tab to view it
        here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth">
      {/* Discipline selector */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {available.map((d) => {
          const v = projectModels?.[d]?.validation;
          const active = d === discipline;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDiscipline(d)}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-adlm-blue-700 bg-adlm-blue-700 text-white"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {DISCIPLINE_LABELS[d] || d}
              {v?.status === "valid" ? (
                <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>✓</span>
              ) : null}
            </button>
          );
        })}
        <div className="ml-auto text-[11px] text-slate-500">
          {model?.sourceFile}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
        {/* 3D canvas */}
        <div className="relative h-[600px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <div ref={containerRef} className="absolute inset-0" />
          {status === "loading" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100/80 text-sm text-slate-600">
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-adlm-blue-700 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              Loading model… {Math.round(progress * 100)}%
            </div>
          ) : null}
          {status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {status === "ready" && selectedItemKey ? (
            <button
              type="button"
              onClick={clearSelection}
              className="absolute right-2 top-2 rounded-md bg-white/90 dark:bg-slate-900/85 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow hover:bg-white dark:hover:bg-slate-900"
            >
              Clear highlight
            </button>
          ) : null}
        </div>

        {/* Side panel: BoQ lines + pick info */}
        <div className="flex h-[600px] flex-col gap-3">
          {/* Clicked element trace */}
          {pickedId ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px]">
              <div className="font-semibold text-amber-900">
                Element ID {pickedId}
              </div>
              {pickedItems.length ? (
                <ul className="mt-1 list-disc pl-4 text-amber-800">
                  {pickedItems.slice(0, 6).map((it, i) => (
                    <li key={i} className="truncate" title={itemLabel(it)}>
                      {itemLabel(it)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-amber-700">
                  Not referenced by any quantity in this project.
                </div>
              )}
            </div>
          ) : null}

          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {DISCIPLINE_LABELS[discipline] || discipline} quantities (
            {disciplineItems.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200">
            {disciplineItems.length === 0 ? (
              <div className="p-3 text-[11px] text-slate-500">
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
                    className={[
                      "block w-full border-b border-slate-100 px-2.5 py-2 text-left text-[11px] transition last:border-b-0 disabled:opacity-50",
                      active ? "bg-orange-50" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="truncate font-medium text-slate-800" title={itemLabel(it)}>
                      {itemLabel(it)}
                    </div>
                    <div className="text-slate-500">
                      {Number(it.qty) || 0} {it.unit || ""} ·{" "}
                      {(it.elementIds || []).length} element
                      {(it.elementIds || []).length === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="text-[10px] text-slate-400">
            Tip: click a line to highlight its elements, or click an element in
            the model to see its quantities.
          </div>
        </div>
      </div>
    </div>
  );
}
