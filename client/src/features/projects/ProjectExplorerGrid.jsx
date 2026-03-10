import React from "react";
import { FaFolder, FaTrash } from "react-icons/fa";

function rowId(row) {
  return row?._id || row?.id || null;
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
  selectedIdsCount = 0,
  selectedMap = {},
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-600">
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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rowsShown.map((row, index) => {
          const id = rowId(row);
          const checked = !!selectedMap?.[id];
          const updated = row?.updatedAt
            ? new Date(row.updatedAt).toLocaleString()
            : "-";
          const key = id || `${row?.name || "row"}-${index}`;

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
                "relative cursor-pointer rounded-xl border bg-white p-3 transition hover:shadow-sm",
                checked ? "border-blue-200 ring-2 ring-blue-200" : "",
                !id ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <button
                type="button"
                className={[
                  "absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-white/90",
                  "shadow-sm transition hover:bg-slate-50",
                ].join(" ")}
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

              <div className="mt-2 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50">
                  <FaFolder className="text-2xl text-slate-600" />
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="line-clamp-2 text-sm font-medium">
                  {row?.name || "Untitled"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {row?.itemCount ?? 0} items
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{updated}</div>
              </div>

              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                title="Delete project"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProject?.(id, row?.name);
                }}
                disabled={!id || bulkBusy}
              >
                <FaTrash className="text-[13px]" />
              </button>
            </div>
          );
        })}
      </div>

      {rowsShown.length === 0 ? (
        <div className="mt-4 text-sm text-slate-600">No projects found.</div>
      ) : null}
    </div>
  );
}