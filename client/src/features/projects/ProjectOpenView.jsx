import React from "react";
import { useSearchParams } from "react-router-dom";
import { rememberPlace } from "../../lib/lastPlace.js";
import { useDismiss as useSharedDismiss } from "../../ds/dismiss.js";
import { FaCheck, FaCopy, FaTrash } from "../../components/icons.jsx";
import ProjectBillTable from "./ProjectBillTable.jsx";
import ProjectBudgetTab from "./ProjectBudgetTab.jsx";
import ProjectContractPanel from "./ProjectContractPanel.jsx";
import ProjectDashboardSummary from "./ProjectDashboardSummary.jsx";
import LinkedProjectsCard from "./LinkedProjectsCard.jsx";
import ServicesPricingPanel from "./ServicesPricingPanel.jsx";
import ProjectManagementTab from "./ProjectManagementTab.jsx";
import ProjectValuationSummary from "./ProjectValuationSummary.jsx";
import CollaboratorsModal from "./CollaboratorsModal.jsx";
import { approvedVariationsEarned } from "../../lib/variations.js";
import { projectTotals } from "./lib/projectTotals.js";

// Lazy — the report preview pulls in the chart/PDF stack only when opened.
const ReportModal = React.lazy(() => import("../reports/ReportModal.jsx"));

// Lazy — pulls in three.js + the web-ifc wasm; only loads when the 3D tab opens.
const ModelViewer = React.lazy(() => import("./ModelViewer.jsx"));
const WorkAreaView = React.lazy(() => import("./WorkAreaView.jsx"));

// Close a popover on an outside press, Escape, or another dropdown opening:
// the shared rule in ds/dismiss.js (R05), kept under this file's argument
// order.
function useDismiss(ref, open, onClose) {
  useSharedDismiss(open, onClose, [ref]);
}

