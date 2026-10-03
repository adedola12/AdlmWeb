// His project header's three controls (work-proj.js:342-346): the sync
// indicator, "Jump to project" and the … overflow.
//
// Split out of the shell because the shell is already the page's router, data
// loader and tab switcher, and because these three are the only chrome on the
// page with state of their own.
//
// The icon paths are his (work-proj.js:108-117), copied rather than swapped for
// Hugeicons, as the rest of this folder does — .pj-more and .pj-pop-s are sized
// for his 24-box geometry.

import React from "react";
import { Link, useNavigate } from "react-router-dom";
import WorkProjectPopover from "./WorkProjectPopover.jsx";
import {
  jumpList,
  keepTabOnJump,
  overflowActions,
  syncFailed,
  syncLabel,
} from "./headModel.js";
import { exportMenu } from "./exportModel.js";
import { projectWorkspaceHref } from "../../lib/projectLinks.js";

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);

export default function WorkProjectHead({
  projects,
  projectId,
  tab,
  saveState = "idle",
  saveError = "",
  canEdit = false,
  isOwner = false,
  canSeePm = true,
  classicWorkspaceHref,
  fullScreen = false,
  isBoqImport = false,
  exporting = "",
  onAction,
}) {
  const navigate = useNavigate();
  const jumpRef = React.useRef(null);
  const moreRef = React.useRef(null);
  const exportRef = React.useRef(null);
  const [open, setOpen] = React.useState("");
  const [term, setTerm] = React.useState("");

  const close = React.useCallback(() => setOpen(""), []);
  const others = React.useMemo(
    () => jumpList(projects, projectId, term),
    [projects, projectId, term],
  );
  const exports = React.useMemo(
    () => exportMenu({ canSeePm, isBoqImport }),
    [canSeePm, isBoqImport],
  );
  const actions = React.useMemo(
    () => overflowActions({ isOwner, canSeePm, fullScreen }),
    [isOwner, canSeePm, fullScreen],
  );

  // His rule: the tab you were on survives the jump if the project jumped to is
  // certain to have it (headModel.keepTabOnJump).
  const jumpTo = (p) => {
    const keep = keepTabOnJump(tab);
    navigate(projectWorkspaceHref(p, { newBuild: true }) + (keep ? `?tab=${keep}` : ""));
    close();
  };

  return (
    <div className="pj-hacts">
      {/* His indicator is for people who can write. A reader has nothing to
          save, and "Saved" beside a project they cannot edit reads as a claim
          about somebody else's work. */}
      {canEdit ? (
        <span className="pj-sync" aria-live="polite">
          <i className="sig" aria-hidden="true">
            <b />
            <b />
            <b />
            <b />
          </i>
          <span>{syncLabel(saveState)}</span>
          {syncFailed(saveState) ? (
            <>
              <button type="button" className="pj-lnk" onClick={() => onAction?.("retry")}>
                Try again
              </button>
              {saveError ? <em title={saveError}>{saveError}</em> : null}
            </>
          ) : null}
        </span>
      ) : null}

      {/* Full screen hides the rail and the app bar, which are the two things
          that normally say "there is a way out of here". A mode you can only
          leave through a menu you have to remember is a trap, so the way out is
          on the page — and Escape does it too (WorkProjectShell). */}
      {fullScreen ? (
        <button
          type="button"
          className="ds-btn btn-o ds-btn-sm"
          onClick={() => onAction?.("full")}
        >
          Leave full screen
        </button>
      ) : null}

      {/* Every workbook and report the project offers. These lived only in the
          classic workspace, so getting a bill out of this page meant knowing
          to leave it. */}
      <button
        type="button"
        className="ds-btn btn-o ds-btn-sm"
        ref={exportRef}
        aria-haspopup="menu"
        aria-expanded={open === "export"}
        disabled={Boolean(exporting)}
        onClick={() => setOpen(open === "export" ? "" : "export")}
      >
        {exporting ? "Exporting…" : "Export"}
      </button>

      <button
        type="button"
        className="ds-btn btn-o ds-btn-sm"
        ref={jumpRef}
        aria-expanded={open === "jump"}
        onClick={() => setOpen(open === "jump" ? "" : "jump")}
      >
        Jump to project
      </button>

      <button
        type="button"
        className="pj-more"
        aria-label="More actions"
        ref={moreRef}
        aria-expanded={open === "more"}
        onClick={() => setOpen(open === "more" ? "" : "more")}
      >
        <MoreIcon />
      </button>

      {open === "jump" ? (
        <WorkProjectPopover anchorRef={jumpRef} label="Jump to project" onClose={close}>
          <div className="pj-pop-s">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search projects"
              aria-label="Search projects"
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="ls">
            {others.length ? (
              others.map((p) => (
                <button
                  key={String(p._id || p.id || p.slug)}
                  type="button"
                  onClick={() => jumpTo(p)}
                >
                  <span>
                    <b>{p.name || "Untitled project"}</b>
                    <em>
                      {[p.stage, p.client].filter(Boolean).join(" · ") ||
                        "No client recorded"}
                    </em>
                  </span>
                </button>
              ))
            ) : (
              <p className="none">
                {projects ? "No other project matches." : "Your projects are still loading."}
              </p>
            )}
          </div>
        </WorkProjectPopover>
      ) : null}

      {open === "export" ? (
        <WorkProjectPopover
          anchorRef={exportRef}
          label="Export"
          className="pj-pop-x"
          onClose={close}
        >
          {exports.map((g) => (
            <React.Fragment key={g.key}>
              <p className="pj-pop-g">
                {g.label}
                {g.note ? <span>{g.note}</span> : null}
              </p>
              {g.hint ? <p className="pj-pop-h">{g.hint}</p> : null}
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAction?.(it.kind === "report" ? it.key : "export", it.key);
                  }}
                >
                  <span>
                    {it.label}
                    {it.note && it.kind === "workbook" ? <i>{it.note}</i> : null}
                  </span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </WorkProjectPopover>
      ) : null}

      {open === "more" ? (
        <WorkProjectPopover anchorRef={moreRef} label="More actions" onClose={close}>
          {actions.map((a) =>
            a.key === "classic" ? (
              <Link
                key={a.key}
                to={classicWorkspaceHref}
                // .pj-pop styles its own buttons; an <a> in the same list needs
                // the same box, which is what he does for his plugin link
                // (work-proj.js:465).
                style={{
                  display: "flex",
                  padding: "9px 10px",
                  fontSize: 13,
                  color: "var(--ink)",
                  textDecoration: "none",
                  borderRadius: 9,
                }}
                onClick={close}
              >
                {a.label}
              </Link>
            ) : (
              <button
                key={a.key}
                type="button"
                onClick={() => {
                  close();
                  onAction?.(a.key);
                }}
              >
                {a.label}
              </button>
            ),
          )}
        </WorkProjectPopover>
      ) : null}
    </div>
  );
}
