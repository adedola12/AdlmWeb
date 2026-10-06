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
import {
  tabsFor,
  resolveTab,
  tabCount,
  tabNeedsAttention,
  loadingNoun,
  placeToRemember,
} from "./workProjectTabs.js";
import { rememberPlace } from "../../lib/lastPlace.js";
import { StillLoading } from "./workProjectBits.jsx";
import { STAGES, stageIndex } from "./overviewModel.js";
import { attachedModels } from "./sourcesModel.js";
import { linePanelTitle } from "./billModel.js";
import { saveProjectPatch, writeIdFor } from "./saveProject.js";
import WorkProjectHead from "./WorkProjectHead.jsx";
import { projectIdLabel } from "./headModel.js";
import WorkProjectPeople from "./WorkProjectPeople.jsx";
import WorkProjectExports from "./WorkProjectExports.jsx";
import WorkProjectIssueCert from "./WorkProjectIssueCert.jsx";
import { withIssuedCertificate } from "./certificateDraft.js";
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
import TipChip from "../tips/TipChip.jsx";
import { PROJECT_UPDATED_EVENT } from "../ada/adaCardsModel.js";
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
  // A TRI-STATE, not two booleans.
  //
  // "idle" and "loading" are different facts and the difference is load-bearing:
  // the effect below BAILS when there is no token or no id yet, so a flag
  // derived as `!full && !fullFailed` would read as loading before the effect
  // has run, and would stay that way for good in the bail case — pinning a
  // "Loading…" on a screen that is not loading anything. That is the same
  // complaint as the one this whole change set is fixing, arrived at from the
  // other direction.
  const [fullState, setFullState] = React.useState("idle"); // idle|loading|ready|failed
  React.useEffect(() => {
    if (!accessToken || !id || !productKey) return undefined;
    let alive = true;
    setFullState("loading");
    apiAuthed(`/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`, {
      token: accessToken,
    })
      .then((d) => {
        if (!alive) return;
        setFull(d?.project || d || null);
        setFullState("ready");
      })
      .catch(() => alive && setFullState("failed"));
    return () => {
      alive = false;
    };
  }, [accessToken, productKey, id]);

  // Derived so every existing use below keeps reading the same way.
  const fullFailed = fullState === "failed";
  const loadingFull = fullState === "loading";

  // Ada's pricing card writes to this project from the chat panel. When it
  // does, re-read the bill rather than go on showing the lines as unpriced.
  React.useEffect(() => {
    if (!accessToken || !id || !productKey) return undefined;
    const onUpdated = (e) => {
      const changed = String(e?.detail?.id || "");
      const mine = String(full?._id || full?.id || "");
      if (changed && mine && changed !== mine) return;
      apiAuthed(`/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`, {
        token: accessToken,
      })
        .then((d) => setFull(d?.project || d || null))
        .catch(() => {});
    };
    window.addEventListener(PROJECT_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PROJECT_UPDATED_EVENT, onUpdated);
  }, [accessToken, productKey, id, full]);

  // The full document where we have it, the summary where we do not, so the
  // head still fills in while the bill is loading.
  const project = React.useMemo(
    () => (full ? { ...summary, ...full } : summary),
    [full, summary],
  );

  // Letting the HEAD fill in early from the rollup is right and stays — the
  // name, client and tool are in it and are true. Letting the TABS read the
  // rollup as though it were the whole project is not: see StillLoading in
  // workProjectBits.jsx for what each of them says while it waits. The gate is
  // in front of the tab switch, once, rather than a flag threaded through nine
  // components, because a tab added later cannot forget a gate it never had to
  // remember.

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

  // WHERE THIS READER LAST WAS, for "Pick up where you left off" on Work home.
  // The reasoning, and what was broken, is with placeToRemember.
  //
  // `tabs` above is deliberately not a dependency: tabsFor returns a fresh array
  // every render, so depending on it would rewrite storage on every render
  // rather than when the reader actually moves.
  React.useEffect(() => {
    const place = placeToRemember({ productKey, id, name: project?.name, tab });
    if (place) rememberPlace(place);
  }, [productKey, id, project?.name, tab]);

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

  // `_access`, with the underscore, is what the server actually sends
  // (server/routes/projects.js, obj._access = access). This read was
  // `project?.access === "view" || project?.readOnly === true`, and the payload
  // carries neither of those keys — so both halves were permanently false and
  // viewOnly was always false, whoever was looking.
  //
  // What that cost: canEdit went into the Bill and the line panel as true even
  // for a collaborator with view access and on the read-only sample projects.
  // The controls rendered enabled, and the refusal arrived as a failed save
  // instead of a control that was never offered. Line 764 of this same file
  // already read _access?.canEdit correctly, so the two disagreed about the
  // same question a few hundred lines apart.
  //
  // The two old reads are kept as a fallback rather than deleted: a payload
  // from an older server, or a shape this has not met, should still be able to
  // say "view only" and be believed.
  const viewOnly =
    project?._access?.canEdit === false ||
    project?.access === "view" ||
    project?.readOnly === true;

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
  // PRICING A LINE FROM A RATE.
  //
  // This closes the loop the Rates tab had: "Open the line" opened the panel,
  // and the panel's "Price it" went back to Rates, with nowhere in between to
  // actually price anything. The Rates view is read-only on purpose — a rate is
  // built in RateGen — so the answer is to offer the rate the QS already built.
  //
  // The endpoint has existed since 23 September and nothing ever called it:
  // it sets the line's rate AND writes the material, labour and plant rows, so
  // the budget is priced in the same step rather than left on 0-rate
  // placeholders. Re-reads afterwards because the server touches two
  // collections and guessing the result here is how two screens come to
  // disagree.
  const [pricing, setPricing] = React.useState(false);
  const [priceFailed, setPriceFailed] = React.useState("");
  // What the build-up could not price. The endpoint returns these — a material
  // with no price in the constants library, say — and dropping them leaves a
  // budget row sitting at zero with nothing said about why.
  const [priceNotes, setPriceNotes] = React.useState([]);
  const priceLineFromRate = React.useCallback(
    async (code, pick) => {
      if (viewOnly || !code || !pick) return false;
      setPricing(true);
      setPriceFailed("");
      setPriceNotes([]);
      try {
        const wrote = await apiAuthed(
          `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}/${encodeURIComponent(saveId)}/bill/${encodeURIComponent(code)}/price-from-rate`,
          {
            token: accessToken,
            method: "POST",
            body: {
              rateId: pick.rateId,
              description: pick.description,
              unit: pick.unit,
              // A rate in another unit: the dimension the QS confirmed. The
              // server works the factor out itself.
              ...(pick.convert ? { convert: pick.convert } : {}),
            },
          },
        );
        const warnings = Array.isArray(wrote?._rateWarnings) ? wrote._rateWarnings : [];
        if (warnings.length) setPriceNotes(warnings.map((w) => String(w)).slice(0, 6));
        const fresh = await apiAuthed(
          `/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`,
          { token: accessToken },
        );
        setFull(fresh?.project || fresh || null);
        return true;
      } catch (e) {
        setPriceFailed(
          String(e?.message || "").trim() || "That rate could not be applied just now.",
        );
        return false;
      } finally {
        setPricing(false);
      }
    },
    [viewOnly, productKey, saveId, id, accessToken],
  );

  // PRICING MANY LINES AT ONCE.
  //
  // The lines like the one being priced ("Lintel Concrete" on every level), or
  // a priced line's rate copied to the rest of them. One request and one write
  // server-side (POST .../bill/price-many); every rate is still re-read from the
  // QS's own library there. Returns what the server said so the panel can say
  // how many were priced and why any were skipped.
  const [pricedNote, setPricedNote] = React.useState(null);
  const priceManyLines = React.useCallback(
    async (lines, via = "similar") => {
      if (viewOnly || !Array.isArray(lines) || !lines.length) return null;
      setPricing(true);
      setPriceFailed("");
      setPriceNotes([]);
      setPricedNote(null);
      try {
        const wrote = await apiAuthed(
          `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}/${encodeURIComponent(saveId)}/bill/price-many`,
          { token: accessToken, method: "POST", body: { lines, via } },
        );
        const warnings = Array.isArray(wrote?._rateWarnings) ? wrote._rateWarnings : [];
        if (warnings.length) setPriceNotes(warnings.map((w) => String(w)).slice(0, 6));
        setPricedNote({
          priced: Array.isArray(wrote?._priced) ? wrote._priced : [],
          skipped: Array.isArray(wrote?._skipped) ? wrote._skipped : [],
        });
        const fresh = await apiAuthed(
          `/projects/${encodeURIComponent(productKey)}/by-slug/${encodeURIComponent(id)}`,
          { token: accessToken },
        );
        setFull(fresh?.project || fresh || null);
        return wrote;
      } catch (e) {
        setPriceFailed(
          String(e?.message || "").trim() || "Those lines could not be priced just now.",
        );
        return null;
      } finally {
        setPricing(false);
      }
    },
    [viewOnly, productKey, saveId, id, accessToken],
  );

  // The best rate per unpriced line, for the Rates tab's list.
  //
  // Fetched when that tab is opened rather than on every load: it reads the
  // whole rate library, and most visits never look at Rates. One request for
  // the list; the side panel asks separately for a line's full five.
  const [rateMap, setRateMap] = React.useState(null);
  React.useEffect(() => {
    if (tab !== "rates" || !accessToken || !saveId || !productKey) return undefined;
    let live = true;
    apiAuthed(
      `/projects/${encodeURIComponent(String(productKey).toLowerCase())}/${encodeURIComponent(saveId)}/rate-suggestions?convert=1`,
      { token: accessToken },
    )
      .then((d) => {
        if (!live) return;
        // Keep what the server SAID, not just the matches. It reports when it
        // stopped at its ceiling and when rates are masked from this reader,
        // and dropping those turns "we did not look at these 300 lines" into
        // "these 300 lines have no rate" — an absence read as a fact.
        setRateMap({
          byCode: d?.byCode && typeof d.byCode === "object" ? d.byCode : {},
          truncated: Boolean(d?.truncated),
          considered: Number(d?.considered) || 0,
          unpriced: Number(d?.unpriced) || 0,
          masked: Boolean(d?.masked),
          libraryCount: Number(d?.libraryCount) || 0,
        });
      })
      // A suggestion that cannot be fetched must not break the tab, but it must
      // not read as "nothing matched" either: `failed` says which it was.
      .catch(() => {
        if (live) setRateMap({ byCode: {}, failed: true });
      });
    return () => {
      live = false;
    };
  }, [tab, accessToken, saveId, productKey]);

  // THE WHOLE RATE LIBRARY, for searching by name.
  //
  // Both ends of this are deployed everywhere: the merged library here, and
  // POST .../price-from-rate to apply a pick. The scored SUGGESTIONS need a
  // newer endpoint that is not on every server yet — so where they are missing,
  // this is what lets a QS price a line at all, and where they are present it
  // is still how somebody finds the rate they already have in mind by name.
  //
  // Fetched once and kept: it is the same list for every line on the project,
  // and re-reading it per keystroke would be a request per keystroke.
  const libraryRef = React.useRef(null);
  const [libraryFailed, setLibraryFailed] = React.useState(false);
  const rateLibrary = React.useCallback(async () => {
    if (libraryRef.current) return libraryRef.current;
    try {
      const d = await apiAuthed("/rategen-v2/library/user-rates/merged", { token: accessToken });
      const items = Array.isArray(d?.items) ? d.items : [];
      libraryRef.current = items;
      setLibraryFailed(false);
      return items;
    } catch {
      // Say so rather than return [] — "no rates" and "could not read your
      // rates" are different answers and only one of them is the QS's fault.
      setLibraryFailed(true);
      return null;
    }
  }, [accessToken]);

  // The rates this line could be priced with — the QS's own library, matched on
  // description and unit. Returns [] rather than throwing: a suggestion that
  // cannot be fetched must not stop somebody opening a line.
  const rateSuggestions = React.useCallback(
    async (code) => {
      if (!code) return [];
      try {
        const d = await apiAuthed(
          `/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}/${encodeURIComponent(saveId)}/bill/${encodeURIComponent(code)}/rate-suggestions?convert=1`,
          { token: accessToken },
        );
        return Array.isArray(d?.suggestions) ? d.suggestions : [];
      } catch {
        return [];
      }
    },
    [productKey, saveId, accessToken],
  );

  /**
   * Issue an interim certificate.
   *
   * POST, not a patch through save(): a certificate is a new document with its
   * own number, and the server decides that number (max + 1) precisely so two
   * people issuing at once cannot both believe they issued IPC 4. Sending it
   * through the project PUT would make the certificate list something the client
   * writes, which is how two of them end up numbered the same.
   *
   * It answers with the updated project, so the tab takes that straight rather
   * than refetching what it was just sent — and throws its own message up to the
   * form, where there is room to read it. "Final account is finalized. Reopen it
   * before issuing new certificates." is an instruction, not a status code.
   */
  const issueCertificate = React.useCallback(
    async (body) => {
      if (!accessToken || !saveId || !productKey) {
        throw new Error("This project is still loading.");
      }
      const out = await apiAuthed(
        `/projects/${encodeURIComponent(String(productKey).toLowerCase())}/${encodeURIComponent(saveId)}/certificates`,
        {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {}),
        },
      );
      // It answers with { ok, certificate, version }, not the project, so the two
      // things that changed are folded in by hand. withIssuedCertificate says
      // which two and why — and it is a function rather than three lines here
      // because getting either of them wrong is silent: the tab keeps saying "No
      // valuations yet", or the next bill save goes out against a version the
      // server has already moved past.
      setFull((prev) => withIssuedCertificate(prev, out));
      fb.toast({ tone: "success", title: "Certificate issued as a draft" });
      return out?.certificate || out;
    },
    [accessToken, saveId, productKey, fb],
  );

  const clientName = String(project?.clientName || project?.client || "").trim();
  // The file his line names is the model the take-off came from.
  const sourceFileName = attachedModels(project)[0]?.sourceFile || "";
  const onAction = React.useCallback(
    (action) => {
      if (action === "people") {
        panel.show({ kind: "people" });
        return;
      }
      if (action === "export") {
        panel.show({ kind: "export" });
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

        {/* One live tip for this tab (features/tips). Only on the full
            document: the summary has no bill, and a tip read off it would
            say "no programme" about a job that has one. Rule-based, so this
            costs nothing per view. */}
        {full && !fullFailed && ["overview", "bill", "rates", "pm"].includes(tab) ? (
          <TipChip
            project={project}
            tab={tab}
            canEdit={!viewOnly && project?._access?.canEdit !== false}
            onGo={go}
          />
        ) : null}

        <div className="pj-body">
          {/* ONE gate for every tab.
              Loading first, so no tab answers from the rollup and announces
              that a project has none of something it has. The `&& !fullFailed`
              that used to sit on each branch is gone: it is this condition, and
              having it nine times meant a failed read rendered an entirely
              blank body under the note above. */}
          {loadingFull ? (
            <StillLoading what={loadingNoun(tab)} />
          ) : tab === "overview" && !fullFailed ? (
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
              rateMap={rateMap}
              onApplyRate={priceLineFromRate}
              pricing={pricing}
              priceFailed={priceFailed}
              priceNotes={priceNotes}
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
              onIssueCert={() => panel.show({ kind: "cert" })}
              // The lock lives on the classic workspace and needs a step-up,
              // so the button that says so now actually goes there.
              classicHref={classicWorkspaceHref}
            />
          ) : tab === "model" && !fullFailed ? (
            <WorkProjectModel
              project={project}
              canEdit={!viewOnly}
              onGo={go}
              loading={loadingFull}
              classicHref={classicWorkspaceHref}
              productKey={productKey}
              projectId={full?._id || full?.id || ""}
              accessToken={accessToken}
            />
          ) : tab === "drawings" && !fullFailed ? (
            <WorkProjectDrawings
              project={project}
              onOpenPlace={openPlace}
              loading={loadingFull}
            />
          ) : tab === "services" && !fullFailed ? (
            <WorkProjectServices
              project={project}
              canEdit={!viewOnly}
              loading={loadingFull}
              classicHref={classicWorkspaceHref}
              productKey={productKey}
              projectId={full?._id || full?.id || ""}
              accessToken={accessToken}
              // The link POST answers with the updated project, so the screen
              // takes it straight rather than refetching what it was just sent.
              onLinked={(updated) => setFull(updated?.project || updated || null)}
            />
          ) : null}
        </div>
        </>
        )}

        {panel.content?.kind === "people" ? (
          <WorkProjectPanel title="Collaborators" visible={panel.visible} onClose={panel.close}>
            <WorkProjectPeople project={project} classicWorkspaceHref={classicWorkspaceHref} />
          </WorkProjectPanel>
        ) : null}

        {panel.content?.kind === "cert" ? (
          <WorkProjectPanel
            title="Issue a certificate"
            visible={panel.visible}
            onClose={panel.close}
          >
            {/* `full`, not `project`: the next number and the retention held are
                read off the certificates, which the rollup summary does not
                carry — so off `project` the form would offer IPC 1 on a contract
                that has three. */}
            <WorkProjectIssueCert
              project={full}
              onIssue={issueCertificate}
              onDone={panel.close}
            />
          </WorkProjectPanel>
        ) : null}

        {panel.content?.kind === "export" ? (
          <WorkProjectPanel title="Export to Excel" visible={panel.visible} onClose={panel.close}>
            {/* `full`, not `project`. The documents offered depend on the
                certificates, the final account and _access — none of which are
                in the rollup summary the head fills itself from, so offering
                them off `project` would show a QS no certificates on a contract
                that has four until the full load lands. */}
            <WorkProjectExports
              project={full}
              productKey={productKey}
              saveId={saveId}
              accessToken={accessToken}
              classicHref={classicWorkspaceHref}
              onToast={fb.toast}
            />
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
              onFetchRates={rateSuggestions}
              onSearchRates={rateLibrary}
              libraryFailed={libraryFailed}
              onApplyRate={priceLineFromRate}
              onPriceMany={priceManyLines}
              pricedNote={pricedNote}
              pricing={pricing}
              priceFailed={priceFailed}
              priceNotes={priceNotes}
            />
          </WorkProjectPanel>
        ) : null}
      </div>
    </DsAppShell>
  );
}
