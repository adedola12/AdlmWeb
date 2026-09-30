// Richard's project workspace, as a route shell.
//
// His design (work-proj.js builds the whole view into <div id="pj-app"> from
// fixture data) against the account's own projects: his chrome, his eight tab
// bodies, his side panel and his header controls. Where his fixture holds a
// field our projects do not, each tab's model file says so and what stands in.
//
// It lives at /work/project/:productKey/:id, which was a bare redirect, so
// nothing that exists today changes while this is built. /projects/:tool
// remains the workspace customers price jobs from, untouched, and the
// redirect still runs for every role that is not staff — see pages/WorkProject.jsx.
//
// The CSS is already ours: 59 .pj-* classes came across in
// styles/ds-work-proj.css when his stylesheet was ported and have been dead
// since. This is what turns them on.

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProjects } from "../../ds/useProjects.js";
import { apiAuthed } from "../../api.js";
import { useAuth } from "../../store.jsx";
import { tabsFor, resolveTab, tabCount, tabNeedsAttention } from "./workProjectTabs.js";
import { STAGES, stageIndex } from "./overviewModel.js";
import { attachedModels } from "./sourcesModel.js";
import { linePanelTitle } from "./billModel.js";
import { saveProjectPatch, writeIdFor } from "./saveProject.js";
import WorkProjectHead from "./WorkProjectHead.jsx";
import { projectIdLabel } from "./headModel.js";
import WorkProjectPeople from "./WorkProjectPeople.jsx";
import WorkProjectOverview from "./WorkProjectOverview.jsx";
import WorkProjectBill from "./WorkProjectBill.jsx";
import WorkProjectRates from "./WorkProjectRates.jsx";
import WorkProjectPm from "./WorkProjectPm.jsx";
import WorkProjectActivity from "./WorkProjectActivity.jsx";
import WorkProjectValuations from "./WorkProjectValuations.jsx";
import {
  WorkProjectDrawings,
  WorkProjectModel,
  WorkProjectServices,
} from "./WorkProjectSources.jsx";
import WorkProjectLinePanel from "./WorkProjectLinePanel.jsx";
import WorkProjectPanel from "./WorkProjectPanel.jsx";
// The full workspace. Lazy: it pulls the 3D viewer, and the tabbed page must
// not carry three.js for a screen most visits never open.
const WorkProjectFourD = React.lazy(() => import("./WorkProjectFourD.jsx"));
import { useProjectPanel } from "./useProjectPanel.js";
import DsAppShell from "../../ds/DsAppShell.jsx";
import { useFeedback } from "../../ds/feedback/feedbackContext.js";
// His Project report and Project management report (work-proj.js:483). The
// documents already exist and are already what the classic workspace prints, so
// the menu opens those rather than a second kind of report.
const ReportModal = React.lazy(() => import("../reports/ReportModal.jsx"));
// His project-view rules. Imported here because this route is the first thing
// outside DsProjectGallery/DsWorkHome to use them — without it the whole view
// renders as an unstyled stack of divs.
import "../../styles/ds-work-proj.css";

const TOOL_NAMES = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
};

const toolName = (k) => TOOL_NAMES[String(k || "").toLowerCase()] || String(k || "").toUpperCase();

/**
 * Match on either id or slug: both appear in links and bookmarks.
 *
 * Returns null when nothing matches, and that matters. It used to fall back to
 * the first project of the same tool "so the page still gets the right tool
 * chrome", which on a stale link produced the worst page of the three: a stale
 * URL for a project that does not exist, showing ANOTHER project's name, stage
 * and bill count, beside an error note about the bill it could not read. Read
 * quickly it looks like that other project is broken. His design answers this
 * properly — "That project is not on this account" (work-proj.js:310) — and so
 * does the shell now.
 */
