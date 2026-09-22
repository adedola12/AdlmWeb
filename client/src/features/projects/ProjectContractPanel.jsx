import React from "react";
import { FaCube, FaDownload, FaFileInvoiceDollar, FaPlus, FaTrashAlt, FaUpload } from "../../components/icons.jsx";
import { deriveItemDiscipline } from "../../lib/boqCategory.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return safeNum(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString();
}

function bytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// A button in his .wk-tabs. The count rides after the label in his muted ink.
function SubTab({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={active ? "on" : ""}
    >
      {label}
      {typeof count === "number" && count > 0 ? (
        <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{count}</span>
      ) : null}
    </button>
  );
}

// His palettes for chips and tones.
function tone(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
const NO_MB = { marginBottom: 0 };
const STACK = { display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" };
const NOTE_WARN = { background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)" };
const ICON_BTN = { padding: "4px 8px" };

// A section head inside the panel: his group title and a note, actions right.
function SectionHead({ title, sub, children }) {
  return (
    <div
      className="wk-bar"
      style={{ marginBottom: 0, justifyContent: "space-between", alignItems: "flex-start" }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
          {title}
        </p>
        <div className="wk-locnote" style={{ marginTop: 4 }}>
          {sub}
        </div>
      </div>
      {children}
    </div>
  );
}

// His tiles are four fixed columns, sized for short figures. A full naira
// figure at his tile size is ~210px, so the tiles wrap at a width that fits one.
const FIT_TILES = { marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" };

// One figure, in his dashboard tile.
function Tile({ label, value, sub, tone: t, title }) {
  return (
    <div className={`dsh-stat${t ? ` ${t}` : ""}`} title={title}>
      <span className="k">{label}</span>
      <b>{value}</b>
      <span className="ds-sub">{sub}</span>
    </div>
  );
}

function CertificatesSection({
  certificates = [],
  onIssue,
  onUpdate,
  onDelete,
  onDownload,
  busy,
  disabled,
  note,
}) {
  const sorted = [...certificates].sort(
    (a, b) => Number(a.number) - Number(b.number),
  );

  const totalCertified = sorted.reduce(
    (acc, c) => acc + safeNum(c.thisCertificate),
    0,
  );
  const totalRetained = sorted.reduce(
    (acc, c) => acc + safeNum(c.retentionAmount) - safeNum(c.retentionReleased),
    0,
  );

  return (
    <div style={STACK}>
      <SectionHead
        title="Interim payment certificates"
        sub="Each certificate is numbered and carries its own cumulative, less-previous, retention, VAT and WHT values: ready for Architect / QS / Client sign-off."
      >
        <button
          type="button"
          className="ds-btn ds-btn-sm btn-p"
          onClick={() => onIssue?.()}
          disabled={busy || disabled}
          title={
            disabled
              ? "Finalize is active. Reopen to issue new certificates."
              : "Issue a new interim certificate"
          }
        >
          <FaPlus size={12} />
          {busy ? "Issuing..." : "Issue certificate"}
        </button>
      </SectionHead>

      {note ? (
        <p className="mk-note" style={{ margin: 0, ...NOTE_WARN }}>
          {note}
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <div className="wk-panel wk-empty" style={NO_MB}>
          No certificates issued yet. Click “Issue certificate” to generate
          IPC #01 against the current value-to-date.
        </div>
      ) : (
        <div className="wk-panel" style={{ marginBottom: 0, overflowX: "auto" }}>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-2 py-2 w-16">No.</th>
                <th className="px-2 py-2 w-24">Date</th>
                <th className="px-2 py-2 text-right">Cumulative</th>
                <th className="px-2 py-2 text-right">Less prev.</th>
                <th className="px-2 py-2 text-right">This cert</th>
                <th className="px-2 py-2 text-right">Retention</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">WHT</th>
                <th className="px-2 py-2 text-right font-semibold text-adlm-blue-700">Net payable</th>
                <th className="px-2 py-2 w-20">Status</th>
                <th className="px-2 py-2 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const isLast = i === sorted.length - 1;
                return (
                  <tr key={c.number} className="border-t">
                    <td className="px-2 py-2 font-medium text-slate-800">
                      IPC {String(c.number).padStart(2, "0")}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{formatDate(c.date)}</td>
                    <td className="px-2 py-2 text-right">{money(c.cumulativeValue)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">
                      {money(c.lessPrevious)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      {money(c.thisCertificate)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      {money(c.retentionAmount)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      {money(c.vatAmount)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">
                      ({money(c.whtAmount)})
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-adlm-blue-700">
                      {money(c.netPayable)}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                        value={c.status || "draft"}
                        disabled={disabled}
                        onChange={(e) =>
                          onUpdate?.(c.number, { status: e.target.value })
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDownload?.(c.number)}
                          className="ds-btn ds-btn-sm btn-o"
                          style={ICON_BTN}
                          aria-label="Download certificate"
                          title="Download .xlsx"
                        >
                          <FaDownload size={13} />
                        </button>
                        {isLast ? (
                          <button
                            type="button"
                            onClick={() => onDelete?.(c.number)}
                            disabled={disabled}
                            className="ds-btn ds-btn-sm btn-o"
                            style={ICON_BTN}
                            aria-label="Delete certificate"
                            title="Delete (latest cert only)"
                          >
                            <FaTrashAlt size={13} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-xs font-semibold text-slate-900">
              <tr className="border-t">
                <td colSpan={4} className="px-2 py-2 text-right">
                  Totals
                </td>
                <td className="px-2 py-2 text-right">{money(totalCertified)}</td>
                <td className="px-2 py-2 text-right">{money(totalRetained)}</td>
                <td colSpan={5} className="px-2 py-2 text-right text-slate-500">
                  Net retention held
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function FinalAccountSection({
  finalAccount,
  onFinalize,
  onReopen,
  onDownload,
  contractSum,
  contractLocked = false,
  measured,
  provisional,
  preliminary,
  variations,
  // Contingency / tax — full QS grand-summary cascade (Sub-total
  // → +Contingency → +VAT → Planned). Default 0 so older callers
  // that haven't passed them in still produce sensible output.
  contingency = 0,
  tax = 0,
  contingencyPercent = 0,
  taxPercent = 0,
  // Actual spent so far — used for true over-run calculation
  // (spend exceeds planned), NOT for live BoQ drift.
  actualSpent = 0,
  disabledFinalize,
}) {
  const isFinalized = Boolean(finalAccount?.finalized);
  // Planned total now follows the full QS cascade — Sub-total +
  // Contingency + Tax + Variations. Without contingency/tax the
  // formula collapses to the old "measured + PC + prelim + var".
  const subtotal = measured + provisional + preliminary;
  const plannedTotal = subtotal + contingency + tax;
  const currentValue = plannedTotal + variations;

  // Over-run / Savings semantics — driven by ACTUAL SPEND, not by
  // live BoQ drift.
  //
  //   over-run = max(0, actualSpent - plannedTotal)
  //   savings  = max(0, plannedTotal - actualSpent)  [only after final]
  //
  // Pre-lock: nothing to compare against → both zero.
  // Locked, no actuals: actualSpent = 0 → over-run = 0 (correct;
  //   the previous "compare contractSum vs live measured+PC+prelim"
  //   produced phantom over-runs whenever the BoQ was edited after
  //   lock without any actual money being spent).
  // Locked with actuals: over-run only ticks up when spend exceeds
  //   the planned baseline.
  let overRun = 0;
  let savings = 0;
  let savingsLabel = "Over-run";
  let savingsTone = "neutral";
  let savingsValue = 0;
  if (isFinalized) {
    savings = finalAccount.savings || 0;
    savingsValue = Math.abs(savings);
    if (savings > 0) {
      savingsLabel = "Under-run (savings)";
      savingsTone = "positive";
    } else if (savings < 0) {
      savingsLabel = "Over-run";
      savingsTone = "negative";
    } else {
      savingsLabel = "On budget";
      savingsTone = "neutral";
    }
  } else if (!contractLocked) {
    savingsLabel = "Pending contract lock";
    savingsTone = "neutral";
  } else {
    // Compare ACTUAL EXPENDITURE to PLANNED + VARIATIONS. Variations
    // legitimately expand the planned budget, so spending up to
    // (planned + variations) is not an over-run.
    const budget = plannedTotal + variations;
    if (actualSpent > budget) {
      overRun = actualSpent - budget;
      savings = -overRun;
      savingsLabel = "Over-run";
      savingsTone = "negative";
      savingsValue = overRun;
    } else if (actualSpent > 0 && actualSpent < budget) {
      savings = budget - actualSpent;
      savingsLabel = "Forecast savings vs budget";
      savingsTone = "positive";
      savingsValue = savings;
    } else {
      // No actuals yet — show "no spend recorded" instead of a
      // misleading zero.
      savingsLabel = "Over-run";
      savingsTone = "neutral";
      savingsValue = 0;
    }
  }

  const livePreview = {
    measuredWorkFinal: measured,
    provisionalFinal: provisional,
    preliminaryFinal: preliminary,
    variationsFinal: variations,
    contingencyFinal: contingency,
    taxFinal: tax,
    agreedContractSum: contractSum,
    plannedTotal,
    currentValue,
    actualSpent,
    finalContractValue: currentValue, // legacy alias
    savings,
    savingsLabel,
    savingsTone,
    savingsValue,
  };

  const view = isFinalized
    ? { ...finalAccount, savingsLabel, savingsTone, savingsValue }
    : livePreview;

  return (
    <div style={STACK}>
      <SectionHead
        title="Final account"
        sub={
          isFinalized
            ? `Finalized on ${formatDate(finalAccount.finalizedAt)}, all project data is frozen.`
            : contractLocked
              ? "Preview of the closing settlement based on current data."
              : "Pre-lock preview, savings / over-run only start tracking after the contract is locked."
        }
      >
        <div className="wk-acts">
          {isFinalized ? (
            <>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={onDownload}
              >
                <FaDownload size={12} /> Download
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={onReopen}
                title="Reopen the final account to make adjustments"
              >
                Reopen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-p"
              onClick={() => onFinalize?.("")}
              disabled={disabledFinalize}
              title={
                disabledFinalize
                  ? "Lock the contract first."
                  : "Freeze the final account and compute settlement"
              }
            >
              <FaFileInvoiceDollar size={12} /> Finalize
            </button>
          )}
        </div>
      </SectionHead>

      {/* The settlement, in his dashboard tiles (four a row, wrapping). */}
      <div className="dsh-stats" style={FIT_TILES}>
        <Tile label="Measured work (final)" value={money(view.measuredWorkFinal)} />
        <Tile label="Provisional" value={money(view.provisionalFinal)} />
        <Tile label="Preliminaries" value={money(view.preliminaryFinal)} />
        {/* Contingency + Tax, only render when set so old projects
            without these values don't show ₦0 stub tiles. */}
        {safeNum(view.contingencyFinal) > 0 || contingencyPercent > 0 ? (
          <Tile
            label={`Contingency (${Number(contingencyPercent || 0).toFixed(1)}%)`}
            value={money(view.contingencyFinal)}
          />
        ) : null}
        {safeNum(view.taxFinal) > 0 || taxPercent > 0 ? (
          <Tile
            label={`Tax / VAT (${Number(taxPercent || 0).toFixed(1)}%)`}
            value={money(view.taxFinal)}
          />
        ) : null}
        <Tile label="Variations" value={money(view.variationsFinal)} />
        <Tile
          label={contractLocked || isFinalized ? "Final contract value" : "Live project total"}
          value={money(view.currentValue ?? view.finalContractValue)}
          sub={!contractLocked && !isFinalized ? "Pre-lock preview." : null}
        />
        {/* Actual spent, surfaces the live actuals figure so users can
            see what their over-run is being calculated against. */}
        <Tile
          label="Actual spent to date"
          value={money(view.actualSpent)}
          sub={safeNum(view.actualSpent) === 0 ? "No spend recorded yet." : null}
        />
        <Tile
          label={
            view.savingsLabel ||
            (view.savings >= 0 ? "Under-run (savings)" : "Over-run")
          }
          tone={
            view.savingsTone === "positive"
              ? "pal-on"
              : view.savingsTone === "negative"
                ? "warn"
                : ""
          }
          title={
            !contractLocked && !isFinalized
              ? "Lock the contract to start tracking savings or over-run against the agreed sum."
              : safeNum(view.actualSpent) === 0
                ? "Over-run = max(0, actual spent − planned). With no spend recorded, the figure is 0."
                : `Over-run = Actual spent (₦${money(view.actualSpent)}) − Planned (₦${money(view.plannedTotal + view.variationsFinal)})`
          }
          value={
            !contractLocked && !isFinalized
              ? "–"
              : money(safeNum(view.savingsValue))
          }
          sub={
            !contractLocked && !isFinalized
              ? "Lock the contract to start tracking."
              : safeNum(view.actualSpent) === 0 && safeNum(view.savingsValue) === 0
                ? "No actual spend yet, no over-run."
                : null
          }
        />
      </div>
    </div>
  );
}

function ModelStatus({ discipline, model, busy, onUpload, onDelete, disabled, allowManualUpload }) {
  const inputRef = React.useRef(null);
  const label =
    discipline === "architectural"
      ? "Architectural"
      : discipline === "structural"
      ? "Structural"
      : "MEP";
  const attached = Boolean(model?.url);

  return (
    <div
      className="wk-panel"
      style={{
        marginBottom: 0,
        padding: 14,
        ...(attached ? { borderColor: "var(--pal-light-line)" } : null),
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <FaCube size={14} className={attached ? "text-emerald-600" : "text-slate-400"} />
          {label}
        </div>
        <span className="wk-src sm" style={attached ? tone("light") : undefined}>
          {attached ? "Attached" : "Not attached"}
        </span>
      </div>

      {attached ? (
        <div className="mt-2 text-[11px] text-slate-600">
          <div className="truncate font-medium text-slate-800" title={model.sourceFile}>
            {model.sourceFile}
          </div>
          <div className="text-slate-500">
            {bytes(model.sizeBytes)} · {model.format?.toUpperCase() || "IFC"}
            {model.uploadedAt ? ` · ${formatDate(model.uploadedAt)}` : ""}
          </div>
          {model.validation?.status ? (
            <div className="mt-1">
              {(() => {
                const v = model.validation || {};
                const map = {
                  valid: [
                    tone("light"),
                    `✓ Verified, ${v.matchedCount}/${v.requiredCount} quantity elements found`,
                  ],
                  "no-quantities": [
                    undefined,
                    "No quantities to verify against",
                  ],
                  unchecked: [
                    tone("deep"),
                    "Not Element-ID checked",
                  ],
                  invalid: [
                    tone("orange"),
                    `⚠ ${v.missingCount} of ${v.requiredCount} elements missing`,
                  ],
                };
                const [chipTone, text] = map[v.status] || map.unchecked;
                return (
                  <span
                    className="wk-src sm"
                    style={chipTone}
                    title={
                      v.ifcElementCount
                        ? `${v.ifcElementCount.toLocaleString()} elements in the IFC`
                        : undefined
                    }
                  >
                    {text}
                  </span>
                );
              })()}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <a
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-adlm-blue-700 hover:underline"
            >
              Open file →
            </a>
            {!disabled ? (
              <button
                type="button"
                onClick={() => onDelete?.(discipline)}
                className="text-red-600 hover:underline"
                title={`Detach ${label} model`}
              >
                Detach
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">
          Pushed automatically from QUIV during save.
        </div>
      )}

      {allowManualUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".ifc,.ifczip,.frag"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload?.(discipline, f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 hover:underline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            title="Fallback: upload manually if the plugin wasn't used"
          >
            <FaUpload size={11} />
            {busy ? "Uploading..." : attached ? "Replace manually" : "Upload manually"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function ModelsPanel({
  projectModels,
  modelUploadBusy,
  onUploadModel,
  onDeleteModel,
  disabled,
  items = [],
  productKey = "",
}) {
  const [showManual, setShowManual] = React.useState(false);
  const attached = Object.entries(projectModels || {}).filter(
    ([, m]) => m?.url,
  );

  // Element IDs whose BoQ line can't be classified into a discipline fall
  // outside every per-discipline required set, so the validation gate can't
  // check them. Surface the count until the plugin supplies an explicit
  // discipline (which removes the guesswork entirely).
  const unclassified = React.useMemo(() => {
    const ids = new Set();
    let lines = 0;
    for (const it of items || []) {
      const eids = (it?.elementIds || [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!eids.length) continue;
      if (deriveItemDiscipline(it, productKey) === "unknown") {
        lines += 1;
        eids.forEach((id) => ids.add(id));
      }
    }
    return { elements: ids.size, lines };
  }, [items, productKey]);
  return (
    <div style={STACK}>
      <p className="mk-note" style={{ margin: 0 }}>
        <b>Auto-attached from Revit.</b> When you save a project from the
        QUIV, the model is exported to IFC (compressed to stay under
        100 MB) and pushed here automatically. For large models the plugin
        asks first since saving takes longer. No manual upload needed.
      </p>

      {unclassified.elements > 0 ? (
        <p className="mk-note" style={{ margin: 0, ...NOTE_WARN }}>
          <b>
            {unclassified.elements.toLocaleString()} element
            {unclassified.elements === 1 ? "" : "s"}
          </b>{" "}
          across {unclassified.lines} BoQ line
          {unclassified.lines === 1 ? "" : "s"} aren’t classified into a
          discipline, so they’re <b>not covered</b> by model validation. Re-save
          the project from the updated QUIV to tag them automatically.
        </p>
      ) : null}

      {attached.length ? (
        <div
          style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {["architectural", "structural", "mep"].map((d) => (
            <ModelStatus
              key={d}
              discipline={d}
              model={projectModels?.[d]}
              busy={modelUploadBusy?.[d]}
              onUpload={onUploadModel}
              onDelete={onDeleteModel}
              disabled={disabled}
              allowManualUpload={showManual}
            />
          ))}
        </div>
      ) : (
        <div className="wk-panel wk-empty" style={NO_MB}>
          No BIM models attached yet. Save the project from QUIV
          to push the models automatically.
        </div>
      )}

      <div className="wk-bar" style={{ marginBottom: 0, justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="ds-btn ds-btn-sm btn-o"
          title="Rarely needed, the plugin auto-pushes. Use if you have an IFC from elsewhere."
        >
          {showManual ? "Hide manual upload" : "Advanced: manual upload"}
        </button>
        <span className="wk-locnote">
          Open the <b>3D Model</b> tab to view &amp;
          verify.
        </span>
      </div>

      {showManual ? (
        <div
          style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {["architectural", "structural", "mep"].map((d) => (
            <ModelStatus
              key={`manual-${d}`}
              discipline={d}
              model={projectModels?.[d]}
              busy={modelUploadBusy?.[d]}
              onUpload={onUploadModel}
              onDelete={onDeleteModel}
              disabled={disabled}
              allowManualUpload
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectContractPanel({
  certificates = [],
  certBusy,
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
  items = [],
  productKey = "",
  // BoQ-imported projects have no BIM model behind them — hide the models
  // sub-tab entirely (the server also rejects uploads for that origin).
  hideModels = false,
  contractLocked,
  contractSum,
  measured,
  provisional,
  preliminary,
  variations,
  // Full QS cascade values + actual spend, fed through to FinalAccount.
  contingency = 0,
  tax = 0,
  contingencyPercent = 0,
  taxPercent = 0,
  actualSpent = 0,
}) {
  const [tab, setTab] = React.useState("certificates");
  // Collapsed state persists per-browser so users who never need
  // certificates / final account / BIM can keep the section folded.
  // localStorage key is scoped, not project-specific — the preference
  // travels with the user across all projects.
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("adlm:contractAdminCollapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          "adlm:contractAdminCollapsed",
          next ? "1" : "0",
        );
      } catch {
        // ignore — feature still works without persistence
      }
      return next;
    });
  }

  const hasAnyFeature =
    onIssueCertificate || onFinalizeAccount || onUploadModel;
  if (!hasAnyFeature) return null;

  const modelCount = Object.values(projectModels || {}).filter(Boolean).length;
  const certCount = certificates.length;
  // Pre-compute a one-line summary the collapsed header can show. Gives
  // users at-a-glance status without expanding.
  const collapsedSummary = [
    certCount ? `${certCount} certificate${certCount === 1 ? "" : "s"}` : null,
    finalAccount?.finalized ? "Final account closed" : null,
    modelCount ? `${modelCount} BIM model${modelCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="wk-panel" style={NO_MB}>
      <div className="wk-ph" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2>Contract administration</h2>
          <div className="wk-locnote" style={{ marginTop: 4 }}>
            {collapsed && collapsedSummary
              ? collapsedSummary
              : hideModels
                ? "Certificates and final account. Everything a QS needs after contract award."
                : "Certificates, final account and BIM models. Everything a QS needs after contract award."}
          </div>
        </div>
        {/* Collapse / expand toggle. Persists in localStorage so the
            preference survives page reloads and crosses projects. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="contract-admin-body"
          className="ds-btn ds-btn-sm btn-o"
          title={collapsed ? "Show contract administration" : "Hide contract administration"}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {collapsed ? null : (
      <div id="contract-admin-body" style={{ ...STACK, padding: "16px 20px 20px" }}>
      <div
        className="wk-tabs"
        role="tablist"
        aria-label="Contract administration"
        style={{ maxWidth: "100%", overflowX: "auto", justifySelf: "start" }}
      >
        <SubTab
          active={tab === "certificates"}
          onClick={() => setTab("certificates")}
          label="Interim certificates"
          count={certificates.length}
        />
        <SubTab
          active={tab === "final"}
          onClick={() => setTab("final")}
          label="Final account"
        />
        {hideModels ? null : (
          <SubTab
            active={tab === "models"}
            onClick={() => setTab("models")}
            label="BIM models"
            count={modelCount}
          />
        )}
      </div>

      {!collapsed && tab === "certificates" ? (
        <CertificatesSection
          certificates={certificates}
          onIssue={onIssueCertificate}
          onUpdate={onUpdateCertificate}
          onDelete={onDeleteCertificate}
          onDownload={onDownloadCertificate}
          busy={certBusy}
          disabled={Boolean(finalAccount?.finalized)}
          note={
            !contractLocked
              ? "Tip: lock the contract first so each certificate has a stable baseline to measure against."
              : null
          }
        />
      ) : null}

      {!collapsed && tab === "final" ? (
        <FinalAccountSection
          finalAccount={finalAccount}
          onFinalize={onFinalizeAccount}
          onReopen={onReopenFinalAccount}
          onDownload={onDownloadFinalAccount}
          contractSum={contractSum}
          // Pass contractLocked so the section can suppress the
          // misleading "Over-run ₦Xm" reading before the contract is
          // signed — pre-lock there's no agreement to over-run.
          contractLocked={contractLocked}
          measured={measured}
          provisional={provisional}
          preliminary={preliminary}
          variations={variations}
          // Full QS cascade — Contingency + Tax flow into the breakdown
          // and into the planned-vs-actual over-run math.
          contingency={contingency}
          tax={tax}
          contingencyPercent={contingencyPercent}
          taxPercent={taxPercent}
          // Actual spent so the over-run is computed off real
          // expenditure, not BoQ drift.
          actualSpent={actualSpent}
          disabledFinalize={!contractLocked}
        />
      ) : null}

      {!collapsed && !hideModels && tab === "models" ? (
        <ModelsPanel
          projectModels={projectModels}
          modelUploadBusy={modelUploadBusy}
          onUploadModel={onUploadModel}
          onDeleteModel={onDeleteModel}
          items={items}
          productKey={productKey}
          disabled={Boolean(finalAccount?.finalized)}
        />
      ) : null}
      </div>
      )}
    </section>
  );
}
