import React from "react";
import {
  FaCubes,
  FaFolder,
  FaObjectGroup,
  FaSearch,
  FaTimes,
  FaTrash,
  FaUserPlus,
} from "../../components/icons.jsx";
import ProjectSectionSummary from "./ProjectSectionSummary.jsx";
import StorageBar from "../../components/StorageBar.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import { SkeletonProjectGrid } from "../../components/common/Skeleton.jsx";

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
  loading = false,
  onAddShared,
  onClearSearch,
  onClearSelection,
  onDeleteAll,
  onDeleteProject,
  onDeleteSelected,
  onImportBoq,
  onMergeSelected,
  onOpenProject,
  onSelectAllShown,
  onToggleSelect,
  rowsShown = [],
  searchQuery = "",
  sectionSummary,
  selectedIdsCount = 0,
  selectedMap = {},
  statusPastLabel = "Completed to date",
  storageInfo = null,
  toolLabel = "plugin",
  totalCount = null,
}) {
  // `rowsShown` is the search-filtered view; `totalCount` is how many the
  // account actually has. An empty *view* with a non-empty account is a
  // failed search, not an empty workspace — two different messages.
  const total = totalCount == null ? rowsShown.length : totalCount;
  const hasSearch = !!String(searchQuery || "").trim();
  const isEmpty = !loading && rowsShown.length === 0;
  const isSearchMiss = isEmpty && hasSearch && total > 0;

  return (
    <div className="mt-5">
      <ProjectSectionSummary
        statusPastLabel={statusPastLabel}
        summary={sectionSummary}
      />

      {storageInfo && !storageInfo.isMaterials ? (
        <div className="mt-4">
          <StorageBar
            used={storageInfo.used}
            limit={storageInfo.limit}
            productKey={storageInfo.productKey}
          />
        </div>
      ) : null}

      {/* ── Toolbar ──────────────────────────────────────────────────
          Bulk actions used to sit here permanently, four wide, greyed
          out until something was selected — so the loudest row on the
          page was a row of things you could not do, and "Delete all"
          had the same weight as "Select all". Now the bar is quiet
          until there is a selection, and destructive actions only
          appear once they have something to destroy. */}
      {!loading && rowsShown.length > 0 ? (
        selectedIdsCount > 0 ? (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-adlm-blue-200 bg-adlm-blue-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-adlm-blue-600/30 dark:bg-adlm-blue-600/10">
            <div className="text-sm font-semibold text-adlm-blue-700 dark:text-adlm-blue-300">
              {selectedIdsCount} selected
              <span className="ml-2 font-normal text-slate-500 dark:text-adlm-dark-muted">
                of {rowsShown.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onMergeSelected ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={onMergeSelected}
                  disabled={selectedIdsCount < 2 || bulkBusy}
                  title={
                    selectedIdsCount < 2
                      ? "Select two or more projects to merge them into one"
                      : `Merge ${selectedIdsCount} projects into a single project`
                  }
                >
                  <FaObjectGroup className="mr-2 text-[12px]" />
                  Merge
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={onDeleteSelected}
                disabled={bulkBusy}
                title="Delete the selected projects"
              >
                <FaTrash className="mr-2 text-[12px]" />
                Delete selected
              </button>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onClearSelection}
                disabled={bulkBusy}
                title="Clear selection"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">
              <span className="font-semibold text-slate-900 dark:text-white">
                {rowsShown.length}
              </span>{" "}
              {rowsShown.length === 1 ? "project" : "projects"}
              {hasSearch && total > rowsShown.length ? (
                <span className="text-slate-400 dark:text-adlm-dark-dim">
                  {" "}
                  of {total}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={onSelectAllShown}
                disabled={bulkBusy}
                title="Select every project in this view"
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onDeleteAll}
                disabled={bulkBusy}
                title="Delete every project in this tool"
              >
                <FaTrash className="mr-2 text-[11px]" />
                Delete all
              </button>
            </div>
          </div>
        )
      ) : null}

      {loading ? <SkeletonProjectGrid /> : null}

      {!loading && rowsShown.length > 0 ? (
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

                {/* Only the owner can delete; shared projects hide this.
                    Hidden until the card is hovered or focused so the
                    resting grid has no destructive affordance in it. */}
                {!row?.shared ? (
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-orange-50 hover:text-orange-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-orange-500/10"
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
                    {row?.mergeContainer ? (
                      <FaObjectGroup className="text-2xl" />
                    ) : (
                      <FaFolder className="text-2xl" />
                    )}
                  </div>
                </div>

                <div className="relative mt-3 text-center">
                  <div className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">
                    {row?.name || "Untitled"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">
                    {row?.mergeContainer
                      ? `${safeNum(row?.mergedPartCount)} discipline${
                          safeNum(row?.mergedPartCount) === 1 ? "" : "s"
                        }`
                      : `${itemCount} item${itemCount === 1 ? "" : "s"}${
                          markedCount ? ` · ${markedCount} done` : ""
                        }`}
                  </div>
                  {row?.mergeContainer ? (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-adlm-blue-50 px-2 py-0.5 text-[10px] font-semibold text-adlm-blue-700 dark:bg-adlm-blue-600/15 dark:text-adlm-blue-300">
                      <FaObjectGroup className="text-[9px]" /> Merged project
                    </div>
                  ) : row?.mergedInto ? (
                    <div
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-adlm-dark-muted"
                      title="This project is part of a merged project. It still opens on its own in the plugin."
                    >
                      Part of a merge
                    </div>
                  ) : null}
                  {row?.shared ? (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-adlm-blue-50 px-2 py-0.5 text-[10px] font-semibold text-adlm-blue-700 dark:bg-adlm-blue-600/15 dark:text-adlm-blue-300">
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
      ) : null}

      {/* ── Empty states ────────────────────────────────────────────
          Two of them, because they mean different things. A search
          that matched nothing is the user's own filter and is undone
          with one button. An account with no projects needs telling
          where projects come from — they arrive from the desktop
          plugin's Save to Cloud, not from anything on this page. */}
      {isSearchMiss ? (
        <div className="mt-4">
          <EmptyState
            compact
            tone="search"
            icon={FaSearch}
            eyebrow="No matches"
            title={`Nothing matches “${searchQuery}”`}
            description={`None of your ${total} ${
              total === 1 ? "project" : "projects"
            } has a name matching that. Search covers project names only.`}
            actions={
              onClearSearch ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={onClearSearch}
                >
                  <FaTimes className="mr-2 text-[11px]" />
                  Clear search
                </button>
              ) : null
            }
          />
        </div>
      ) : isEmpty ? (
        <div className="mt-4">
          <EmptyState
            icon={FaCubes}
            eyebrow="Nothing here yet"
            title="No projects saved to the cloud"
            description={`Projects appear here once you run a takeoff in ${toolLabel} and use Save to Cloud. The bill, rates, contract and valuation tools all open from a saved project.`}
            actions={
              <>
                {onAddShared ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={onAddShared}
                  >
                    <FaUserPlus className="mr-2 text-[12px]" />
                    Add shared project
                  </button>
                ) : null}
                {onImportBoq ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={onImportBoq}
                  >
                    Import Excel BoQ
                  </button>
                ) : null}
              </>
            }
            hint="Got a share code from a colleague? Add it above and their project lands in this list."
          />
        </div>
      ) : null}
    </div>
  );
}
