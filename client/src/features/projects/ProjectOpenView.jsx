import React from "react";
import {
  FaArrowLeft,
  FaTrash,
  FaShareAlt,
  FaCopy,
  FaCheck,
  FaSave,
  FaDownload,
  FaChartPie,
  FaFileInvoiceDollar,
  FaCube,
  FaProjectDiagram,
  FaFileContract,
  FaWallet,
  FaUserFriends,
  FaEye,
  FaLock,
} from "react-icons/fa";
import ProjectBillTable from "./ProjectBillTable.jsx";
import ProjectBudgetTab from "./ProjectBudgetTab.jsx";
import ProjectContractPanel from "./ProjectContractPanel.jsx";
import ProjectDashboardSummary from "./ProjectDashboardSummary.jsx";
import LinkedProjectsCard from "./LinkedProjectsCard.jsx";
import ServicesPricingPanel from "./ServicesPricingPanel.jsx";
import ProjectManagementTab from "./ProjectManagementTab.jsx";
import ProjectValuationSummary from "./ProjectValuationSummary.jsx";
import CollaboratorsModal from "./CollaboratorsModal.jsx";

// Lazy — pulls in three.js + the web-ifc wasm; only loads when the 3D tab opens.
const ModelViewer = React.lazy(() => import("./ModelViewer.jsx"));

