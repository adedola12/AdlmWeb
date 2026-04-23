import React from "react";
import { FaArrowLeft, FaTrash, FaShareAlt, FaCopy, FaCheck } from "react-icons/fa";
import ProjectBillTable from "./ProjectBillTable.jsx";
import ProjectContractPanel from "./ProjectContractPanel.jsx";
import ProjectDashboardSummary from "./ProjectDashboardSummary.jsx";
import ProjectValuationSummary from "./ProjectValuationSummary.jsx";

function ShareDashboardButton({ publicShareEnabled, publicToken, onToggleShare }) {
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
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <FaShareAlt className={publicShareEnabled ? "text-adlm-blue-700" : "text-slate-400"} />
        {publicShareEnabled ? "Shared" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-white p-4 shadow-xl">
          <div className="text-sm font-semibold text-slate-900 mb-2">Share Dashboard</div>
          <p className="text-xs text-slate-500 mb-3">
            Generate a public link so clients can view the project dashboard (progress & cost summary only).
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
              <div className="flex items-center gap-1 rounded-lg border bg-slate-50 px-2 py-1.5">
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
                  {copied ? <><FaCheck /> Copied</> : <><FaCopy /> Copy</>}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Anyone with this link can view the dashboard summary and chart (no editing, no item details).
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

const TAB_OPTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    helper: "Overview and progress",
  },
  {
    id: "valuation",
    label: "Valuation",
    helper: "Certificates and settings",
  },
  {
    id: "bill",
    label: "Bill of Quantity",
    helper: "Rates and line items",
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
  linkedGroupsCount = 0,
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
  onCategoryChange,
  categoryOptions = [],
  tradeOptions = [],
  onTradeChange,
  groupByMode = "category",
  onGroupByModeChange,
  contract,
  contractBusy = false,
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
}) {
  const [activeTab, setActiveTab] = React.useState("dashboard");

  React.useEffect(() => {
    setActiveTab("dashboard");
  }, [selectedId]);

  const statusHistoryText = showMaterials
    ? "Purchased materials are deducted from the outstanding balance."
    : "Completed items are deducted from the outstanding balance.";

  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-sm" onClick={onBack} title="Back to projects">
              <span className="inline-flex items-center gap-2">
                <FaArrowLeft /> Back to projects
              </span>
            </button>

            <button className="btn btn-sm" onClick={onDelete} title="Delete this project">
              <span className="inline-flex items-center gap-2 text-orange-700">
                <FaTrash className="text-[13px]" /> Delete
              </span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-slate-900">{projectName}</div>
              {contract?.locked ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
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
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                  title="Contract is editable. Lock it on approval to start tracking variations."
                >
                  ✎ Draft (editable)
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Project ID: <code>{selectedId}</code>
            </div>
            <div className="mt-1 text-xs text-slate-500">{statusHistoryText}</div>
            <div className="mt-1 text-xs text-slate-500">
              You can still use this Project ID in the Windows plugin Open from Cloud flow.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className={`btn btn-sm ${isDirty ? "btn-primary" : ""}`}
            onClick={onSave}
            disabled={!isDirty || saving}
            title={!isDirty ? "No changes to save" : "Save rates and valuation progress"}
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <div className="relative">
            <button className="btn btn-sm" onClick={onToggleExportOpen} type="button">
              Export
            </button>

            {exportOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border bg-white shadow-lg">
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
                  onClick={() => onExportElementalBoQ?.("bungalow", undefined, "elemental")}
                  title="Single-storey building format"
                >
                  Bungalow
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => onExportElementalBoQ?.("multistorey", undefined, "elemental")}
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
                  onClick={() => onExportElementalBoQ?.("bungalow", undefined, "trade")}
                  title="Concrete, formwork, reinforcement, masonry, finishes, painting, plumbing, electrical and HVAC each get their own bill"
                >
                  Bungalow (Trade format)
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => onExportElementalBoQ?.("multistorey", undefined, "trade")}
                  title="Multi-storey trade-format BoQ"
                >
                  Multi-storey (Trade format)
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {TAB_OPTIONS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "min-w-[170px] flex-1 rounded-lg px-4 py-3 text-left transition",
                  active
                    ? "bg-adlm-blue-700 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">{tab.label}</div>
                <div className={`mt-1 text-xs ${active ? "text-blue-100" : "text-slate-500"}`}>
                  {tab.helper}
                </div>
              </button>
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
        </>
      ) : null}

      {activeTab === "valuation" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-medium text-slate-900">Valuation workspace</div>
            <div className="mt-1 text-sm text-slate-600">
              Control what you want to see while preparing valuation sheets for this project.
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showDailyValuationLog}
                  onChange={(e) => onToggleShowDailyValuationLog?.(e.target.checked)}
                  className={checkboxCls}
                />
                Show daily valuation log
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showValuationSettings}
                  onChange={(e) => onToggleShowValuationSettings?.(e.target.checked)}
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
          contractLocked={Boolean(contract?.locked)}
          contractSum={Number(contract?.contractSum) || 0}
          measured={grossAmount}
          provisional={(provisionalSums || []).reduce(
            (acc, s) => acc + (Number(s?.amount) || 0),
            0,
          )}
          preliminary={
            (grossAmount +
              (provisionalSums || []).reduce(
                (acc, s) => acc + (Number(s?.amount) || 0),
                0,
              )) *
            (Number(contract?.preliminaryPercent) || 0) /
            100
          }
          variations={(variations || []).reduce(
            (acc, v) => acc + Number(v?.qty || 0) * Number(v?.rate || 0),
            0,
          )}
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
          onCategoryChange={onCategoryChange}
          categoryOptions={categoryOptions}
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
        />
      ) : null}
    </div>
  );
}