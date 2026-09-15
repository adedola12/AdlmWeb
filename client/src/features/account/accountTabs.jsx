// The order and installation tabs, which outlived the page they were written for.
//
// They used to live in pages/Dashboard.jsx, and AccountActivity imported them
// across from there. /dashboard has been retired — /manage is the account
// overview now, and two dashboards competing for the same job is how one of
// them quietly goes stale — so the remaining 1,300 lines of that page went
// with the route. These two did not: Profile still renders both through
// AccountActivity, and they are the only things in that file anybody still
// looks at.
//
// Moved rather than left behind, so nothing imports a page that no longer
// exists. Only what these two actually use came along: seven helpers and four
// icons out of a file that imported twenty-one things.
//
// dayjs needs its relativeTime plugin extended here. The tabs call .fromNow()
// twice, which reads as plain dayjs and is not — without the extend it throws
// at render, and no import scan would have caught it because the plugin is
// never named at the call site.

import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import OrganizationBadge from "../../components/common/OrganizationBadge.jsx";
import {
  IconBook,
  IconCheck,
  IconDownload,
  IconPlayCircle,
} from "../../components/icons.jsx";

dayjs.extend(relativeTime);

function sumSeatsFromLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = 0;
  for (const ln of lines) {
    const seats = Math.max(parseInt(ln?.qty ?? 1, 10) || 1, 1);
    total += seats;
  }
  return total || null;
}

function formatPendingProducts(p) {
  const grants = Array.isArray(p?.installation?.entitlementGrants)
    ? p.installation.entitlementGrants
    : [];

  if (grants.length) {
    const parts = grants
      .map((g) => {
        const key = String(g?.productKey || "").trim();
        const months = Number(g?.months || 0);
        const seats = Math.max(parseInt(g?.seats ?? 1, 10) || 1, 1);
        if (!key) return null;
        const bits = [];
        if (months) bits.push(`${months}mo`);
        if (seats !== 1) bits.push(`${seats} seats`);
        return bits.length ? `${key} (${bits.join(" · ")})` : key;
      })
      .filter(Boolean);

    return parts.length ? parts.join(" · ") : "—";
  }

  if (Array.isArray(p?.lines) && p.lines.length) {
    return p.lines
      .map((ln) => ln?.name || ln?.productKey)
      .filter(Boolean)
      .join(" · ");
  }

  return p?.productKey || "—";
}

/* ---------------- physical training helpers ---------------- */

function trainingStatusMeta(enr) {
  const st = String(enr?.status || "").toLowerCase();

  if (st === "approved") {
    return {
      label: "Approved",
      pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    };
  }
  if (st === "rejected") {
    return {
      label: "Rejected",
      pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    };
  }

  // payment_pending / form_pending / submitted / anything else
  return {
    label: "Pending admin approval",
    pill: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
  };
}

function installationMetaFromEnrollment(enr) {
  const s = String(enr?.installation?.status || "none").toLowerCase();
  if (s === "complete") {
    return {
      label: "Installation complete",
      pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    };
  }
  if (s === "pending") {
    return {
      label: "Installation pending",
      pill: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
    };
  }
  return {
    label: "No installation",
    pill: "bg-slate-50 text-slate-600 ring-1 ring-slate-100",
  };
}

function trainingDurationText(training) {
  const start = training?.startAt ? dayjs(training.startAt) : null;
  const end = training?.endAt ? dayjs(training.endAt) : null;
  if (!start || !end || !start.isValid() || !end.isValid()) return "—";

  const days = Math.max(
    end.startOf("day").diff(start.startOf("day"), "day") + 1,
    1,
  );
  return `${days} day${days > 1 ? "s" : ""} (${start.format("MMM D")} – ${end.format(
    "MMM D, YYYY",
  )})`;
}

function buildTrainingAddress(training) {
  const loc = training?.location || {};
  return [loc.name, loc.address, loc.city, loc.state]
    .filter(Boolean)
    .join(", ");
}

