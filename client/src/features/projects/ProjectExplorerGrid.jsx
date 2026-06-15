import React from "react";
import { FaFolder, FaTrash } from "react-icons/fa";
import ProjectSectionSummary from "./ProjectSectionSummary.jsx";

function rowId(row) {
  return row?._id || row?.id || null;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ProjectExplorerGrid({
  bulkBusy = false,
  checkboxCls = "",
  onClearSelection,
  onDeleteAll,
  onDeleteProject,
  onDeleteSelected,
  onOpenProject,
  onSelectAllShown,
  onToggleSelect,
  rowsShown = [],
  sectionSummary,
  selectedIdsCount = 0,
  selectedMap = {},
  statusPastLabel = "Completed to date",
}) {
  return (
    <div className="mt-5">
      <ProjectSectionSummary
        statusPastLabel={statusPastLabel}
        summary={sectionSummary}
      />

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">
          {rowsShown.length} project(s)
          {selectedIdsCount ? (
            <>
              {" "}| <b>{selectedIdsCount}</b> selected
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onSelectAllShown}
            disabled={!rowsShown.length || bulkBusy}
            title="Select all projects in this view"
          >
            Select all
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={onClearSelection}
            disabled={!selectedIdsCount || bulkBusy}
            title="Clear selection"
          >
            Clear
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={onDeleteSelected}
            disabled={!selectedIdsCount || bulkBusy}
            title="Delete selected"
          >
            <span className="inline-flex items-center gap-2 text-orange-700">
              <FaTrash className="text-[13px]" /> Delete selected
            </span>
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={onDeleteAll}
            disabled={!rowsShown.length || bulkBusy}
            title="Delete all projects"
          >
            <span className="inline-flex items-center gap-2 text-orange-700">
              <FaTrash className="text-[13px]" /> Delete all
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rowsShown.map((row, index) => {
          const id = rowId(row);
          const checked = !!selectedMap?.[id];
          const updated = row?.updatedAt
            ? new Date(row.updatedAt).toLocaleString()
            : "-";
          const key = id || `${row?.name || "row"}-${index}`;

          const itemCount = safeNum(row?.itemCount);
          const markedCount = safeNum(row?.markedCount);
          const pct = itemCount
            ? Math.min(100, Math.round((markedCount / itemCount) * 100))
            : 0;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => id && onOpenProject?.(id)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && id) {
                  onOpenProject?.(id);
                }
              }}
              className={[
                "group relative spotlight cursor-pointer rounded-2xl border bg-white p-4 shadow-depth transition lift dark:bg-adlm-dark-panel",
                checked
                  ? "border-adlm-blue-700 ring-2 ring-adlm-blue-700"
                  : "border-slate-200 dark:border-adlm-dark-border hover:border-adlm-blue-400",
                !id ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              {/* corner accent glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full bg-adlm-blue-600/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />

              <button
                type="button"
                className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-white/90 dark:bg-adlm-dark-raised shadow-sm transition hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!id) return;
                  onToggleSelect?.(id);
                }}
                title={checked ? "Unselect" : "Select"}
                disabled={!id || bulkBusy}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className={checkboxCls}
                />
              </button>

              {/* Only the owner can delete; shared projects hide this. */}
              {!row?.shared ? (
                <button
                  type="button"
                  className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-500/10"
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject?.(id, row?.name);
                  }}
                  disabled={!id || bulkBusy}
                >
                  <FaTrash className="text-[13px]" />
                </button>
              ) : null}

              <div className="relative mt-2 flex items-center justify-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-adlm-blue-700 to-adlm-blue-600 text-white shadow-glow-blue transition-transform duration-300 group-hover:scale-105">
                  <FaFolder className="text-2xl" />
                </div>
              </div>

              <div className="relative mt-3 text-center">
                <div className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {row?.name || "Untitled"}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {markedCount ? ` · ${markedCount} done` : ""}
                </div>
                {row?.shared ? (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-adlm-blue-700 dark:bg-adlm-blue-600/15 dark:text-adlm-blue-300">
                    Shared · {row.accessLevel === "full" ? "Full" : "View"}
                  </div>
                ) : null}
              </div>

              {itemCount ? (
                <div className="relative mt-3">
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-adlm-orange to-amber-400 transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-center text-[10px] font-medium text-slate-400 dark:text-adlm-dark-dim">
                    {pct}% complete
                  </div>
                </div>
              ) : null}

              <div className="relative mt-2 text-center text-[11px] text-slate-400 dark:text-adlm-dark-dim">
                {updated}
              </div>
            </div>
          );
        })}
      </div>

      {rowsShown.length === 0 ? (
        <div className="mt-4 text-sm text-slate-600 dark:text-adlm-dark-muted">
          No projects found.
        </div>
      ) : null}
    </div>
  );
}