function findProject(projects, productKey, id) {
  if (!Array.isArray(projects)) return null;
  const want = String(id || "").toLowerCase();
  return (
    projects.find(
      (p) =>
        String(p?.slug || "").toLowerCase() === want ||
        String(p?.id || p?._id || "").toLowerCase() === want,
    ) || null
  );
}
export default function WorkProjectShell({ productKey, id }) {
  const { projects, failed } = useProjects();
  const { accessToken } = useAuth();
  const [params, setParams] = useSearchParams();

  const summary = React.useMemo(
    () => findProject(projects, productKey, id),
    [projects, productKey, id],
  );

  // The rollup carries the head — name, client, tool — but not the bill, and
  // the Overview is mostly arithmetic over bill lines. This is the same
  // address the classic workspace loads a project from
  // (ProjectsGeneric.jsx:278), so there is one way in, not two.
  const [full, setFull] = React.useState(null);
  const [fullFailed, setFullFailed] = React.useState(false);
  React.useEffect(() => {
    if (!accessToken || !id || !productKey) return undefined;
    let alive = true;
    setFullFailed(false);
    apiAuthed(`/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`, {
      token: accessToken,
    })
      .then((d) => alive && setFull(d?.project || d || null))
      .catch(() => alive && setFullFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, productKey, id]);

  // The full document where we have it, the summary where we do not, so the
  // head still fills in while the bill is loading.
  const project = React.useMemo(
    () => (full ? { ...summary, ...full } : summary),
    [full, summary],
  );

  const tabs = tabsFor(productKey);
  const tab = resolveTab(params.get("tab"), productKey);
  // His Rates tab has three views behind a segmented control. The chosen one
  // rides in the URL like the tab does, so a link to a view is shareable and
  // Back walks them.
  const rateView = params.get("view") || "rates";

  // FULL SCREEN
  //
  // In the URL, like the tab and the rate view, for the same three reasons: a
  // reload stays where you were, the link you send opens the way you left it,
  // and Back leaves the mode instead of leaving the project. `replace` is
  // deliberately NOT used — going full screen is a navigation a QS will want to
  // undo with the browser's own back button.
  const fullScreen = params.get("full") === "1";
  const toggleFullScreen = React.useCallback(() => {
    const q = new URLSearchParams(params);
    if (q.get("full") === "1") q.delete("full");
    else q.set("full", "1");
    setParams(q);
  }, [params, setParams]);
  const setRateView = React.useCallback(
    (next) => {
      const q = new URLSearchParams(params);
      if (next === "rates") q.delete("view");
      else q.set("view", next);
      setParams(q);
    },
    [params, setParams],
  );

  // His layer L5: a line, a rate build-up or the model changes open OVER the
  // tab, never as a new page (WORK.md §13). WorkProjectPanel owns the DOM, the
  // slide, the Escape guard and the focus return.
  const panel = useProjectPanel();

  // Changing tab closes whatever was open over the old one.
  const go = React.useCallback(
    (next) => {
      panel.close();
      const p = new URLSearchParams(params);
      // A view belongs to the tab that owns it.
      p.delete("view");
      if (next === "overview") p.delete("tab");
      else p.set("tab", next);
      // push, not replace: the back button should walk the tabs, which is the
      // thing ProjectsGeneric gets wrong today — it reads ?project= and then
      // deletes it, so back leaves the workspace entirely.
      setParams(p);
    },
    [params, setParams, panel],
  );

  // His [data-sheet] sets the Bill's search box to that sheet and jumps
  // (work-proj.js:1824). Ours carries it in the URL instead, so the jump is
  // shareable and Back comes back here.
  const openPlace = React.useCallback(
    (place) => {
      const q = new URLSearchParams(params);
      q.delete("view");
      q.set("tab", "bill");
      q.set("q", place);
      setParams(q);
    },
    [params, setParams],
  );

  const viewOnly = project?.access === "view" || project?.readOnly === true;

  // His .pj-sync (work-proj.js:355): "Saved" at rest, "Saving…" while a write
  // is in flight, "Saved just now" after one lands. A failure says so rather
  // than going quiet, because a silent failure on a bill is how somebody
  // believes a figure was recorded when it was not.
  const [saveState, setSaveState] = React.useState("idle");
  const [saveError, setSaveError] = React.useState("");
  // The last patch attempted, so "Try again" on a failure can re-send the same
  // change rather than asking somebody to find the line and set it twice.
  const lastPatch = React.useRef(null);
  // WRITES GO TO THE ObjectId, NOT THE SLUG IN THE ADDRESS BAR
  //
  // This route's :id is a slug (planswift-takeoff). Reading is fine — the load
  // above asks /projects/:key/by-slug/:slug, which exists for exactly this.
  // Saving is not: PUT /projects/:key/:id runs isValidObjectId on the param
  // (routes/projects.js:3732) and answers 400 "Invalid id" to anything else.
  //
  // So EVERY save from this page failed — progress, a rate, a section moved,
  // a line dragged, the procurement ticks — and the only sign of it was the
  // indicator reading "Not saved". The document we already hold carries the
  // real _id, so the fix is here rather than a new server route: no API
  // deploy, and nothing for the plugins to learn.
  const saveId = writeIdFor(full || summary, id);
  const save = React.useCallback(
    async (patch) => {
      if (!patch || viewOnly || !full) return;
      lastPatch.current = patch;
      setSaveError("");
      setSaveState("saving");
      try {
        const updated = await saveProjectPatch({
          project: full,
          productKey,
          id: saveId,
          token: accessToken,
          patch,
        });
        // The server's copy, not ours patched — otherwise the two drift and
        // the next save is built on a project that never existed.
        setFull(updated?.project || updated || null);
        setSaveState("saved");
      } catch (e) {
        // Say WHY. "Not saved" on its own sent a real failure back as a
        // shrug: the indicator was right and useless at the same time, and
        // the reason (a version conflict, a refused field) was sitting in the
        // response the whole time.
        setSaveError(
          String(e?.message || "").trim() ||
            "The server refused the change and did not say why.",
        );
        setSaveState("failed");
      }
    },
    [full, viewOnly, productKey, saveId, accessToken],
  );

  // His … overflow (work-proj.js:457). The menu itself is in WorkProjectHead;
  // what each entry DOES is here, because three of the five open something this
  // shell already owns.
  const fb = useFeedback();
  const [report, setReport] = React.useState("");
  // The OLDER screen, not this one full screen. classic=1 is the "I meant it"
  // marker ClassicProjectRedirect looks for; without it the redirect would send
  // this link straight back here and the two screens would bounce a reader
  // between them.
  const classicWorkspaceHref = `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}?project=${encodeURIComponent(id || "")}&classic=1`;
  // canManage is owner-only on the server (routes/projects.js:899), which is
  // exactly who his Collaborators entry is for.
  const isOwner = project?._access?.canManage === true;
  // "Plan the work from the bill" — the programme the rest of this page needs.
  //
  // The generator is the server's: POST /pm/generate-from-boq, which already
  // dates one task per bill line, links each to its bill identity, and leaves
  // every task that already exists alone. onlyUnlinked keeps that promise
  // explicit — planning twice adds what is missing rather than rebuilding a
  // programme somebody has adjusted.
  //
  // It is the missing middle of the chain: with no tasks nothing has a date, so
  // the buy schedule cannot work out a buy-by (it is the earliest linked task's
  // start less the lead time), the PM dashboard has no KPIs and there is no
  // cashflow. One call fills all three.
  const [planning, setPlanning] = React.useState(false);
  const [planFailed, setPlanFailed] = React.useState("");
  const planFromBill = React.useCallback(async () => {
    if (viewOnly || planning) return;
    setPlanning(true);
    setPlanFailed("");
    try {
      await apiAuthed(
        // Same reason as `save` above: loadProject runs isValidObjectId on
        // this param (routes/projects.pm.js:280), so the slug 400s here too.
        `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}/${encodeURIComponent(saveId)}/pm/generate-from-boq`,
        { token: accessToken, method: "POST", body: { onlyUnlinked: true } },
      );
      // Re-read rather than patch our copy: the server dates the tasks, and
      // guessing those dates here is how the Gantt and the buy schedule come to
      // disagree about the same programme.
      const fresh = await apiAuthed(
        `/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`,
        { token: accessToken },
      );
      setFull(fresh?.project || fresh || null);
    } catch (e) {
      setPlanFailed(
        e?.message ||
          "The programme could not be generated just now. Nothing was changed.",
      );
    } finally {
      setPlanning(false);
    }
  }, [viewOnly, planning, productKey, saveId, id, accessToken]);
  const clientName = String(project?.clientName || project?.client || "").trim();
  // The file his line names is the model the take-off came from.
  const sourceFileName = attachedModels(project)[0]?.sourceFile || "";
  const onAction = React.useCallback(
    (action) => {
      if (action === "people") {
        panel.show({ kind: "people" });
        return;
      }
      if (action === "id") {
        const label = projectIdLabel(project);
        if (!label) {
          fb.toast({ tone: "error", title: "This project has no id yet" });
          return;
        }
        // His fallback (work-proj.js:479) says copied either way. Ours does not:
        // over plain http, and in a browser that refuses the permission,
        // clipboard.writeText rejects and nothing is on the clipboard.
        const ok = () => fb.toast({ title: "Project ID copied", msg: label });
        const no = () => fb.toast({ tone: "error", title: "Could not copy it", msg: label });
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(label).then(ok, no);
        else no();
        return;
      }
      if (action === "full") {
        toggleFullScreen();
        return;
      }
      if (action === "report") setReport("project");
      if (action === "pm-report") setReport("pm");
      if (action === "retry" && lastPatch.current) save(lastPatch.current);
    },
    [panel, project, fb, save, toggleFullScreen],
  );

  // Escape leaves full screen — but only when it is the outermost thing open.
  // A line panel and a report dialog both close on Escape too, and a key that
  // dismisses two layers at once loses the one the reader meant.
  React.useEffect(() => {
    if (!fullScreen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (panel.visible || report) return;
      toggleFullScreen();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullScreen, panel.visible, report, toggleFullScreen]);

  // His "that project is not on this account" (work-proj.js:310).
  //
  // Both sources have to come up empty, not just the rollup. A project can load
  // by slug without being in the rollup — a shared one, or a rollup that failed —
  // and the old fallback existed for exactly that case; it just answered it by
  // showing ANOTHER project's chrome. So: the authoritative fetch has to have
  // failed (fullFailed), and the rollup has to not know it either. A stale slug
  // hits both, which is the case this is for.
  if (fullFailed && !full && !summary) {
    return (
      <DsAppShell title="Project" page="work-projects" sectionTabs={false}>
        <div className="dsh-in">
          <div className="pj-empty">
            <b>That project is not on this account</b>
            <p>
              It may have been deleted, or it belongs to someone who has not shared it
              with you.
            </p>
            <Link className="ds-btn btn-p ds-btn-sm" to="/work/projects">
              All projects
            </Link>
          </div>
        </div>
      </DsAppShell>
    );
  }
  return (
    // sectionTabs={false}: his work-project.html carries no tab strip above
    // the breadcrumb — the page's own .pj-tabs are its navigation.
    <DsAppShell
      title={project?.name || "Project"}
      page="work-projects"
      sectionTabs={false}
      full={fullScreen}
    >
      {/* His own work-project.html:347 is <main class="dsh-main"><div class=
          "dsh-in"><div id="pj-app">. The port dropped the middle one, so this
          page was the only screen in the shell with no gutter: its content sat
          at x=0 of the scroller and the rail's edge was all that stood between
          the title and the glass. Put it back and his three padding steps
          (36 / 20 / 16px) apply here as they do everywhere else. */}
      <div className="dsh-in">
        {/* FULL SCREEN IS THE FULL WORKSPACE, NOT THE TABS MADE WIDER.
            "Open the full workspace" was asked for three times and each time it
            meant this: one screen showing the whole job on a chosen date — the
            model, the programme, what is being built, what has to be bought and
            what it should have cost — not the same tabs with the rail hidden.
            The tabs answer "what is true now" one subject at a time; this
            answers "what is true on the 14th of March" about all of them at
            once. Leaving full screen returns to them. */}
        {fullScreen ? (
          <React.Suspense fallback={<div className="pj-empty sm"><b>Opening the workspace…</b></div>}>
            <WorkProjectFourD
              project={project}
              productKey={productKey}
              projectId={saveId}
              accessToken={accessToken}
              onExit={toggleFullScreen}
              onOpenLine={(index) => panel.show({ kind: "line", index })}
            />
          </React.Suspense>
        ) : (
        <>
        <div className="pj-head">
          <nav className="pj-crumb">
            <Link to="/work/projects">Projects</Link>
            <span aria-hidden="true">›</span>
            <Link to={`/work/tool/${encodeURIComponent(String(productKey || "").toLowerCase())}`}>
              {toolName(productKey)}
            </Link>
          </nav>

          <div className="pj-title">
            <h1>{project?.name || (projects ? "Project" : "Loading…")}</h1>
            {/* His stagePill is always there (work-proj.js:338). Ours used to
                render only when project.stage was set, which meant the pill
                vanished on a project whose stage has never been written — while
                the rail below still read "Takeoff", because stageIndex falls back
                to it. Two parts of one header disagreeing about the same fact.
                Both now read the same resolved stage. */}
            <span className={`pj-stage s-${STAGES[stageIndex(project)].id}`}>
              {STAGES[stageIndex(project)].name}
            </span>
          </div>

          {/* His three spans: tool · file, client, location (work-proj.js:339).
              Two of them were reading fields that do not exist on a project —
              `fileName` (the file lives on an attached model as sourceFile) and
              `client` (the column is clientName), so a project WITH a client
              never showed one. The client slot is always drawn, because "No
              client yet" is a fact worth reading and an absent line is not. */}
          <p className="pj-meta">
            <span>
              {toolName(productKey)}
              {sourceFileName ? ` · ${sourceFileName}` : ""}
            </span>
            <span>{clientName || "No client yet"}</span>
            {project?.location ? <span>{project.location}</span> : null}
          </p>

          <WorkProjectHead
            projects={projects}
            projectId={id}
            tab={tab}
            saveState={saveState}
            saveError={saveError}
            canEdit={!viewOnly}
            isOwner={isOwner}
            canSeePm={tabs.some((t) => t.key === "pm")}
            classicWorkspaceHref={classicWorkspaceHref}
            fullScreen={fullScreen}
            onAction={onAction}
          />
        </div>

        {viewOnly ? (
          <div className="pj-note">
            <div>
              <b>Shared with you.</b> You can see everything and follow progress. Editing needs a
              seat on the owner&rsquo;s account.
            </div>
          </div>
        ) : null}

        {fullFailed ? (
          <div className="pj-note">
            <div>
              <b>This project&rsquo;s bill could not be read just now.</b> Every figure below is
              computed from it, so they are missing rather than zero. Reload, or open the
              classic workspace, which reads it a different way.
            </div>
          </div>
        ) : failed ? (
          <div className="pj-note">
            <div>
              <b>Your project list could not be loaded just now.</b> The tabs are still the right
              ones for {toolName(productKey)}; the name and client are what is missing.
            </div>
          </div>
        ) : null}

        <div className="pj-tabs" role="tablist">
          {tabs.map((t) => {
            const count = tabCount(t.key, project);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => go(t.key)}
              >
                {t.label}
                {count != null ? <em>{count}</em> : null}
                {tabNeedsAttention(t.key, project) ? (
                  <i className="adlm-dot" aria-label="Needs attention" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="pj-body">
          {tab === "overview" && !fullFailed ? (
            <WorkProjectOverview
              project={project}
              toolName={toolName(productKey)}
              canEdit={!viewOnly}
              onGo={go}
            />
          ) : tab === "bill" && !fullFailed ? (
            <WorkProjectBill
              project={project}
              productKey={productKey}
              canEdit={!viewOnly}
              initialQuery={params.get("q") || ""}
              onOpenLine={(index) => panel.show({ kind: "line", index })}
              onGo={go}
              onSave={save}
              saving={saveState === "saving"}
            />
          ) : tab === "rates" && !fullFailed ? (
            <WorkProjectRates
              project={project}
              canEdit={!viewOnly}
              view={rateView}
              onView={setRateView}
              onOpenLine={(index) => panel.show({ kind: "line", index })}
              onGo={go}
              onSave={save}
              saving={saveState === "saving"}
            />
          ) : tab === "pm" && !fullFailed ? (
            <WorkProjectPm
              project={project}
              canEdit={!viewOnly}
              view={rateView}
              onView={setRateView}
              onGo={go}
              onPlan={planFromBill}
              planning={planning}
              planFailed={planFailed}
            />
          ) : tab === "activity" && !fullFailed ? (
          <WorkProjectActivity
            project={project}
            onGo={go}
            onOpenLine={(index) => panel.show({ kind: "line", index })}
          />
        ) : tab === "valuations" && !fullFailed ? (
            <WorkProjectValuations
              project={project}
              canEdit={!viewOnly}
              view={rateView}
              onView={setRateView}
              onGo={go}
            />
          ) : tab === "model" && !fullFailed ? (
            <WorkProjectModel project={project} canEdit={!viewOnly} onGo={go} />
          ) : tab === "drawings" && !fullFailed ? (
            <WorkProjectDrawings project={project} onOpenPlace={openPlace} />
          ) : tab === "services" && !fullFailed ? (
            <WorkProjectServices project={project} canEdit={!viewOnly} />
          ) : null}
        </div>
        </>
        )}

        {panel.content?.kind === "people" ? (
          <WorkProjectPanel title="Collaborators" visible={panel.visible} onClose={panel.close}>
            <WorkProjectPeople project={project} classicWorkspaceHref={classicWorkspaceHref} />
          </WorkProjectPanel>
        ) : null}

        {report ? (
          <React.Suspense fallback={null}>
            <ReportModal
              open
              onClose={() => setReport("")}
              type={report}
              productKey={String(productKey || "").toLowerCase()}
              projectId={project?._id || project?.id || id}
            />
          </React.Suspense>
        ) : null}

        {panel.content?.kind === "line" ? (
          <WorkProjectPanel
            title={linePanelTitle(project?.items, panel.content.index)}
            visible={panel.visible}
            onClose={panel.close}
          >
            <WorkProjectLinePanel
              project={project}
              index={panel.content.index}
              canEdit={!viewOnly}
              contractLocked={Boolean(project?.contract?.locked)}
              onSave={save}
              saving={saveState === "saving"}
              onGoToLine={(i) => panel.show({ kind: "line", index: i })}
              onGo={go}
            />
          </WorkProjectPanel>
        ) : null}
      </div>
    </DsAppShell>
  );
}
