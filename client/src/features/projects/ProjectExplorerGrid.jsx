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

export default function ProjectExplorerGrid({
  bulkBusy = false,
  onClearSelection,
  onDeleteAll,
  onDeleteProject,
  onDeleteSelected,
  onMergeSelected,
  onOpenProject,
  onSelectAllShown,
  onToggleSelect,
  rowsShown = [],
  sectionSummary,
  selectedIdsCount = 0,
  selectedMap = {},
  statusPastLabel = "Completed to date",
  storageInfo = null,
}) {
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

      <div className="wk-bar">
        <p className="wk-count" style={{ margin: 0, marginRight: "auto" }}>
          {plural(rowsShown.length, "project")}
          {selectedIdsCount ? ` · ${selectedIdsCount} selected` : ""}
        </p>
        <div className="wk-acts" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className="ds-btn ds-btn-sm btn-o"
            onClick={onSelectAllShown}
            disabled={!rowsShown.length || bulkBusy}
            title="Select all projects in this view"
          >
            Select all
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-sm btn-o"
            onClick={onClearSelection}
            disabled={!selectedIdsCount || bulkBusy}
            title="Clear selection"
          >
            Clear
          </button>
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
            disabled={!selectedIdsCount || bulkBusy}
            title="Delete selected"
          >
            <FaTrash size={13} /> Delete selected
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-sm btn-o"
            onClick={onDeleteAll}
            disabled={!rowsShown.length || bulkBusy}
            title="Delete all projects"
          >
            <FaTrash size={13} /> Delete all
          </button>
        </div>
      </div>

      {rowsShown.length === 0 ? (
        <div className="wk-empty">No projects found.</div>
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