// A popover anchored to the right edge of its trigger, in his .wk-dd-m.
const MENU_RIGHT = { left: "auto", right: 0, width: 320 };
const BARE_BUTTON = {
  background: "none",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

// The public dashboard link, in his dropdown. Actions inside it are his menu
// rows (.wk-dd-m button), which is how his dropdowns present actions.
function ShareDashboardButton({
  publicShareEnabled,
  publicToken,
  onToggleShare,
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const shareUrl = publicToken
    ? `${window.location.origin}/projects/shared/${publicToken}`
    : "";

  async function handleToggle(enable) {
    setBusy(true);
    await onToggleShare?.(enable);
    setBusy(false);
  }

  function copyUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`wk-dd${open ? " on" : ""}`} ref={ref}>
      <button
        type="button"
        className="ds-btn ds-btn-sm btn-o"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {publicShareEnabled ? "Shared · link on" : "Share dashboard"}
      </button>

      {open && (
        <div className="wk-dd-m" style={{ ...MENU_RIGHT, maxHeight: "none", padding: 14 }}>
          <b style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
            Share Dashboard
          </b>
          <p className="wk-fx" style={{ margin: "6px 0 12px" }}>
            Generate a public link so clients can view the project dashboard
            (progress &amp; cost summary only).
          </p>

          <label
            className="wk-fx"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
          >
            <input
              type="checkbox"
              checked={publicShareEnabled}
              disabled={busy}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            {busy ? "Updating..." : "Enable public link"}
          </label>

          {publicShareEnabled && shareUrl ? (
            <>
              <label className="wk-f">
                <span>Public link</span>
                <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              </label>
              <button type="button" onClick={copyUrl} style={{ marginTop: 8 }}>
                <span>
                  {copied ? (
                    <>
                      <FaCheck size={13} /> Copied
                    </>
                  ) : (
                    <>
                      <FaCopy size={13} /> Copy link
                    </>
                  )}
                </span>
              </button>
              <p className="wk-fx" style={{ margin: "8px 0 0" }}>
                Anyone with this link can view the dashboard summary and chart
                (no editing, no item details).
              </p>
            </>
          ) : null}

          <button type="button" onClick={close} style={{ marginTop: 8 }}>
            <span>Close</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Every export the page offers, in his dropdown. The open state stays with the
// parent (it already closes the menu before each export runs).
function ExportMenu({
  open,
  onToggle,
  isBoqImport,
  onExportBillBudget,
  onExportGenericBoQ,
  onExportGenericTradeBoQ,
  onExportElementalBoQ,
}) {
  const ref = React.useRef(null);
  const close = React.useCallback(() => {
    if (open) onToggle?.();
  }, [open, onToggle]);
  useDismiss(ref, open, close);

  const group = (label, note) => (
    <div className="wk-grp" style={{ padding: "10px 11px 4px" }}>
      {label}
      {note ? (
        <span style={{ marginLeft: 6, textTransform: "none", letterSpacing: 0, fontWeight: 300 }}>
          {note}
        </span>
      ) : null}
    </div>
  );
  const item = (key, label, title, onClick, note) => (
    <button key={key} type="button" role="menuitem" title={title} onClick={onClick}>
      <span>
        {label}
        {note ? <i>{note}</i> : null}
      </span>
    </button>
  );

  return (
    <div className={`wk-dd${open ? " on" : ""}`} ref={ref}>
      <button
        type="button"
        className="wk-dd-b"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="l">Export</span>
        <span className="v">Workbooks</span>
        <i />
      </button>
      {open ? (
        <div className="wk-dd-m" role="menu" style={{ ...MENU_RIGHT, maxHeight: "70vh" }}>
          {onExportBillBudget ? (
            <>
              {group("Bill & Budget", "the bill as it is here, with the build-up")}
              {item(
                "bb-cat",
                "Export bill & budget workbook",
                "Bill of Quantities with your own sections, subtitles and totals, plus separate Material, Labour and Plant schedules, a Schedule of Current Prices and a Material Summary",
                () => onExportBillBudget("category"),
                "Material / Labour split · current prices · material summary",
              )}
              {item(
                "bb-trade",
                "Export bill & budget (by trade)",
                "The same workbook, with the bill sectioned by work section (trade) instead of building element",
                () => onExportBillBudget("trade"),
              )}
              {/* An imported bill is already in a QS's own arrangement. The
                  elemental / trade / milestone exports below re-cut it against
                  a mapping built for plugin takeoffs, which loses that
                  arrangement — so say which one to pick. */}
              {isBoqImport ? (
                <p className="wk-fx" style={{ margin: 0, padding: "6px 11px 8px" }}>
                  This project came from an Excel bill — use the export above to get
                  it back in its own sections and totals. The formats below re-cut
                  the bill against a standard elemental or trade arrangement.
                </p>
              ) : null}
            </>
          ) : null}

          {group("Generic BoQ")}
          {item(
            "gen-cat",
            "Export generic BoQ (by category)",
            "Category-grouped workbook (Substructure / Superstructure / HVAC / Plumbing / Electrical)",
            onExportGenericBoQ,
          )}
          {onExportGenericTradeBoQ
            ? item(
                "gen-trade",
                "Export generic BoQ (by trade)",
                "Group the same items by trade (Concrete, Formwork, Reinforcement, Masonry, Finishes, etc.)",
                onExportGenericTradeBoQ,
              )
            : null}

          {group("Elemental BoQ", "grouped by building element")}
          {item("el-b", "Bungalow", "Single-storey building format", () =>
            onExportElementalBoQ?.("bungalow", undefined, "elemental"),
          )}
          {item("el-m", "Multi-storey", "Multi-storey building", () =>
            onExportElementalBoQ?.("multistorey", undefined, "elemental"),
          )}

          {group("Trade BoQ", "grouped by work section (NRM2-style)")}
          {item(
            "tr-b",
            "Bungalow (Trade format)",
            "Concrete, formwork, reinforcement, masonry, finishes, painting, plumbing, electrical and HVAC each get their own bill",
            () => onExportElementalBoQ?.("bungalow", undefined, "trade"),
          )}
          {item("tr-m", "Multi-storey (Trade format)", "Multi-storey trade-format BoQ", () =>
            onExportElementalBoQ?.("multistorey", undefined, "trade"),
          )}

          {group("Milestone BoQ", "one priceable bill per construction stage")}
          {item(
            "ms-b",
            "Bungalow (Milestone format)",
            "Substructure, ground floor, roof: each a bill of its own that can be priced, valued and paid against",
            () => onExportElementalBoQ?.("bungalow", undefined, "milestone"),
          )}
          {item(
            "ms-m",
            "Multi-storey (Milestone format)",
            "One bill per storey, in the order the building goes up: the basis for a payment schedule",
            () => onExportElementalBoQ?.("multistorey", undefined, "milestone"),
          )}
        </div>
      ) : null}
    </div>
  );
}

// Tabs are grouped so navigation reads as three clear stages of a job:
//   Overview   → Dashboard      (high-level financial / progress)
//   Commercial → Bill of Quantity, Valuation  (money: rates, certs)
//   Delivery   → 3D Model, PM Dashboard        (build: model, schedule)
// Order is group-contiguous so the in-project tab bar can show the
// group dividers. `id`s are unchanged, so the render branches below
// (which key off activeTab id, not position) are unaffected.
const TAB_OPTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    helper: "Overview and progress",
    group: "Overview",
  },
  {
    id: "bill",
    label: "Bill of Quantity",
    helper: "Rates and line items",
    group: "Commercial",
  },
  {
    id: "budget",
    label: "Budget",
    helper: "Cost plan & procurement",
    group: "Commercial",
  },
  {
    id: "valuation",
    label: "Valuation",
    helper: "Certificates and settings",
    group: "Commercial",
  },
  {
    id: "work",
    label: "Work area",
    helper: "Model, bill, schedule and Ada together",
    group: "Delivery",
  },
  {
    id: "model",
    label: "3D Model",
    helper: "View & verify the BIM model",
    group: "Delivery",
  },
  {
    id: "pm",
    label: "PM Dashboard",
    helper: "Schedule, EVM, risks, issues",
    group: "Delivery",
  },
];

// Icons for the views sidebar, from the app sprite (DsAppSprite).
const VIEW_ICONS = {
  dashboard: "hi-overview",
  bill: "hi-doc",
  budget: "hi-billing",
  valuation: "hi-cert",
  work: "hi-products",
  model: "hi-product",
  pm: "hi-calendar",
};
// Whether the views sidebar is open, remembered per browser. Phones ignore it
// and always start closed, so opening it on a phone never changes the desktop.
const VIEWS_KEY = "adlm.projectViews.open";
const NARROW = "(max-width: 1000px)";

const isNarrowNow = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.(NARROW).matches);

export default function ProjectOpenView({
  actualCoverageCount = 0,
  actualCoveragePercent = 0,
  actualLatestAt = null,
  actualPlannedAmount = 0,
  actualQtyInputs = {},
  actualQtyOverrideCount = 0,
  actualRateInputs = {},
  actualRateOverrideCount = 0,
  actualTrackedAmount = 0,
  actualVarianceAmount = 0,
  actualVariancePercent = 0,
  autoFillBusy = false,
  autoFillMaterialsRates = false,
  canRateGen = false,
  checkboxCls = "",
  comparisonRows = [],
  computedShown = [],
  dashboardChartMode = "pie",
  exportOpen = false,
  getCandidatesForItem,
  grossAmount = 0,
  isDirty = false,
  isGroupLinked,
  itemQuery = "",
  items = [],
  budgetItems = [],
  materialItems = [],
  onSaveBudget,
  // Rebuild the material & labour schedule from the current Material Constants.
  // Null hides the control (e.g. view-only access).
  onRebuildSchedule = null,
  productKey = "",
  // "boq-import" marks a project created from an Excel BoQ (admin-granted
  // Quiv feature): no BIM model exists, so the 3D Model tab and linking
  // surfaces are withheld. "" for plugin-synced projects.
  projectOrigin = "",
  projectId = "",
  accessToken = "",
  // Collaborator access descriptor from the server (project._access). Defaults
  // to full owner access so owner-opened projects behave exactly as before.
  access = {
    role: "owner",
    canEdit: true,
    canExport: true,
    canManage: true,
    canSeeRates: true,
  },
  linkedGroupsCount = 0,
  // Cross-project links (MEP services → this general bill). Feature P1.
  linkedSummaries = [],
  onLinkedChange,
  loadingValuations = false,
  onActualQtyChange,
  onActualRateChange,
  onBack,
  onClearItemQuery,
  onClosePickKey,
  onDashboardChartModeChange,
  onDelete,
  onDeleteItem,
  onExportElementalBoQ,
  onExportBillBudget,
  onExportGenericBoQ,
  onExportGenericTradeBoQ,
  onItemQueryChange,
  onMoveItem,
  onPickCandidate,
  onPickBoqCandidate,
  onRateChange,
  onSearchRateGen,
  onSave,
  onSelectValuationDate,
  onStatusToggle,
  percentMap = {},
  onPercentChange,
  onCategoryChange,
  categoryOptions = [],
  tradeOptions = [],
  onTradeChange,
  // Budget-tab pricing + custom categories + budget-driven (read-only) rates.
  onSearchBudgetRates,
  budgetRateGenReady = false,
  budgetDrivenCodes,
  onAddCategory,
  onRemoveCategory,
  onAddTrade,
  groupByMode = "category",
  sourceOptions = [],
  mergeInfo = null,
  onReorderMergeParts,
  mergeReorderBusy = false,
  onGroupByModeChange,
  contract,
  contractBusy = false,
  stepUpEnabled = false,
  onLockContract,
  onUnlockContract,
  onPreliminaryPercentChange,
  // S18 bill: the contingency and VAT percentages reached this component from
  // ProjectsGeneric but were never forwarded, so the Bill fell back to its own
  // defaults and its two inputs were read-only. They now reach the Summary.
  contingencyPercent,
  taxPercent,
  onContingencyPercentChange,
  onTaxPercentChange,
  // S18 bill: the measured work on its own. `grossAmount` here is the whole
  // project scope (the Overview needs it that way), which is not the base the
  // grand summary is built on.
  measuredAmount = null,
  onMarkTendered,
  onRestoreProvisionalSum,
  certificates = [],
  certBusy = false,
  onIssueCertificate,
  onUpdateCertificate,
  onDeleteCertificate,
  onDownloadCertificate,
  finalAccount,
  onFinalizeAccount,
  onReopenFinalAccount,
  onDownloadFinalAccount,
  projectModels,
  modelUploadBusy,
  onUploadModel,
  onDeleteModel,
  provisionalSums = [],
  onAddProvisionalSum,
  onUpdateProvisionalSum,
  onRemoveProvisionalSum,
  variations = [],
  onAddVariation,
  onUpdateVariation,
  onRemoveVariation,
  // S18 valuations: raise a variation (pending) and decide a pending one.
  // Distinct from onAddVariation above, which adds a blank row to the Bill's
  // own editor and saves with the project.
  onRaiseVariation,
  onDecideVariation,
  preliminaryItems = [],
  onUpdatePreliminaryItem,
  onAddPreliminaryItem,
  onRemovePreliminaryItem,
  onNormalizePreliminaryAllocations,
  onSyncPrices,
  onToggleAutoFill,
  onToggleAutoFillBoq,
  onToggleExportOpen,
  onToggleGroupLink,
  onToggleOnlyFillEmpty,
  onToggleOpenPickKey,
  onToggleOpenBoqPickKey,
  onCloseBoqPickKey,
  onToggleShowActualColumns,
  onToggleShowDailyValuationLog,
  onToggleShowValuationSettings,
  onValuationSettingChange,
  clientName = "",
  onClientNameChange,
  onlyFillEmpty = true,
  openPickKey = null,
  openBoqPickKey = null,
  autoFillBoqRates = false,
  autoFillBoqBusy = false,
  canRateGenBoq = false,
  rateSyncEnabled = false,
  onToggleRateSyncEnabled,
  onSyncBoqRates,
  getBoqCandidatesForItem,
  rateGenPoolCount = 0,
  rateGenPoolLoading = false,
  rateGenPoolLoaded = false,
  onReloadRateGenPool,
  publicShareEnabled = false,
  publicToken = null,
  onToggleShare,
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  projectName = "Project",
  rateInfoText = "",
  rates = {},
  remainingAmount = 0,
  saving = false,
  selectedId = "",
  selectedValuation = null,
  selectedValuationDate = "",
  showActualColumns = false,
  showDailyValuationLog = true,
  showMaterials = false,
  // A standalone material & labour schedule (a "-materials" project): its
  // lines ARE its budget, so the Bill view is named Budget and the separate
  // (empty) Budget view is not offered.
  materialsSchedule = false,
  showValuationSettings = true,
  statusLabel = "Completed",
  statusPastLabel = "Completed to date",
  valuationErr = "",
  valuationSettings,
  valuations = [],
  valuedAmount = 0,
  pmDashboard = null,
  pmSaving = false,
  pmImporting = false,
  pmGenerating = false,
  pmImportError = "",
  pmImportErrorCode = "",
  onPmDismissImportError,
  onPmSave,
  onPmGenerateFromBoq,
  onPmImportFile,
  onPmReset,
  onPmClearImports,
  onPmReschedule,
  onPmExportCalendar,
}) {
  const [activeTab, setActiveTab] = React.useState("dashboard");
  const [copiedId, setCopiedId] = React.useState(false);
  const [collabOpen, setCollabOpen] = React.useState(false);
  // null | "project" | "pm" — which report preview is open.
  const [reportOpen, setReportOpen] = React.useState(null);

  // The views sidebar (Dashboard, Bill, Budget, ...). Open by default on a wide
  // screen so nothing moves for anyone used to the tabs; closed by default on a
  // phone, where it opens above the view and closes itself after a pick.
  const [isNarrow, setIsNarrow] = React.useState(isNarrowNow);
  const [viewsOpen, setViewsOpenState] = React.useState(() => {
    if (isNarrowNow()) return false;
    try {
      const saved = window.localStorage.getItem(VIEWS_KEY);
      if (saved === "0") return false;
    } catch {
      // storage blocked: fall back to open
    }
    return true;
  });

  React.useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return undefined;
    const onChange = () => {
      setIsNarrow(mq.matches);
      if (mq.matches) setViewsOpenState(false);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setViewsOpen = (open) => {
    setViewsOpenState(open);
    if (isNarrow) return;
    try {
      window.localStorage.setItem(VIEWS_KEY, open ? "1" : "0");
    } catch {
      // storage blocked: the choice just is not remembered
    }
  };

  // Access flags (server-resolved). canEdit/canExport/canManage gate the action
  // buttons; canSeeRates drives the "rates hidden" notice. The server is the
  // real boundary — these only hide affordances the user isn't allowed to use.
  const canEdit = access?.canEdit !== false;
  const canExport = access?.canExport !== false;
  const canManage = access?.canManage !== false;
  const canSeeRates = access?.canSeeRates !== false;
  const accessRole = access?.role || "owner";
  const isShared = accessRole !== "owner";

  // P0.4, his "continue where you left off": a link from the Work overview
  // carries ?tab= (and &line= for the bill). They are used once, when that
  // project opens, then cleared, so the next project still starts on its
  // Dashboard as before.
  const [params, setParams] = useSearchParams();
  const [focusLine, setFocusLine] = React.useState("");
  const [line, setLine] = React.useState(null);
  React.useEffect(() => {
    const want = params.get("tab") || "";
    const valid = TAB_OPTIONS.some((t) => t.id === want);
    setActiveTab(valid ? want : "dashboard");
    setFocusLine(valid && want === "bill" ? params.get("line") || "" : "");
    setLine(null);
    if (params.has("tab") || params.has("line")) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          next.delete("line");
          return next;
        },
        { replace: true },
      );
    }
    // Only a newly opened project reads the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Remember where this is, for "Pick up where you left off" on Work.
  React.useEffect(() => {
    if (!selectedId || !productKey) return;
    const tab = TAB_OPTIONS.find((t) => t.id === activeTab);
    rememberPlace({
      productKey,
      key: String(selectedId),
      name: projectName,
      tab: activeTab,
      tabLabel: tab?.label || "",
      line: activeTab === "bill" && line ? line.key : "",
      lineLabel: activeTab === "bill" && line ? line.label : "",
    });
  }, [selectedId, productKey, projectName, activeTab, line]);

  // ── One project, one cascade (S18 review, findings A and C) ────────────
  // This screen is handed two money figures and they are not the same thing:
  //
  //   grossAmount     the WHOLE project scope — measured work plus the sums
  //                   plus preliminaries plus approved variations
  //   measuredAmount  the measured work on its own
  //
  // Both the Bill's Summary and the contract panel build the grand summary
  // themselves from a measured base, so handing either of them `grossAmount`
  // counts the sums, the preliminaries and the variations a second time. The
  // contract panel was handed exactly that, which is why every locked contract
  // showed an over-run against its own contract sum and the final account
  // disagreed with the Bill for the same project.
  //
  // The percentages are resolved once, here, with the same fallbacks the Bill
  // uses (and the same ones the server's schema defaults to), so the Overview
  // tile, the Bill's Summary and the final account cannot drift apart.
  const measuredWork =
    measuredAmount == null ? Number(grossAmount) || 0 : Number(measuredAmount) || 0;
  const preliminaryPct = Number.isFinite(Number(contract?.preliminaryPercent))
    ? Number(contract.preliminaryPercent)
    : 7.5;
  const contingencyPct = Number.isFinite(Number(contingencyPercent))
    ? Number(contingencyPercent)
    : 5;
  const taxPct = Number.isFinite(Number(taxPercent)) ? Number(taxPercent) : 7.5;
  const totals = React.useMemo(
    () =>
      projectTotals({
        measured: measuredWork,
        provisionalSums,
        variations,
        preliminaryPercent: preliminaryPct,
        contingencyPercent: contingencyPct,
        taxPercent: taxPct,
        linkedSummaries,
      }),
    [
      measuredWork,
      provisionalSums,
      variations,
      preliminaryPct,
      contingencyPct,
      taxPct,
      linkedSummaries,
    ],
  );

  // The share of the preliminary pool earned by the preliminary items ticked
  // complete, pro-rated by allocation. The server does the same sum.
  const preliminaryEarned = React.useMemo(() => {
    const rows = Array.isArray(preliminaryItems) ? preliminaryItems : [];
    const allocated = rows.reduce((acc, p) => acc + (Number(p?.allocation) || 0), 0);
    const base = allocated > 0 ? allocated : 100;
    return rows.reduce(
      (acc, p) =>
        p?.completed ? acc + (totals.prelims * (Number(p?.allocation) || 0)) / base : acc,
      0,
    );
  }, [preliminaryItems, totals.prelims]);

  // Budget tab is available for every source (QUIV/Revit, Heron/PlanSwift,
  // MEP, CIVIQ). It shows whatever material/labour breakdown the plugin
  // pushed (and an empty-state prompt when none has been pushed yet).
  // HERON (PlanSwift) projects are measured from 2D drawings, not a 3D/IFC
  // model — so the "3D Model" (BIM) tab is always empty and only confuses
  // users. Hide it for planswift (and its materials sibling). QUIV/Revit, MEP
  // and Civil keep it.
  // BoQ-imported projects (Excel import, admin-granted feature) have no BIM
  // model either — hide the 3D Model tab for them too.
  const isBoqImport = projectOrigin === "boq-import";
  const visibleTabs = TAB_OPTIONS.filter(
    (t) =>
      !(
        t.id === "model" &&
        (String(productKey).startsWith("planswift") || isBoqImport)
      ) && !(materialsSchedule && (t.id === "budget" || t.id === "model")),
  ).map((t) =>
    materialsSchedule && t.id === "bill"
      ? { ...t, label: "Budget", helper: "Material & labour lines" }
      : t,
  );

  // Groups in the order the table lists them (Overview, Commercial, Delivery).
  const viewGroups = visibleTabs.reduce(
    (acc, tab) => (acc.includes(tab.group) ? acc : [...acc, tab.group]),
    [],
  );
  const activeView = visibleTabs.find((tab) => tab.id === activeTab) || null;
  // Real counts beside a view, where the page already holds one.
  const viewTail = (id) => {
    const n =
      id === "bill"
        ? (items || []).length
        : id === "valuation"
          ? (valuations || []).length
          : id === "budget"
            ? (budgetItems || []).length
            : 0;
    return n > 0 ? n.toLocaleString() : null;
  };

  function copyProjectId() {
    if (!selectedId || !navigator?.clipboard) return;
    navigator.clipboard
      .writeText(String(selectedId))
      .then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      })
      .catch(() => {});
  }

  const statusHistoryText = showMaterials
    ? "Purchased materials are deducted from the outstanding balance."
    : "Completed items are deducted from the outstanding balance.";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {isShared ? (
        <p className="mk-note" style={{ margin: 0 }}>
          <b>Shared project · {canEdit ? "Full access" : "View only"}</b>
          {!canEdit ? " — You can view this project but can't edit or download it." : ""}
          {!canSeeRates ? (
            <>
              <br />
              <span style={{ color: "var(--pal-orange-key)" }}>
                Rates hidden. A RateGen subscription is required to view rates.
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {/* His .wk-bar. The contract state is his own status text, and its
          margin-right:auto is what pushes every action to the right edge. */}
      <div>
        <div className="wk-bar" style={{ marginBottom: 6 }}>
          <button
            type="button"
            onClick={onBack}
            title="Back to projects"
            className="wk-back"
            style={BARE_BUTTON}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-right" />
            </svg>
            Projects
          </button>

          {contract?.locked ? (
            <span
              className="wk-clean"
              title={`Contract locked${
                contract?.lockedAt
                  ? " on " + new Date(contract.lockedAt).toLocaleDateString()
                  : ""
              }. Qty / description edits are frozen; new items flow to Variations.`}
            >
              Contract locked
            </span>
          ) : (
            <span
              className="wk-dirty"
              title="Contract is editable. Lock it on approval to start tracking variations."
            >
              Draft (editable)
            </span>
          )}

          {/* Project ID stays one click away for the Windows plugin
              "Open from Cloud" flow. */}
          <button
            type="button"
            onClick={copyProjectId}
            title="Copy this project's ID for the Windows plugin 'Open from Cloud' flow"
            className="ds-btn ds-btn-sm btn-o"
          >
            {copiedId ? "✓ Copied" : "Copy project ID"}
          </button>

          {canManage ? (
            <button
              type="button"
              onClick={() => setCollabOpen(true)}
              title="Share this project with colleagues"
              className="ds-btn ds-btn-sm btn-o"
            >
              Collaborators
            </button>
          ) : null}

          {canManage ? (
            <button
              type="button"
              onClick={onDelete}
              title="Delete this project"
              className="ds-btn ds-btn-sm btn-o"
            >
              <FaTrash size={13} /> Delete
            </button>
          ) : null}

          {canExport ? (
            <button
              type="button"
              onClick={() => setReportOpen(activeTab === "pm" ? "pm" : "project")}
              title={
                activeTab === "pm"
                  ? "Preview and download the Project Management (schedule & earned-value) report as PDF"
                  : "Preview and download the Project Progress report as PDF"
              }
              className="ds-btn ds-btn-sm btn-o"
            >
              {activeTab === "pm" ? "PM report" : "Project report"}
            </button>
          ) : null}

          {canExport ? (
            <ExportMenu
              open={exportOpen}
              onToggle={onToggleExportOpen}
              isBoqImport={isBoqImport}
              onExportBillBudget={onExportBillBudget}
              onExportGenericBoQ={onExportGenericBoQ}
              onExportGenericTradeBoQ={onExportGenericTradeBoQ}
              onExportElementalBoQ={onExportElementalBoQ}
            />
          ) : null}

          {canEdit ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || saving}
              title={!isDirty ? "No changes to save" : "Save rates and valuation progress"}
              className={`ds-btn ds-btn-sm ${isDirty && !saving ? "btn-p" : "btn-o"}`}
            >
              {saving ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </button>
          ) : null}
        </div>
        <p className="wk-locnote" style={{ margin: 0 }}>
          {statusHistoryText}
        </p>
      </div>

      {/* The views, in a sidebar built from his app rail: .dsh-grp titles,
          .dsh-nav links with his accent bar and .tail counts, .dsh-rule
          between groups. Hide gives the bill the full width. */}
      <div
        style={{
          display: "grid",
          gap: 18,
          alignItems: "start",
          gridTemplateColumns: viewsOpen && !isNarrow ? "220px minmax(0, 1fr)" : "minmax(0, 1fr)",
        }}
      >
        {viewsOpen ? (
          <nav
            id="project-views"
            className="wk-panel"
            aria-label="Project views"
            style={{
              padding: "4px 14px 14px",
              position: isNarrow ? "static" : "sticky",
              top: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "10px 0 0",
              }}
            >
              <b style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", paddingLeft: 12 }}>
                Views
              </b>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={() => setViewsOpen(false)}
                aria-controls="project-views"
                aria-expanded="true"
                title="Hide the views to give the bill the full width"
              >
                Hide
              </button>
            </div>
            {viewGroups.map((group, gi) => (
              <React.Fragment key={group}>
                {gi > 0 ? <div className="dsh-rule" style={{ margin: "14px 0 0" }} /> : null}
                <p className="dsh-grp" style={{ marginTop: gi > 0 ? 14 : 16 }}>
                  {group}
                </p>
                <ul className="dsh-nav">
                  {visibleTabs
                    .filter((tab) => tab.group === group)
                    .map((tab) => {
                      const active = activeTab === tab.id;
                      const tail = viewTail(tab.id);
                      return (
                        <li key={tab.id}>
                          <a
                            href={`#view-${tab.id}`}
                            className={active ? "on" : undefined}
                            aria-current={active ? "page" : undefined}
                            title={tab.helper}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveTab(tab.id);
                              if (isNarrow) setViewsOpenState(false);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <use href={`#${VIEW_ICONS[tab.id] || "hi-doc"}`} />
                            </svg>
                            {tab.label}
                            {tail ? <span className="tail">{tail}</span> : null}
                          </a>
                        </li>
                      );
                    })}
                </ul>
              </React.Fragment>
            ))}
          </nav>
        ) : null}

        {/* .wk-legacy maps the older markup inside the views (budget, bill,
            contract, PM) onto his tokens; see ds-local.css. */}
        <div
          className="wk-legacy"
          style={{ display: "grid", gap: 18, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}
        >
          {!viewsOpen ? (
            <div className="wk-bar" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={() => setViewsOpen(true)}
                aria-controls="project-views"
                aria-expanded="false"
                title="Show the project views"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
                >
                  <use href="#hi-menu" />
                </svg>
                Views
              </button>
              <span className="wk-locnote">
                {activeView ? `${activeView.label} · ${activeView.helper}` : ""}
              </span>
            </div>
          ) : null}

      {activeTab === "dashboard" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <ShareDashboardButton
              publicShareEnabled={publicShareEnabled}
              publicToken={publicToken}
              onToggleShare={onToggleShare}
            />
          </div>
          <ProjectDashboardSummary
            actualCoverageCount={actualCoverageCount}
            actualCoveragePercent={actualCoveragePercent}
            actualLatestAt={actualLatestAt}
            actualPlannedAmount={actualPlannedAmount}
            actualQtyOverrideCount={actualQtyOverrideCount}
            actualRateOverrideCount={actualRateOverrideCount}
            actualTrackedAmount={actualTrackedAmount}
            actualVarianceAmount={actualVarianceAmount}
            actualVariancePercent={actualVariancePercent}
            chartMode={dashboardChartMode}
            comparisonRows={comparisonRows}
            grossAmount={grossAmount}
            measuredAmount={measuredWork}
            provisionalSums={provisionalSums}
            variations={variations}
            preliminaryPercent={preliminaryPct}
            contingencyPercent={contingencyPct}
            taxPercent={taxPct}
            onChartModeChange={onDashboardChartModeChange}
            progressCount={progressCount}
            progressPercent={progressPercent}
            progressTotal={progressTotal}
            statusLabel={statusLabel}
            statusPastLabel={statusPastLabel}
            valuedAmount={valuedAmount}
            linkedSummaries={linkedSummaries}
          />
          {["revit", "planswift"].includes(String(productKey)) && !isBoqImport && (
            <LinkedProjectsCard
              productKey={productKey}
              projectId={projectId}
              accessToken={accessToken}
              access={access}
              linkedSummaries={linkedSummaries}
              onChange={onLinkedChange}
            />
          )}
          {productKey === "mep" && (
            <ServicesPricingPanel
              productKey={productKey}
              projectId={projectId}
              accessToken={accessToken}
              access={access}
              onChange={onLinkedChange}
            />
          )}
        </>
      ) : null}

      {activeTab === "budget" ? (
        <ProjectBudgetTab
          items={items}
          budgetItems={budgetItems}
          materialItems={materialItems}
          pmDashboard={pmDashboard}
          onSaveBudget={onSaveBudget}
          showMaterials={showMaterials}
          categoryOptions={categoryOptions}
          tradeOptions={tradeOptions}
          groupByMode={groupByMode}
          sourceOptions={sourceOptions}
          onSearchRateGen={onSearchBudgetRates}
          canRateGen={budgetRateGenReady}
          contractLocked={Boolean(contract?.locked)}
          onRebuildSchedule={onRebuildSchedule}
          // S18: the buy schedule's lead time, saved on the project.
          leadDays={valuationSettings?.procurementLeadDays}
          onLeadDaysChange={
            canEdit
              ? (days) => onValuationSettingChange?.("procurementLeadDays", days)
              : null
          }
        />
      ) : null}

      {activeTab === "pm" ? (
        <ProjectManagementTab
          dashboard={pmDashboard}
          saving={pmSaving}
          importing={pmImporting}
          generating={pmGenerating}
          importError={pmImportError}
          importErrorCode={pmImportErrorCode}
          onDismissImportError={onPmDismissImportError}
          onSave={onPmSave}
          onGenerateFromBoq={onPmGenerateFromBoq}
          onImportFile={onPmImportFile}
          onReset={onPmReset}
          onClearImports={onPmClearImports}
          onReschedule={onPmReschedule}
          onExportCalendar={onPmExportCalendar}
        />
      ) : null}

      {activeTab === "valuation" ? (
        <div style={{ display: "grid", gap: 18 }}>
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>Valuation workspace</h2>
              <span className="wk-locnote">
                Control what you see while preparing valuation sheets for this project.
              </span>
            </div>

            {/* Valuation basis: value the job by the bill line, or derive it
                from each line's material & labour breakdown. */}
            <div style={{ padding: "16px 20px 0" }}>
              <div className="wk-grp" style={{ padding: "0 0 8px" }}>
                Valuation basis
              </div>
              <div className="wk-loc-sw" role="group" aria-label="Valuation basis">
                {[
                  { id: "boq", label: "By Bill of Quantity" },
                  { id: "budget", label: "By Budget (Material & Labour)" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={(valuationSettings?.basis || "boq") === opt.id ? "on" : ""}
                    onClick={() => onValuationSettingChange?.("basis", opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="wk-note">
              {(valuationSettings?.basis || "boq") === "budget"
                ? "Each bill line is valued from its material & labour breakdown, mark procurement on the Budget tab. Save to apply."
                : "Each bill line is valued by its own % complete on the Bill of Quantity tab."}
            </p>

            <div className="wk-pf" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 18 }}>
              <label className="wk-fx" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={showDailyValuationLog}
                  onChange={(e) => onToggleShowDailyValuationLog?.(e.target.checked)}
                />
                Show daily valuation log
              </label>
              <label className="wk-fx" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={showValuationSettings}
                  onChange={(e) => onToggleShowValuationSettings?.(e.target.checked)}
                />
                Show valuation settings
              </label>
            </div>
          </section>

          <ProjectValuationSummary
            projectName={projectName}
            grossAmount={grossAmount}
            valuedAmount={valuedAmount}
            remainingAmount={remainingAmount}
            statusLabel={statusLabel}
            valuations={valuations}
            selectedValuation={selectedValuation}
            selectedValuationDate={selectedValuationDate}
            onSelectValuationDate={onSelectValuationDate}
            loadingValuations={loadingValuations}
            valuationErr={valuationErr}
            valuationSettings={valuationSettings}
            onValuationSettingChange={onValuationSettingChange}
            clientName={clientName}
            onClientNameChange={onClientNameChange}
            showDailyValuationLog={showDailyValuationLog}
            showValuationSettings={showValuationSettings}
            progressPercent={progressPercent}
            progressCount={progressCount}
            progressTotal={progressTotal}
          />

          {/* S18 valuations: contract administration lives here now, as one
              switch — Certificates, Variations, Final account (and our BIM
              models view, which his design drops but we keep reachable). */}
          <ProjectContractPanel
          certificates={certificates}
          certBusy={certBusy}
          onIssueCertificate={onIssueCertificate}
          onUpdateCertificate={onUpdateCertificate}
          onDeleteCertificate={onDeleteCertificate}
          onDownloadCertificate={onDownloadCertificate}
          finalAccount={finalAccount}
          onFinalizeAccount={onFinalizeAccount}
          onReopenFinalAccount={onReopenFinalAccount}
          onDownloadFinalAccount={onDownloadFinalAccount}
          projectModels={projectModels}
          modelUploadBusy={modelUploadBusy}
          onUploadModel={onUploadModel}
          onDeleteModel={onDeleteModel}
          items={items}
          productKey={productKey}
          hideModels={isBoqImport}
          contractLocked={Boolean(contract?.locked)}
          contractSum={Number(contract?.contractSum) || 0}
          // S18 review (finding A): the MEASURED WORK, not the whole project
          // scope. The panel adds the sums, the preliminaries, the contingency
          // and the VAT to whatever it is given here, so `grossAmount` — which
          // already contains the sums, the preliminaries and the variations —
          // produced a fabricated figure on every locked contract. These five
          // now come off the same cascade the Bill's Summary shows.
          measured={totals.measured}
          provisional={totals.sums}
          preliminary={totals.prelims}
          // The panel labels this "Approved variations" and the final account
          // settles on it, so it is the approved net — summing every row would
          // settle a variation nobody has approved. A row with no status is
          // approved, so no existing project's figure moves.
          variations={totals.variations}
          contingency={totals.contingency}
          tax={totals.tax}
          contingencyPercent={contingencyPct}
          taxPercent={taxPct}
          // Actual spent — measured-valued + executed PC + completed
          // prelims + executed variations. Drives the over-run vs
          // planned comparison so the final-account figure reflects
          // real spend, not BoQ drift. A variation counts here only when it
          // is BOTH approved and executed, which is the server's rule too
          // (approvedVariationsEarned in util/variationStatus.js).
          actualSpent={
            (valuedAmount || 0) +
            (provisionalSums || []).reduce(
              (acc, s) =>
                s?.completed ? acc + (Number(s?.amount) || 0) : acc,
              0,
            ) +
            approvedVariationsEarned(variations) +
            preliminaryEarned
          }
          // S18 valuations: the variation rows, and who may act on them.
          variationRows={variations}
          onRaiseVariation={onRaiseVariation}
          onDecideVariation={onDecideVariation}
          canEditProject={canEdit}
          canSeeRates={canSeeRates}
        />
        </div>
      ) : null}

      {activeTab === "work" ? (
        <React.Suspense fallback={<div className="wk-empty">Loading the work area…</div>}>
          <WorkAreaView
            projectName={projectName}
            productKey={productKey}
            projectId={projectId}
            accessToken={accessToken}
            items={items}
            rows={computedShown}
            projectModels={projectModels}
            materialItems={materialItems}
            budgetItems={budgetItems}
            pmDashboard={pmDashboard}
            canSeeRates={canSeeRates}
          />
        </React.Suspense>
      ) : null}

      {activeTab === "model" ? (
        <React.Suspense
          fallback={<div className="wk-empty">Loading 3D viewer…</div>}
        >
          <ModelViewer
            projectModels={projectModels}
            items={items}
            materialItems={materialItems}
            productKey={productKey}
            projectId={projectId}
            accessToken={accessToken}
          />
        </React.Suspense>
      ) : null}

      {activeTab === "bill" && mergeInfo?.parts?.length > 1 ? (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>
              {mergeInfo.partType === "building"
                ? "Buildings in this job"
                : "Disciplines in this project"}
            </h2>
            {mergeReorderBusy ? (
              <span className="wk-dirty" style={{ marginRight: 0 }}>
                Saving order…
              </span>
            ) : null}
          </div>
          <p className="wk-note">
            {mergeInfo.partType === "building"
              ? "This order is the order the buildings appear as sheets in the exported bill, put Main Building first and External Works last."
              : "This order is the order the disciplines appear in the combined bill."}
          </p>
          <div className="wk-use">
            {mergeInfo.parts.map((part, i) => (
              <div
                key={part.projectId}
                className="wk-useline"
                style={mergeReorderBusy ? { opacity: 0.6 } : undefined}
              >
                <span className="p">
                  {i + 1}. {part.name}
                  <em>
                    {part.itemCount} item{part.itemCount === 1 ? "" : "s"}
                  </em>
                </span>
                <span className="q" />
                <span className="v" style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm btn-o"
                    disabled={i === 0 || !onReorderMergeParts || mergeReorderBusy}
                    title="Move up"
                    aria-label={`Move ${part.name} up`}
                    onClick={() => onReorderMergeParts?.(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm btn-o"
                    disabled={
                      i === mergeInfo.parts.length - 1 ||
                      !onReorderMergeParts ||
                      mergeReorderBusy
                    }
                    title="Move down"
                    aria-label={`Move ${part.name} down`}
                    onClick={() => onReorderMergeParts?.(i, i + 1)}
                  >
                    ↓
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "bill" ? (
        <ProjectBillTable
          focusLine={focusLine}
          onLine={(key, label) => setLine((cur) => (cur?.key === key ? cur : { key, label }))}
          actualQtyInputs={actualQtyInputs}
          actualRateInputs={actualRateInputs}
          actualTrackedAmount={actualTrackedAmount}
          autoFillBusy={autoFillBusy}
          autoFillMaterialsRates={autoFillMaterialsRates}
          canRateGen={canRateGen}
          checkboxCls={checkboxCls}
          computedShown={computedShown}
          getCandidatesForItem={getCandidatesForItem}
          pmDashboard={pmDashboard}
          grossAmount={grossAmount}
          isGroupLinked={isGroupLinked}
          itemQuery={itemQuery}
          items={items}
          onDeleteItem={onDeleteItem}
          onMoveItem={onMoveItem}
          linkedGroupsCount={linkedGroupsCount}
          onActualQtyChange={onActualQtyChange}
          onActualRateChange={onActualRateChange}
          onClearItemQuery={onClearItemQuery}
          onClosePickKey={onClosePickKey}
          onItemQueryChange={onItemQueryChange}
          onPickCandidate={onPickCandidate}
          onRateChange={onRateChange}
          onSearchRateGen={onSearchRateGen}
          onStatusToggle={onStatusToggle}
          percentMap={percentMap}
          onPercentChange={onPercentChange}
          onCategoryChange={onCategoryChange}
          categoryOptions={categoryOptions}
          onAddCategory={onAddCategory}
          onAddTrade={onAddTrade}
          budgetDrivenCodes={budgetDrivenCodes}
          tradeOptions={tradeOptions}
          onTradeChange={onTradeChange}
          groupByMode={groupByMode}
          sourceOptions={sourceOptions}
          onGroupByModeChange={onGroupByModeChange}
          contractLocked={Boolean(contract?.locked)}
          contractLockedAt={contract?.lockedAt || null}
          contractApprovedAt={contract?.approvedAt || null}
          contractSum={contract?.contractSum || 0}
          preliminaryPercent={preliminaryPct}
          contingencyPercent={contingencyPct}
          taxPercent={taxPct}
          onContingencyPercentChange={onContingencyPercentChange}
          onTaxPercentChange={onTaxPercentChange}
          measuredAmount={measuredWork}
          tenderedAt={contract?.tenderedAt || null}
          onMarkTendered={onMarkTendered}
          onRestoreProvisionalSum={onRestoreProvisionalSum}
          onOpenVariations={() => setActiveTab("valuation")}
          contractBusy={contractBusy}
          stepUpEnabled={stepUpEnabled}
          onLockContract={onLockContract}
          onUnlockContract={onUnlockContract}
          onPreliminaryPercentChange={onPreliminaryPercentChange}
          provisionalSums={provisionalSums}
          onAddProvisionalSum={onAddProvisionalSum}
          onUpdateProvisionalSum={onUpdateProvisionalSum}
          onRemoveProvisionalSum={onRemoveProvisionalSum}
          variations={variations}
          onAddVariation={onAddVariation}
          onUpdateVariation={onUpdateVariation}
          onRemoveVariation={onRemoveVariation}
          preliminaryItems={preliminaryItems}
          onUpdatePreliminaryItem={onUpdatePreliminaryItem}
          onAddPreliminaryItem={onAddPreliminaryItem}
          onRemovePreliminaryItem={onRemovePreliminaryItem}
          onNormalizePreliminaryAllocations={onNormalizePreliminaryAllocations}
          onSyncPrices={onSyncPrices}
          onSyncBoqRates={onSyncBoqRates}
          onToggleAutoFill={onToggleAutoFill}
          onToggleAutoFillBoq={onToggleAutoFillBoq}
          onToggleGroupLink={onToggleGroupLink}
          onToggleOnlyFillEmpty={onToggleOnlyFillEmpty}
          onToggleOpenPickKey={onToggleOpenPickKey}
          onToggleOpenBoqPickKey={onToggleOpenBoqPickKey}
          onCloseBoqPickKey={onCloseBoqPickKey}
          onToggleShowActualColumns={onToggleShowActualColumns}
          onToggleRateSyncEnabled={onToggleRateSyncEnabled}
          onlyFillEmpty={onlyFillEmpty}
          openPickKey={openPickKey}
          openBoqPickKey={openBoqPickKey}
          onPickBoqCandidate={onPickBoqCandidate}
          rateInfoText={rateInfoText}
          rates={rates}
          showActualColumns={showActualColumns}
          showMaterials={showMaterials}
          statusLabel={statusLabel}
          canRateGenBoq={canRateGenBoq}
          autoFillBoqRates={autoFillBoqRates}
          autoFillBoqBusy={autoFillBoqBusy}
          rateSyncEnabled={rateSyncEnabled}
          getBoqCandidatesForItem={getBoqCandidatesForItem}
          rateGenPoolCount={rateGenPoolCount}
          rateGenPoolLoading={rateGenPoolLoading}
          rateGenPoolLoaded={rateGenPoolLoaded}
          onReloadRateGenPool={onReloadRateGenPool}
          canSeeRates={canSeeRates}
          readOnly={!canEdit}
          linkedSummaries={linkedSummaries}
          onRemoveCategory={onRemoveCategory}
        />
      ) : null}

        </div>
      </div>

      {canManage ? (
        <CollaboratorsModal
          open={collabOpen}
          onClose={() => setCollabOpen(false)}
          tool={productKey}
          projectId={projectId || selectedId}
          accessToken={accessToken}
        />
      ) : null}

      {reportOpen ? (
        <React.Suspense fallback={null}>
          <ReportModal
            open
            onClose={() => setReportOpen(null)}
            type={reportOpen}
            productKey={productKey}
            projectId={projectId || selectedId}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}
