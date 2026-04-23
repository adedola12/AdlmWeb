import React from "react";
import {
  FaFileInvoiceDollar,
  FaDownload,
  FaPlus,
  FaTrashAlt,
  FaUpload,
  FaCube,
} from "react-icons/fa";

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
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function bytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function SubTab({ id, active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-adlm-blue-700 text-white"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      {label}
      {typeof count === "number" && count > 0 ? (
        <span
          className={[
            "rounded-full px-1.5 py-0.5 text-[10px]",
            active ? "bg-white text-adlm-blue-700" : "bg-slate-200 text-slate-700",
          ].join(" ")}
        >
          {count}
        </span>
      ) : null}
    </button>
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            Interim Payment Certificates
          </div>
          <div className="text-[11px] text-slate-500">
            Each certificate is numbered and carries its own cumulative, less-previous,
            retention, VAT and WHT values — ready for Architect / QS / Client sign-off.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-xs btn-primary inline-flex items-center gap-1"
          onClick={() => onIssue?.()}
          disabled={busy || disabled}
          title={
            disabled
              ? "Finalize is active. Reopen to issue new certificates."
              : "Issue a new interim certificate"
          }
        >
          <FaPlus className="text-[9px]" />
          {busy ? "Issuing..." : "Issue certificate"}
        </button>
      </div>

      {note ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {note}
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          No certificates issued yet. Click “Issue certificate” to generate
          IPC #01 against the current value-to-date.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200">
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
                          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                          title="Download .xlsx"
                        >
                          <FaDownload className="text-[10px]" />
                        </button>
                        {isLast ? (
                          <button
                            type="button"
                            onClick={() => onDelete?.(c.number)}
                            disabled={disabled}
                            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                            title="Delete (latest cert only)"
                          >
                            <FaTrashAlt className="text-[10px]" />
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
  measured,
  provisional,
  preliminary,
  variations,
  disabledFinalize,
}) {
  const isFinalized = Boolean(finalAccount?.finalized);
  const livePreview = {
    measuredWorkFinal: measured,
    provisionalFinal: provisional,
    preliminaryFinal: preliminary,
    variationsFinal: variations,
    agreedContractSum: contractSum,
    finalContractValue: measured + provisional + preliminary + variations,
  };
  livePreview.savings =
    livePreview.agreedContractSum - livePreview.finalContractValue;

  const view = isFinalized ? finalAccount : livePreview;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Final Account</div>
          <div className="text-[11px] text-slate-500">
            {isFinalized
              ? `Finalized on ${formatDate(finalAccount.finalizedAt)} — all project data is frozen.`
              : "Preview of the closing settlement based on current data."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized ? (
            <>
              <button
                type="button"
                className="btn btn-xs inline-flex items-center gap-1"
                onClick={onDownload}
              >
                <FaDownload className="text-[9px]" /> Download
              </button>
              <button
                type="button"
                className="btn btn-xs"
                onClick={onReopen}
                title="Reopen the final account to make adjustments"
              >
                Reopen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-primary inline-flex items-center gap-1"
              onClick={() => onFinalize?.("")}
              disabled={disabledFinalize}
              title={
                disabledFinalize
                  ? "Lock the contract first."
                  : "Freeze the final account and compute settlement"
              }
            >
              <FaFileInvoiceDollar className="text-[9px]" /> Finalize
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2 md:grid-cols-3">
        <div>
          <div className="text-slate-500">Measured work (final)</div>
          <div className="font-semibold text-slate-900">
            {money(view.measuredWorkFinal)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Provisional</div>
          <div className="font-semibold text-slate-900">
            {money(view.provisionalFinal)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Preliminaries</div>
          <div className="font-semibold text-slate-900">
            {money(view.preliminaryFinal)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Variations</div>
          <div className="font-semibold text-slate-900">
            {money(view.variationsFinal)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Final contract value</div>
          <div className="text-base font-bold text-adlm-blue-700">
            {money(view.finalContractValue)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">
            {view.savings >= 0 ? "Under-run (savings)" : "Over-run"}
          </div>
          <div
            className={`text-base font-bold ${
              view.savings >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {money(Math.abs(view.savings))}
          </div>
        </div>
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
      className={[
        "rounded border p-3 transition",
        attached
          ? "border-emerald-200 bg-emerald-50/30"
          : "border-slate-200 bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <FaCube className={attached ? "text-emerald-600" : "text-slate-400"} />
          {label}
        </div>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            attached
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-200 text-slate-600",
          ].join(" ")}
        >
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
          Pushed automatically from the Revit plugin during save.
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
            <FaUpload className="text-[8px]" />
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
}) {
  const [showManual, setShowManual] = React.useState(false);
  const attached = Object.entries(projectModels || {}).filter(
    ([, m]) => m?.url,
  );
  return (
    <div className="space-y-3">
      <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
        <b>Auto-attached from Revit.</b> When you save a project from the
        Revit plugin, the model is exported to IFC (compressed to stay under
        100 MB) and pushed here automatically. For large models the plugin
        asks first since saving takes longer. No manual upload needed.
      </div>

      {attached.length ? (
        <div className="grid gap-3 md:grid-cols-3">
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
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          No BIM models attached yet. Save the project from the Revit plugin
          to push the models automatically.
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-slate-500 hover:text-slate-700 hover:underline"
          title="Rarely needed — the plugin auto-pushes. Use if you have an IFC from elsewhere."
        >
          {showManual ? "Hide manual upload" : "Advanced: manual upload"}
        </button>
        <span className="text-slate-400">
          3D viewer coming in the next release.
        </span>
      </div>

      {showManual ? (
        <div className="grid gap-3 md:grid-cols-3">
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
  contractLocked,
  contractSum,
  measured,
  provisional,
  preliminary,
  variations,
}) {
  const [tab, setTab] = React.useState("certificates");
  const hasAnyFeature =
    onIssueCertificate || onFinalizeAccount || onUploadModel;
  if (!hasAnyFeature) return null;

  const modelCount = Object.values(projectModels || {}).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            Contract administration
          </div>
          <div className="text-[11px] text-slate-500">
            Certificates, final account and BIM models — everything a QS needs
            after contract award.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 pb-2">
        <SubTab
          id="certificates"
          active={tab === "certificates"}
          onClick={() => setTab("certificates")}
          label="Interim certificates"
          count={certificates.length}
        />
        <SubTab
          id="final"
          active={tab === "final"}
          onClick={() => setTab("final")}
          label="Final account"
        />
        <SubTab
          id="models"
          active={tab === "models"}
          onClick={() => setTab("models")}
          label="BIM models"
          count={modelCount}
        />
      </div>

      {tab === "certificates" ? (
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

      {tab === "final" ? (
        <FinalAccountSection
          finalAccount={finalAccount}
          onFinalize={onFinalizeAccount}
          onReopen={onReopenFinalAccount}
          onDownload={onDownloadFinalAccount}
          contractSum={contractSum}
          measured={measured}
          provisional={provisional}
          preliminary={preliminary}
          variations={variations}
          disabledFinalize={!contractLocked}
        />
      ) : null}

      {tab === "models" ? (
        <ModelsPanel
          projectModels={projectModels}
          modelUploadBusy={modelUploadBusy}
          onUploadModel={onUploadModel}
          onDeleteModel={onDeleteModel}
          disabled={Boolean(finalAccount?.finalized)}
        />
      ) : null}
    </div>
  );
}