function mapsUrlForTraining(training) {
  const loc = training?.location || {};
  const direct = String(loc.googleMapsPlaceUrl || "").trim();
  if (direct) return direct;

  const q = buildTrainingAddress(training);
  if (!q) return "https://www.google.com/maps";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* ---------------- page ---------------- */

export function OrdersTab({
  orders = [],
  loading,
  error,
  pagination,
  onPageChange,
  onOpenReceipt,

  // ✅ physical trainings
  pEnrollments = [],
  loadingPTrainings,
  pTrainingsError,
  onRefreshPTrainings,
}) {
  if (loading)
    return <div className="text-sm text-slate-600">Loading orders…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  const page = pagination?.page || 1;
  const pages = pagination?.pages || 1;
  const hasPrev = !!pagination?.hasPrev;
  const hasNext = !!pagination?.hasNext;

  const goTo = (p) => {
    const next = Math.max(1, Math.min(pages, p));
    if (next !== page) onPageChange(next);
  };

  const canPrintReceipt = (o) => {
    const st = String(o?.status || "").toLowerCase();
    return st === "approved" || o?.paid === true;
  };

  return (
    <div className="space-y-8">
      {/* Purchases */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Purchases</h3>
        </div>

        {!orders || orders.length === 0 ? (
          <div className="text-sm text-slate-600 mt-2">No purchases yet.</div>
        ) : (
          <>
            <div className="space-y-3 mt-3">
              {orders.map((o) => {
                const dateText = o.createdAt
                  ? dayjs(o.createdAt).format("MMM D, YYYY")
                  : "—";
                const timeAgo = o.createdAt ? dayjs(o.createdAt).fromNow() : "";

                const statusLabel = o.paid
                  ? "Paid"
                  : String(o.status || "").toLowerCase() === "approved"
                    ? "Approved"
                    : String(o.status || "").toLowerCase() === "rejected"
                      ? "Rejected"
                      : "Awaiting admin approval";

                const statusPill =
                  o.paid || String(o.status || "").toLowerCase() === "approved"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                    : String(o.status || "").toLowerCase() === "rejected"
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                      : "bg-amber-50 text-amber-800 ring-1 ring-amber-100";

                const seats = sumSeatsFromLines(o.lines) || 1;
                const lt =
                  String(o.licenseType || "").toLowerCase() ===
                    "organization" || seats > 1
                    ? "organization"
                    : "personal";

                return (
                  <div
                    key={o._id}
                    className="group relative spotlight rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-depth lift"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          Order #{String(o._id).slice(-6).toUpperCase()}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {dateText} {timeAgo ? `• ${timeAgo}` : ""}
                        </div>

                        <div className="mt-2">
                          <OrganizationBadge
                            licenseType={lt}
                            organization={o.organization}
                            organizationName={o?.organization?.name}
                            seats={seats}
                          />
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs ${statusPill}`}
                        >
                          {statusLabel}
                        </span>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {o.currency || "NGN"}{" "}
                          {Number(o.totalAmount || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canPrintReceipt(o) && (
                        <button
                          type="button"
                          className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                          onClick={() => onOpenReceipt?.(o._id)}
                          title="Open receipt page to print or download PDF"
                        >
                          Print / Download Receipt
                        </button>
                      )}
                    </div>

                    {Array.isArray(o.lines) && o.lines.length > 0 && (
                      <div className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-100 overflow-hidden">
                        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 text-xs text-slate-500">
                          <div className="col-span-6">Item</div>
                          <div className="col-span-3">Billing</div>
                          <div className="col-span-1 text-right">Qty</div>
                          <div className="col-span-2 text-right">Subtotal</div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {o.lines.map((ln, idx) => (
                            <div key={idx} className="px-3 py-2">
                              <div className="sm:grid sm:grid-cols-12 sm:gap-2 text-sm">
                                <div className="sm:col-span-6">
                                  <div className="font-medium text-slate-900">
                                    {ln.name || ln.productKey}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {ln.productKey}
                                    {ln.install
                                      ? ` • Install: ${o.currency} ${Number(
                                          ln.install,
                                        ).toLocaleString()}`
                                      : ""}
                                  </div>
                                </div>

                                <div className="sm:col-span-3 text-slate-600 capitalize mt-2 sm:mt-0">
                                  <span className="sm:hidden text-xs text-slate-500 mr-2">
                                    Billing:
                                  </span>
                                  {ln.billingInterval || "-"}
                                  <div className="text-xs text-slate-500">
                                    Periods: {ln.periods || 1}{" "}
                                    {ln.billingInterval === "yearly"
                                      ? "year(s)"
                                      : "month(s)"}
                                  </div>
                                </div>

                                <div className="sm:col-span-1 text-slate-700 mt-1 sm:mt-0 sm:text-right">
                                  <span className="sm:hidden text-xs text-slate-500 mr-2">
                                    Qty:
                                  </span>
                                  {ln.qty || 1} seat(s)
                                </div>

                                <div className="sm:col-span-2 font-medium text-slate-900 mt-1 sm:mt-0 sm:text-right">
                                  <span className="sm:hidden text-xs text-slate-500 mr-2">
                                    Subtotal:
                                  </span>
                                  {o.currency}{" "}
                                  {Number(ln.subtotal || 0).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {o.paystackRef ? <span>Ref: {o.paystackRef}</span> : null}
                      {o.decidedAt ? (
                        <span>
                          Reviewed: {dayjs(o.decidedAt).format("MMM D, YYYY")}
                          {o.decidedBy ? ` • by ${o.decidedBy}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-4">
              <button
                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                disabled={!hasPrev}
                onClick={() => goTo(page - 1)}
              >
                Previous
              </button>

              <div className="flex items-center gap-1 flex-wrap justify-center">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => goTo(p)}
                    className={`min-w-[36px] px-3 py-2 rounded-md text-sm border ${
                      p === page
                        ? "bg-adlm-blue-700 text-white border-adlm-blue-700"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {pages > 1 && (
                  <button
                    onClick={() => goTo(pages)}
                    className="min-w-[64px] px-3 py-2 rounded-md text-sm border hover:bg-slate-50"
                    title="Last page"
                  >
                    Last
                  </button>
                )}
              </div>

              <button
                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                disabled={!hasNext}
                onClick={() => goTo(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* Physical Training Enrollments */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Physical Training Enrollments</h3>
          <button
            type="button"
            className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
            onClick={() => onRefreshPTrainings?.()}
            disabled={loadingPTrainings}
            title="Refresh to get latest approval/installation status"
          >
            Refresh
          </button>
        </div>

        {pTrainingsError ? (
          <div className="text-sm text-red-600 mt-2">{pTrainingsError}</div>
        ) : null}

        {loadingPTrainings ? (
          <div className="text-sm text-slate-600 mt-2">
            Loading physical enrollments…
          </div>
        ) : !pEnrollments?.length ? (
          <div className="text-sm text-slate-600 mt-2">
            No physical enrollments yet.
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {pEnrollments.map((enr) => {
              const t = enr?.training || {};
              const st = trainingStatusMeta(enr);
              const dateText = enr.createdAt
                ? dayjs(enr.createdAt).format("MMM D, YYYY")
                : "—";
              const timeAgo = enr.createdAt
                ? dayjs(enr.createdAt).fromNow()
                : "";
              const amount =
                Number(enr?.amountNGN ?? enr?.payment?.amountNGN ?? 0) || 0;

              return (
                <div
                  key={String(enr._id)}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-depth lift"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        Enrollment #{String(enr._id).slice(-6).toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {dateText} {timeAgo ? `• ${timeAgo}` : ""}
                      </div>

                      <div className="mt-2">
                        <div className="text-xs text-slate-500">Training</div>
                        <div className="font-semibold">{t.title || "—"}</div>
                        <div className="text-sm text-slate-600 mt-1">
                          Duration: {trainingDurationText(t)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${st.pill}`}
                      >
                        {st.label}
                      </span>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        NGN {Number(amount).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                      href={mapsUrlForTraining(t)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View location
                    </a>

                    {enr?.receiptUrl ? (
                      <a
                        className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                        href={enr.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View payment receipt
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {enr?.paymentState ? (
                      <span>Payment: {enr.paymentState}</span>
                    ) : null}
                    {enr?.approvedAt ? (
                      <span>
                        Approved: {dayjs(enr.approvedAt).format("MMM D, YYYY")}
                      </span>
                    ) : null}
                    {enr?.rejectedAt ? (
                      <span>
                        Rejected: {dayjs(enr.rejectedAt).format("MMM D, YYYY")}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function InstallationsTab({
  installations = [],
  installerHub,
  pEnrollments = [],
  loadingPTrainings,
  pTrainingsError,
  onRefreshPTrainings,
}) {
  const [setupVideoModal, setSetupVideoModal] = React.useState(false);
  const trainingInstalls = (pEnrollments || []).filter(
    (x) => String(x?.status || "").toLowerCase() === "approved",
  );

  return (
    <div className="space-y-8">
      {/* Physical training installations */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Physical Training Installations</h3>
          <button
            type="button"
            className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
            onClick={() => onRefreshPTrainings?.()}
            disabled={loadingPTrainings}
          >
            Refresh
          </button>
        </div>

        {pTrainingsError ? (
          <div className="text-sm text-red-600 mt-2">{pTrainingsError}</div>
        ) : null}

        {loadingPTrainings ? (
          <div className="text-sm text-slate-600 mt-2">Loading…</div>
        ) : !trainingInstalls.length ? (
          <div className="text-sm text-slate-600 mt-2">
            No approved trainings requiring installation yet.
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {trainingInstalls.map((enr) => {
              const t = enr?.training || {};
              const install = installationMetaFromEnrollment(enr);

              const keys = Array.isArray(t?.softwareProductKeys)
                ? t.softwareProductKeys
                : [];
              const checklist = Array.isArray(t?.installationChecklist)
                ? t.installationChecklist
                : [];

              return (
                <div
                  key={String(enr._id)}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 p-4 bg-white shadow-depth lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {t.title || "Physical training"}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Duration: {trainingDurationText(t)}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Location: {buildTrainingAddress(t) || "—"}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${install.pill}`}
                    >
                      {install.label}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-500 mb-1">
                      Software(s) for this training
                    </div>
                    {keys.length ? (
                      <div className="flex flex-wrap gap-2">
                        {keys.map((k) => (
                          <span
                            key={k}
                            className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-700 ring-1 ring-slate-100"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">, </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-500 mb-1">
                      Installation checklist
                    </div>
                    {checklist.length ? (
                      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                        {checklist.map((it) => (
                          <li key={it.key}>
                            {it.label}{" "}
                            {it.helpUrl ? (
                              <a
                                className="text-adlm-blue-700"
                                href={it.helpUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                (help)
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-slate-600">, </div>
                    )}
                  </div>

                  {String(enr?.installation?.status || "").toLowerCase() ===
                    "pending" && (
                    <div className="mt-4 text-sm text-slate-700 space-y-2">
                      <div className="font-medium">Next steps</div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          Download AnyDesk:{" "}
                          <a
                            className="text-adlm-blue-700"
                            href="https://anydesk.com/en/downloads/windows"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Click here
                          </a>
                        </li>
                        <li>Send your AnyDesk Address to support</li>
                        <li>
                          Admin will mark installation as complete once done
                          (your dashboard updates automatically after refresh).
                        </li>
                      </ul>
                    </div>
                  )}

                  {String(enr?.installation?.status || "").toLowerCase() ===
                    "complete" && (
                    <div className="mt-4 text-sm text-slate-700">
                      ✅ Installation completed for this training. You can now
                      use the required software.
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                      href={mapsUrlForTraining(t)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View location
                    </a>
                    <a
                      className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                      href={`/me/ptrainings/${String(enr._id)}/ics`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download Calendar (.ics)
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Existing product installations */}
      <div>
        <h3 className="font-semibold">Product Installations</h3>
        {!installations.length ? (
          <div className="text-sm text-slate-600 mt-2">
            No installations yet.
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {installations.map((p) => {
              const st = String(
                p?.installation?.status || "none",
              ).toLowerCase();
              const isPending = st === "pending";

              const lt = String(p.licenseType || "personal").toLowerCase();
              const seats =
                lt === "organization" ? sumSeatsFromLines(p.lines) : null;

              const pendingProducts = formatPendingProducts(p);

              return (
                <div
                  key={p._id}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 p-4 bg-white shadow-depth lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">Installation request</div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <OrganizationBadge
                          licenseType={lt}
                          organization={p.organization}
                          organizationName={p?.organization?.name}
                          seats={seats}
                        />
                        <span className="text-xs text-slate-500">
                          {p.decidedAt
                            ? dayjs(p.decidedAt).format("YYYY-MM-DD")
                            : ""}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-slate-500 mb-1">
                          Pending product(s)
                        </div>
                        <div className="text-sm text-slate-800 break-words">
                          {pendingProducts}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        isPending
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
                          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                      }`}
                    >
                      {isPending
                        ? "Pending installation"
                        : "Installation complete"}
                    </span>
                  </div>

                  {isPending && (
                    <div className="mt-3 text-sm text-slate-700 space-y-3">
                      <div className="font-medium">Next steps</div>

                      <div className="flex flex-wrap gap-2">
                        {installerHub?.downloadUrl ? (
                          <a
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-adlm-blue-700 text-white text-sm font-medium hover:bg-[#0050c8] transition"
                            href={installerHub.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <IconDownload className="w-4 h-4" />
                            Download Installer Hub
                          </a>
                        ) : null}

                        {installerHub?.guideUrl ? (
                          <a
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#e86a27] text-white text-sm font-medium hover:bg-[#cf5b1d] transition"
                            href={installerHub.guideUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <IconBook className="w-4 h-4" />
                            Download User Guide
                          </a>
                        ) : null}

                        {installerHub?.videoUrl ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                            onClick={() => setSetupVideoModal(true)}
                          >
                            <IconPlayCircle className="w-4 h-4" />
                            Watch Setup Guide
                          </button>
                        ) : null}
                      </div>

                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        {installerHub?.downloadUrl ? (
                          <li>Download and run the Installer Hub to set up your software</li>
                        ) : null}
                        {installerHub?.guideUrl ? (
                          <li>
                            Follow the{" "}
                            <a
                              className="text-adlm-blue-700 underline"
                              href={installerHub.guideUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Installer Hub user guide
                            </a>{" "}
. Sign-in to first install, with pictures of every screen
                          </li>
                        ) : null}
                        <li>
                          Or use AnyDesk for remote installation:{" "}
                          <a
                            className="text-adlm-blue-700 underline"
                            href={p.installation?.anydeskUrl || "https://anydesk.com/en/downloads/windows"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download AnyDesk
                          </a>
                        </li>
                        <li>Send your AnyDesk Address to support for remote setup</li>
                      </ul>
                    </div>
                  )}

                  {!isPending && (
                    <div className="mt-3 text-sm text-slate-700">
                      ✅ Your installation has been completed. You can now use
                      the software.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Setup Guide Video Modal */}
      {setupVideoModal && installerHub?.videoUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSetupVideoModal(false)}
        >
          <div
            className="relative w-full max-w-3xl mx-4 rounded-xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Installer Hub - Setup Guide</h3>
              <button
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                onClick={() => setSetupVideoModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="bg-black">
              <video
                className="w-full aspect-video"
                src={installerHub.videoUrl}
                controls
                autoPlay
                preload="metadata"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <IconCheck className="w-4 h-4 text-emerald-600 shrink-0" />
  );
}
