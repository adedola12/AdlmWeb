// The project grid on /projects/:tool, in his project cards.
//
// His markup: .wk-bar with .wk-count and .wk-acts for the toolbar, .wk-projs /
// .wk-proj with .t (h3 + .stage), .c, .f for each card, and .wk-empty when
// there is nothing to show. The same card as /work/projects (DsWorkProjects),
// so the two views of the same projects look like one product.
//
// Every behaviour of the old grid is kept: select, select all, clear, merge,
// delete one, delete selected, delete all, open on click or Enter/Space.
// Three things his card does not have are fitted into it rather than invented:
//
//   * the progress bar becomes the "% complete" figure in .f
//   * select and delete become a .wk-acts row at the foot of the card
//   * the merged / part-of-a-merge / shared badges become the .stage chip,
//     with anything the chip cannot hold carried in the .c line
//
// The card is a div with role="button", not a <button>, because it contains
// buttons of its own.

import React from "react";
import { FaFolder, FaObjectGroup, FaTrash } from "../../components/icons.jsx";
import ProjectSectionSummary from "./ProjectSectionSummary.jsx";
import StorageBar from "../../components/StorageBar.jsx";

function rowId(row) {
  return row?._id || row?.id || null;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const updatedAt = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "–";

// The icon wrapper sizes by its `size` prop (default 22), not by font-size.
const iconStyle = { verticalAlign: -3, marginRight: 8, color: "var(--action)" };

// One skeleton card, shaped like .wk-proj so the grid does not reflow.
function SkeletonProjectCard() {
  return (
    <div className="wk-proj sk" aria-hidden="true">
      <div className="t">
        <span className="wk-sk" />
        <span className="wk-sk" />
      </div>
      <p className="c">
        <span className="wk-sk" />
      </p>
      <div className="f">
        <div>
          <span className="wk-sk" />
          <span className="wk-sk" />
        </div>
        <div>
          <span className="wk-sk" />
          <span className="wk-sk" />
        </div>
        <div>
          <span className="wk-sk" />
          <span className="wk-sk" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectExplorerGrid({
  bulkBusy = false,
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
  toolLabel = "your plugin",
  totalCount = null,
}) {
  // rowsShown is the search-filtered view; totalCount is what the account
  // actually holds. An empty view over a non-empty account is a failed
  // search, not an empty workspace, and the two need different sentences.
  const total = totalCount == null ? rowsShown.length : totalCount;
  const hasSearch = !!String(searchQuery || "").trim();
  const isEmpty = !loading && rowsShown.length === 0;
  const isSearchMiss = isEmpty && hasSearch && total > 0;

  return (
    <div style={{ marginTop: 20 }}>
      <ProjectSectionSummary statusPastLabel={statusPastLabel} summary={sectionSummary} />

      {storageInfo && !storageInfo.isMaterials ? (
        <div style={{ margin: "0 0 20px" }}>
          <StorageBar
            used={storageInfo.used}
            limit={storageInfo.limit}
            productKey={storageInfo.productKey}
          />
        </div>
      ) : null}

      {/* The bulk actions used to sit here permanently, five wide and
          greyed out until something was selected, which made the loudest
          row on the page a row of things you could not do and gave
          "Delete all" the same weight as "Select all". The bar is quiet
          until there is a selection, and the actions that destroy things
          appear once they have something to destroy. */}
      {!loading && rowsShown.length > 0 ? (
        <div className="wk-bar">
          <p className="wk-count" style={{ margin: 0, marginRight: "auto" }}>
            {selectedIdsCount
              ? `${selectedIdsCount.toLocaleString()} of ${plural(rowsShown.length, "project")} selected`
              : plural(rowsShown.length, "project")}
            {!selectedIdsCount && hasSearch && total > rowsShown.length
              ? ` of ${total.toLocaleString()}`
              : ""}
          </p>
          <div className="wk-acts" style={{ flexWrap: "wrap" }}>
            {selectedIdsCount ? (
              <>
                {onMergeSelected ? (
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm btn-o"
                    onClick={onMergeSelected}
                    disabled={selectedIdsCount < 2 || bulkBusy}
                    title={
                      selectedIdsCount < 2
                        ? "Select two or more projects to merge them into one"
                        : `Merge ${selectedIdsCount} projects into a single project`
                    }
                  >
                    <FaObjectGroup size={13} /> Merge selected
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ds-btn ds-btn-sm btn-o"
                  onClick={onDeleteSelected}
                  disabled={bulkBusy}
                  title="Delete selected"
                >
                  <FaTrash size={13} /> Delete selected
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-sm btn-o"
                  onClick={onClearSelection}
                  disabled={bulkBusy}
                  title="Clear selection"
                >
                  Clear
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="ds-btn ds-btn-sm btn-o"
                  onClick={onSelectAllShown}
                  disabled={bulkBusy}
                  title="Select all projects in this view"
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-sm btn-o"
                  onClick={onDeleteAll}
                  disabled={bulkBusy}
                  title="Delete all projects"
                >
                  <FaTrash size={13} /> Delete all
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="wk-projs" role="status" aria-live="polite" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonProjectCard key={i} />
          ))}
        </div>
      ) : isSearchMiss ? (
        // A search that matched nothing is the reader's own filter, and is
        // undone with one button. Not the same state as an empty account.
        <div className="wk-empty">
          <h4>Nothing matches “{searchQuery}”</h4>
          <p>
            None of your {total.toLocaleString()}{" "}
            {total === 1 ? "project" : "projects"} has a name matching that.
            Search covers project names only.
          </p>
          {onClearSearch ? (
            <div className="wk-empty-acts">
              <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={onClearSearch}>
                Clear search
              </button>
            </div>
          ) : null}
        </div>
      ) : isEmpty ? (
        // Projects reach this list from the plugin's Save to Cloud, not from
        // anything on this page, so the empty state says so and offers the
        // two things that do work from here.
        <div className="wk-empty">
          <h4>No projects saved to the cloud</h4>
          <p>
            Projects appear here once you run a takeoff in {toolLabel} and use
            Save to Cloud. The bill, rates, contract and valuation tools all
            open from a saved project.
          </p>
          {onAddShared || onImportBoq ? (
            <div className="wk-empty-acts">
              {onAddShared ? (
                <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={onAddShared}>
                  Add shared project
                </button>
              ) : null}
              {onImportBoq ? (
                <button type="button" className="ds-btn ds-btn-sm btn-p" onClick={onImportBoq}>
                  Import Excel BoQ
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="wk-empty-hint">
            Got a share code from a colleague? Add it above and their project
            lands in this list.
          </p>
        </div>
      ) : (
        <div className="wk-projs">
          {rowsShown.map((row, index) => {
            const id = rowId(row);
            const checked = !!selectedMap?.[id];
            const key = id || `${row?.name || "row"}-${index}`;

            const itemCount = safeNum(row?.itemCount);
            const markedCount = safeNum(row?.markedCount);
            const parts = safeNum(row?.mergedPartCount);
            const pct = itemCount ? Math.min(100, Math.round((markedCount / itemCount) * 100)) : 0;
            const sharedText = row?.shared
              ? `Shared · ${row.accessLevel === "full" ? "Full" : "View"}`
              : "";

            // One chip, most specific first; the rest goes in the sub-line.
            let stage;
            let amber = false;
            if (row?.mergeContainer) stage = "Merged project";
            else if (row?.mergedInto) stage = "Part of a merge";
            else if (row?.shared) {
              stage = sharedText;
              amber = true;
            } else if (!itemCount) stage = "Empty";
            else if (pct >= 100) stage = "Complete";
            else {
              stage = `${pct}% complete`;
              amber = pct > 0;
            }

            const sub = [
              row?.mergeContainer
                ? plural(parts, "discipline")
                : `${plural(itemCount, "item")}${markedCount ? ` · ${markedCount.toLocaleString()} done` : ""}`,
              row?.shared && stage !== sharedText ? sharedText : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                className="wk-proj"
                aria-disabled={!id || undefined}
                title={
                  row?.mergedInto && !row?.mergeContainer
                    ? "This project is part of a merged project. It still opens on its own in the plugin."
                    : undefined
                }
                onClick={() => id && onOpenProject?.(id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if ((e.key === "Enter" || e.key === " ") && id) {
                    e.preventDefault();
                    onOpenProject?.(id);
                  }
                }}
                style={{
                  cursor: id ? "pointer" : "not-allowed",
                  opacity: id ? 1 : 0.6,
                  ...(checked
                    ? { borderColor: "var(--action)", boxShadow: "0 0 0 1px var(--action)" }
                    : null),
                }}
              >
                <div className="t">
                  <h3>
                    {row?.mergeContainer ? (
                      <FaObjectGroup size={17} style={iconStyle} aria-hidden="true" />
                    ) : (
                      <FaFolder size={17} style={iconStyle} aria-hidden="true" />
                    )}
                    {row?.name || "Untitled"}
                  </h3>
                  <span className={`stage${amber ? " amber" : ""}`}>{stage}</span>
                </div>
                <p className="c">{sub}</p>

                <div className="f">
                  <div>
                    <b>{row?.mergeContainer ? parts.toLocaleString() : itemCount.toLocaleString()}</b>
                    <span>{row?.mergeContainer ? "disciplines" : "items"}</span>
                  </div>
                  <div>
                    <b>{itemCount ? `${pct}%` : "–"}</b>
                    <span>complete</span>
                  </div>
                  <div>
                    <b>{updatedAt(row?.updatedAt)}</b>
                    <span>last updated</span>
                  </div>
                </div>

                <div className="wk-acts" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className={`ds-btn ds-btn-sm ${checked ? "btn-p" : "btn-o"}`}
                    aria-pressed={checked}
                    title={checked ? "Unselect" : "Select"}
                    disabled={!id || bulkBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (id) onToggleSelect?.(id);
                    }}
                  >
                    {checked ? "✓ Selected" : "Select"}
                  </button>
                  {/* Only the owner can delete; shared projects hide this. */}
                  {!row?.shared ? (
                    <button
                      type="button"
                      className="ds-btn ds-btn-sm btn-o"
                      title="Delete project"
                      disabled={!id || bulkBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject?.(id, row?.name);
                      }}
                    >
                      <FaTrash size={13} /> Delete
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