function ShareDashboardButton({
  publicShareEnabled,
  publicToken,
  onToggleShare,
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

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
    <div className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <FaShareAlt
          className={
            publicShareEnabled ? "text-adlm-blue-700" : "text-slate-400"
          }
        />
        {publicShareEnabled ? "Shared" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="text-sm font-semibold text-slate-900 mb-2">
            Share Dashboard
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Generate a public link so clients can view the project dashboard
            (progress & cost summary only).
          </p>

          <label className="flex items-center gap-2 text-xs text-slate-700 mb-3">
            <input
              type="checkbox"
              checked={publicShareEnabled}
              disabled={busy}
              onChange={(e) => handleToggle(e.target.checked)}
              className="rounded"
            />
            {busy ? "Updating..." : "Enable public link"}
          </label>

          {publicShareEnabled && shareUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-xs text-slate-700 outline-none truncate"
                />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-adlm-blue-700 hover:bg-blue-50"
                >
                  {copied ? (
                    <>
                      <FaCheck /> Copied
                    </>
                  ) : (
                    <>
                      <FaCopy /> Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Anyone with this link can view the dashboard summary and chart
                (no editing, no item details).
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
    icon: FaChartPie,
    group: "Overview",
  },
  {
    id: "bill",
    label: "Bill of Quantity",
    helper: "Rates and line items",
    icon: FaFileInvoiceDollar,
    group: "Commercial",
  },
  {
    id: "budget",
    label: "Budget",
    helper: "Cost plan & procurement",
    icon: FaWallet,
    group: "Commercial",
  },
  {
    id: "valuation",
    label: "Valuation",
    helper: "Certificates and settings",
    icon: FaFileContract,
    group: "Commercial",
  },
  {
    id: "model",
    label: "3D Model",
    helper: "View & verify the BIM model",
    icon: FaCube,
    group: "Delivery",
  },
  {
    id: "pm",
    label: "PM Dashboard",
    helper: "Schedule, EVM, risks, issues",
    icon: FaProjectDiagram,
    group: "Delivery",
  },
];

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
  productKey = "",
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
  onAddTrade,
  groupByMode = "category",
  onGroupByModeChange,
  contract,
  contractBusy = false,
  stepUpEnabled = false,
  onLockContract,
  onUnlockContract,
  onPreliminaryPercentChange,
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

  // Access flags (server-resolved). canEdit/canExport/canManage gate the action
  // buttons; canSeeRates drives the "rates hidden" notice. The server is the
  // real boundary — these only hide affordances the user isn't allowed to use.
  const canEdit = access?.canEdit !== false;
  const canExport = access?.canExport !== false;
  const canManage = access?.canManage !== false;
  const canSeeRates = access?.canSeeRates !== false;
  const accessRole = access?.role || "owner";
  const isShared = accessRole !== "owner";

  React.useEffect(() => {
    setActiveTab("dashboard");
  }, [selectedId]);

  // Budget tab is available for every source (QUIV/Revit, Heron/PlanSwift,
  // MEP, CIVIQ). It shows whatever material/labour breakdown the plugin
  // pushed (and an empty-state prompt when none has been pushed yet).
  const visibleTabs = TAB_OPTIONS;

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
    <div className="mt-5 space-y-5">
      {isShared ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-adlm-blue-200 bg-blue-50 px-4 py-2.5 text-xs dark:border-adlm-blue-600/30 dark:bg-adlm-blue-600/10">
          <span className="inline-flex items-center gap-1.5 font-semibold text-adlm-blue-700 dark:text-adlm-blue-300">
            {canEdit ? <FaUserFriends /> : <FaEye />}
            Shared project · {canEdit ? "Full access" : "View only"}
          </span>
          {!canEdit ? (
            <span className="text-slate-500 dark:text-adlm-dark-muted">
              You can view this project but can't edit or download it.
            </span>
          ) : null}
          {!canSeeRates ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <FaLock /> Rates hidden — a RateGen subscription is required to view
              rates.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              title="Back to projects"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text"
            >
              <FaArrowLeft className="text-[12px]" /> Back to projects
            </button>

            {canManage ? (
              <button
                type="button"
                onClick={onDelete}
                title="Delete this project"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-orange-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-orange-300 dark:hover:bg-orange-500/10"
              >
                <FaTrash className="text-[12px]" /> Delete
              </button>
            ) : null}

            {canManage ? (
              <button
                type="button"
                onClick={() => setCollabOpen(true)}
                title="Share this project with colleagues"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-adlm-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-blue-300 dark:hover:bg-adlm-blue-600/10"
              >
                <FaUserFriends className="text-[12px]" /> Collaborators
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contract?.locked ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                title={`Contract locked${
                  contract?.lockedAt
                    ? " on " + new Date(contract.lockedAt).toLocaleDateString()
                    : ""
                }. Qty / description edits are frozen; new items flow to Variations.`}
              >
                🔒 Contract locked
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                title="Contract is editable. Lock it on approval to start tracking variations."
              >
                ✎ Draft (editable)
              </span>
            )}
            <span className="text-xs text-slate-500 dark:text-adlm-dark-muted">
              {statusHistoryText}
            </span>
            {/* Project ID is hidden to keep the header clean, but stays
                one click away for the Windows plugin "Open from Cloud" flow. */}
            <button
              type="button"
              onClick={copyProjectId}
              title="Copy this project's ID for the Windows plugin 'Open from Cloud' flow"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-muted"
            >
              {copiedId ? (
                <>
                  <FaCheck className="text-[11px] text-emerald-600" /> Copied
                </>
              ) : (
                <>
                  <FaCopy className="text-[11px]" /> Copy project ID
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || saving}
              title={
                !isDirty
                  ? "No changes to save"
                  : "Save rates and valuation progress"
              }
              className={[
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
                isDirty && !saving
                  ? "btn-3d text-white"
                  : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-adlm-dark-dim",
              ].join(" ")}
            >
              <FaSave className="text-[12px]" />
              {saving ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </button>
          ) : null}

          {canExport ? (
            <div className="relative">
              <button
                type="button"
                onClick={onToggleExportOpen}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-depth active:translate-y-0 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text"
              >
                <FaDownload className="text-[12px]" /> Export
              </button>

              {exportOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={onExportGenericBoQ}
                  title="Category-grouped workbook (Substructure / Superstructure / HVAC / Plumbing / Electrical)"
                >
                  Export generic BoQ (by category)
                </button>
                {onExportGenericTradeBoQ ? (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={onExportGenericTradeBoQ}
                    title="Group the same items by trade (Concrete, Formwork, Reinforcement, Masonry, Finishes, etc.)"
                  >
                    Export generic BoQ (by trade)
                  </button>
                ) : null}

                <div className="border-t bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Elemental BoQ
                  <span className="ml-1 font-normal normal-case text-[9px] text-slate-400">
                    — grouped by building element
                  </span>
                </div>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    onExportElementalBoQ?.("bungalow", undefined, "elemental")
                  }
                  title="Single-storey building format"
                >
                  Bungalow
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    onExportElementalBoQ?.(
                      "multistorey",
                      undefined,
                      "elemental",
                    )
                  }
                  title="Multi-storey building"
                >
                  Multi-storey
                </button>

                <div className="border-t bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Trade BoQ
                  <span className="ml-1 font-normal normal-case text-[9px] text-slate-400">
                    — grouped by work section (NRM2-style)
                  </span>
                </div>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    onExportElementalBoQ?.("bungalow", undefined, "trade")
                  }
                  title="Concrete, formwork, reinforcement, masonry, finishes, painting, plumbing, electrical and HVAC each get their own bill"
                >
                  Bungalow (Trade format)
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    onExportElementalBoQ?.("multistorey", undefined, "trade")
                  }
                  title="Multi-storey trade-format BoQ"
                >
                  Multi-storey (Trade format)
                </button>
              </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-depth dark:border-adlm-dark-border">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {visibleTabs.map((tab, i) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            const prev = visibleTabs[i - 1];
            const newGroup = i > 0 && prev && prev.group !== tab.group;
            return (
              <React.Fragment key={tab.id}>
                {/* Hairline divider marks a new group (Overview · Commercial · Delivery) */}
                {newGroup ? (
                  <div
                    aria-hidden="true"
                    className="mx-1 hidden w-px self-stretch bg-gradient-to-b from-transparent via-slate-200 to-transparent sm:block dark:via-adlm-dark-border"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? "page" : undefined}
                  title={`${tab.group} · ${tab.label}`}
                  className={[
                    "group relative min-w-[140px] flex-1 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                    active
                      ? "-translate-y-0.5 bg-gradient-to-br from-adlm-blue-700 to-adlm-blue-600 text-white shadow-glow-blue"
                      : "text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50 dark:text-adlm-dark-text dark:hover:bg-white/5",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={[
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition",
                        active
                          ? "bg-white/15 text-white ring-1 ring-white/25"
                          : "bg-slate-100 text-adlm-blue-700 group-hover:bg-blue-50 dark:bg-white/10 dark:text-adlm-blue-300",
                      ].join(" ")}
                    >
                      <Icon className="text-sm" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">
                        {tab.label}
                      </div>
                      <div
                        className={`mt-0.5 hidden truncate text-[11px] leading-tight sm:block ${
                          active ? "text-blue-100" : "text-slate-500 dark:text-adlm-dark-muted"
                        }`}
                      >
                        {tab.helper}
                      </div>
                    </div>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <>
          {/* Share Dashboard Button */}
          <div className="flex items-center justify-end gap-2 mb-3">
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
            onChartModeChange={onDashboardChartModeChange}
            progressCount={progressCount}
            progressPercent={progressPercent}
            progressTotal={progressTotal}
            remainingAmount={remainingAmount}
            statusLabel={statusLabel}
            statusPastLabel={statusPastLabel}
            valuedAmount={valuedAmount}
          />
          {!String(productKey).endsWith("-materials") && (
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
          onSearchRateGen={onSearchBudgetRates}
          canRateGen={budgetRateGenReady}
          contractLocked={Boolean(contract?.locked)}
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
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-depth">
            <div className="font-medium text-slate-900">
              Valuation workspace
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Control what you want to see while preparing valuation sheets for
              this project.
            </div>

            {/* Valuation basis — value the job by the bill line, or derive
                it from each line's material & labour breakdown. */}
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Valuation basis
              </div>
              <div className="mt-1.5 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-adlm-dark-border dark:bg-white/5">
                {[
                  { id: "boq", label: "By Bill of Quantity" },
                  { id: "budget", label: "By Budget (Material & Labour)" },
                ].map((opt) => {
                  const active =
                    (valuationSettings?.basis || "boq") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onValuationSettingChange?.("basis", opt.id)}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "bg-white text-adlm-blue-700 shadow-sm dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                          : "text-slate-600 hover:text-slate-900 dark:text-adlm-dark-muted dark:hover:text-white",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                {(valuationSettings?.basis || "boq") === "budget"
                  ? "Each bill line is valued from its material & labour breakdown — mark procurement on the Budget tab. Save to apply."
                  : "Each bill line is valued by its own % complete on the Bill of Quantity tab."}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showDailyValuationLog}
                  onChange={(e) =>
                    onToggleShowDailyValuationLog?.(e.target.checked)
                  }
                  className={checkboxCls}
                />
                Show daily valuation log
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showValuationSettings}
                  onChange={(e) =>
                    onToggleShowValuationSettings?.(e.target.checked)
                  }
                  className={checkboxCls}
                />
                Show valuation settings
              </label>
            </div>
          </div>

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
            showDailyValuationLog={showDailyValuationLog}
            showValuationSettings={showValuationSettings}
            progressPercent={progressPercent}
            progressCount={progressCount}
            progressTotal={progressTotal}
          />
        </div>
      ) : null}

      {activeTab === "model" ? (
        <React.Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-depth">
              Loading 3D viewer…
            </div>
          }
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

      {activeTab === "bill" ? (
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
          contractLocked={Boolean(contract?.locked)}
          contractSum={Number(contract?.contractSum) || 0}
          measured={grossAmount}
          provisional={(provisionalSums || []).reduce(
            (acc, s) => acc + (Number(s?.amount) || 0),
            0,
          )}
          preliminary={
            ((grossAmount +
              (provisionalSums || []).reduce(
                (acc, s) => acc + (Number(s?.amount) || 0),
                0,
              )) *
              (Number(contract?.preliminaryPercent) || 0)) /
            100
          }
          variations={(variations || []).reduce(
            (acc, v) => acc + Number(v?.qty || 0) * Number(v?.rate || 0),
            0,
          )}
          // Contingency / Tax — full QS cascade. Inline calc mirrors
          // the BoQ Project Total card so the Final Account stays in
          // sync without re-fetching from the server.
          contingency={(() => {
            const grsp = (provisionalSums || []).reduce(
              (a, s) => a + (Number(s?.amount) || 0),
              0,
            );
            const prelim =
              ((grossAmount + grsp) *
                (Number(contract?.preliminaryPercent) || 0)) /
              100;
            const sub = grossAmount + grsp + prelim;
            return (sub * (Number(contract?.contingencyPercent) || 0)) / 100;
          })()}
          tax={(() => {
            const grsp = (provisionalSums || []).reduce(
              (a, s) => a + (Number(s?.amount) || 0),
              0,
            );
            const prelim =
              ((grossAmount + grsp) *
                (Number(contract?.preliminaryPercent) || 0)) /
              100;
            const sub = grossAmount + grsp + prelim;
            const cont =
              (sub * (Number(contract?.contingencyPercent) || 0)) / 100;
            return (
              ((sub + cont) * (Number(contract?.taxPercent) || 0)) / 100
            );
          })()}
          contingencyPercent={Number(contract?.contingencyPercent) || 0}
          taxPercent={Number(contract?.taxPercent) || 0}
          // Actual spent — measured-valued + executed PC + completed
          // prelims + executed variations. Drives the over-run vs
          // planned comparison so the final-account figure reflects
          // real spend, not BoQ drift.
          actualSpent={
            (valuedAmount || 0) +
            (provisionalSums || []).reduce(
              (acc, s) =>
                s?.completed ? acc + (Number(s?.amount) || 0) : acc,
              0,
            ) +
            (variations || []).reduce(
              (acc, v) =>
                v?.completed
                  ? acc + Number(v?.qty || 0) * Number(v?.rate || 0)
                  : acc,
              0,
            ) +
            (() => {
              const items = preliminaryItems || [];
              const totalAlloc = items.reduce(
                (a, p) => a + Number(p?.allocation || 0),
                0,
              );
              const base = totalAlloc > 0 ? totalAlloc : 100;
              const grsp = (provisionalSums || []).reduce(
                (a, s) => a + (Number(s?.amount) || 0),
                0,
              );
              const pool =
                ((grossAmount + grsp) *
                  (Number(contract?.preliminaryPercent) || 0)) /
                100;
              return items.reduce(
                (a, p) =>
                  p?.completed
                    ? a + (pool * Number(p?.allocation || 0)) / base
                    : a,
                0,
              );
            })()
          }
        />
      ) : null}

      {activeTab === "bill" ? (
        <ProjectBillTable
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
          onGroupByModeChange={onGroupByModeChange}
          contractLocked={Boolean(contract?.locked)}
          contractLockedAt={contract?.lockedAt || null}
          contractApprovedAt={contract?.approvedAt || null}
          contractSum={contract?.contractSum || 0}
          preliminaryPercent={
            Number.isFinite(Number(contract?.preliminaryPercent))
              ? Number(contract.preliminaryPercent)
              : 7.5
          }
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
          remainingAmount={remainingAmount}
          showActualColumns={showActualColumns}
          showMaterials={showMaterials}
          statusLabel={statusLabel}
          valuedAmount={valuedAmount}
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
        />
      ) : null}

      {canManage ? (
        <CollaboratorsModal
          open={collabOpen}
          onClose={() => setCollabOpen(false)}
          tool={productKey}
          projectId={projectId || selectedId}
          accessToken={accessToken}
        />
      ) : null}
    </div>
  );
}
