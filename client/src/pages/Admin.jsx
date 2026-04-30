// src/pages/Admin.jsx
import React from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import OrganizationBadge from "../components/common/OrganizationBadge.jsx";

const MONTH_CHOICES = [
  { label: "1 month", value: 1 },
  { label: "6 months", value: 6 },
  { label: "1 year", value: 12 },
];

// ✅ Route to your detailed Physical Training admin page
const PTRAININGS_ADMIN_ROUTE = "/admin/ptrainings";

function Badge({ label, tone = "slate" }) {
  const toneClass =
    tone === "yellow"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : tone === "blue"
        ? "bg-blue-100 text-adlm-navy-mid border-blue-200"
        : tone === "red"
          ? "bg-red-100 text-red-800 border-red-200"
          : tone === "green"
            ? "bg-green-100 text-green-800 border-green-200"
            : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}

/* ------------------ helpers (UI) ------------------ */

function inferLicenseType(licenseType, seats, organizationName) {
  const lt = String(licenseType || "").toLowerCase();
  if (lt === "organization" || lt === "personal") return lt;

  // legacy fallback (only infer org if orgName exists)
  const org = String(organizationName || "").trim();
  if (org) return "organization";

  // do NOT infer org from seats alone (legacy qty can be months)
  return "personal";
}

function maxSeatsFromLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let max = 1;
  for (const ln of lines) {
    const seats = Math.max(parseInt(ln?.qty ?? 1, 10) || 1, 1);
    if (seats > max) max = seats;
  }
  return max || 1;
}

function seatsForPurchaseBadge(p) {
  const purchaseOrgName = String(p?.organization?.name || "").trim();
  const lt = inferLicenseType(p?.licenseType, 1, purchaseOrgName);

  // personal purchase badge should always show 1 seat
  if (lt === "personal") return 1;

  // org badge: use MAX seats across lines/grants (not SUM)
  const fromLines = maxSeatsFromLines(p?.lines);
  const fromGrants = (() => {
    const grants = Array.isArray(p?.installation?.entitlementGrants)
      ? p.installation.entitlementGrants
      : [];
    let max = 1;
    for (const g of grants) {
      const s = Math.max(parseInt(g?.seats ?? 1, 10) || 1, 1);
      if (s > max) max = s;
    }
    return max;
  })();

  return Math.max(fromLines || 1, fromGrants || 1);
}

function countActiveDevices(ent) {
  const devs = Array.isArray(ent?.devices) ? ent.devices : [];
  const used = devs.filter((d) => !d?.revokedAt).length;
  if (used > 0) return used;
  // legacy fallback
  return ent?.deviceFingerprint ? 1 : 0;
}

function isEntExpired(ent) {
  if (!ent?.expiresAt) return false;
  const end = dayjs(ent.expiresAt).endOf("day");
  return end.isValid() && end.isBefore(dayjs());
}

function getDaysLeft(expiresAt) {
  if (!expiresAt) return null;
  const end = dayjs(expiresAt).endOf("day");
  if (!end.isValid()) return null;

  const now = dayjs();
  if (end.isBefore(now)) {
    const daysAgo = Math.ceil(now.diff(end, "hour") / 24);
    return -Math.max(daysAgo, 0);
  }

  const daysLeft = Math.ceil(end.diff(now, "hour") / 24);
  return Math.max(daysLeft, 0);
}

function timeLeftBadge(expiresAt) {
  const d = getDaysLeft(expiresAt);
  if (d == null) return <span className="text-xs text-slate-500">—</span>;

  if (d < 0) return <Badge label={`Expired ${Math.abs(d)}d`} tone="red" />;
  if (d === 0) return <Badge label="Expires today" tone="red" />;

  const tone = d <= 3 ? "red" : d <= 14 ? "yellow" : "green";
  return <Badge label={`${d}d left`} tone={tone} />;
}

function effectiveEntStatus(ent) {
  const raw = String(ent?.status || "").toLowerCase() || "active";
  if (raw === "disabled") return "disabled";
  if (isEntExpired(ent)) return "expired";
  if (raw === "expired") return "active";
  return raw;
}

function statusBadgeFrom(ent) {
  const st = effectiveEntStatus(ent);
  if (st === "expired") return <Badge label="Expired" tone="red" />;
  if (st === "disabled") return <Badge label="Disabled" tone="slate" />;
  if (st === "active") return <Badge label="Active" tone="green" />;
  return <Badge label={st || "Unknown"} tone="slate" />;
}

function getInstallState(p) {
  const inst = p?.installation || {};
  const status = String(inst.status || "").toLowerCase();
  const entApplied = inst.entitlementsApplied;
  const hasAppliedField = typeof entApplied === "boolean";

  if (status === "pending") return { label: "Pending", tone: "yellow" };
  if (status === "complete" && hasAppliedField && entApplied === false)
    return { label: "Completed but not applied", tone: "red" };
  if (!hasAppliedField || !status)
    return { label: "Legacy record", tone: "slate" };
  if (status === "complete" && entApplied === true)
    return { label: "Completed", tone: "green" };
  return { label: status || "Unknown", tone: "slate" };
}

function monthsFromLine(purchase, ln) {
  const interval = String(ln?.billingInterval || "monthly")
    .toLowerCase()
    .trim();
  const intervalMonths = interval === "yearly" ? 12 : 1;

  const explicitLineMonths = Number(
    ln?.months ??
      ln?.durationMonths ??
      ln?.requestedMonths ??
      ln?.approvedMonths ??
      0,
  );
  if (Number.isFinite(explicitLineMonths) && explicitLineMonths > 0) {
    return explicitLineMonths;
  }

  const hasPeriods = Object.prototype.hasOwnProperty.call(ln || {}, "periods");
  if (hasPeriods) {
    const p = Math.max(parseInt(ln?.periods ?? 1, 10) || 1, 1);
    return p * intervalMonths;
  }

  const rawQty = Math.max(parseInt(ln?.qty ?? 1, 10) || 1, 1);

  // legacy personal duration stored in qty
  const inferredLt = inferLicenseType(
    ln?.licenseType || purchase?.licenseType,
    rawQty,
    ln?.organizationName || purchase?.organization?.name,
  );
  if (inferredLt === "personal" && rawQty > 1) {
    return rawQty * intervalMonths;
  }

  const purchaseFallbackMonths = Number(
    purchase?.approvedMonths ?? purchase?.requestedMonths ?? 0,
  );
  if (Number.isFinite(purchaseFallbackMonths) && purchaseFallbackMonths > 0) {
    return purchaseFallbackMonths;
  }

  return intervalMonths; // default 1 interval
}

function formatGrants(p) {
  const grants = Array.isArray(p?.installation?.entitlementGrants)
    ? p.installation.entitlementGrants
    : [];

  if (!grants.length) return { text: "—", count: 0 };

  const agg = new Map();
  for (const g of grants) {
    const key = String(g?.productKey || "").trim();
    const months = Number(g?.months || 0);
    const seats = Math.max(parseInt(g?.seats ?? 1, 10) || 1, 1);
    if (!key) continue;

    const cur = agg.get(key) || { months: 0, seats: 1 };
    cur.months += months > 0 ? months : 0;
    cur.seats = Math.max(cur.seats, seats);
    agg.set(key, cur);
  }

  const parts = Array.from(agg.entries()).map(([k, v]) => {
    const bits = [];
    if (v.months) bits.push(`${v.months}mo`);
    if (v.seats && v.seats !== 1) bits.push(`${v.seats} seats`);
    return bits.length ? `${k} (${bits.join(" · ")})` : k;
  });

  return { text: parts.join(" · "), count: parts.length };
}

/* ------------------ Devices Modal ------------------ */

function DevicesModal({
  open,
  onClose,
  email,
  productKey,
  token,
  refreshParent,
  setMsg,
}) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [data, setData] = React.useState(null);

  async function load() {
    if (!open || !email || !productKey) return;
    setLoading(true);
    setErr("");
    try {
      const res = await apiAuthed(
        `/admin/users/devices?email=${encodeURIComponent(email)}&productKey=${encodeURIComponent(productKey)}`,
        { token },
      );
      setData(res);
    } catch (e) {
      setErr(e?.message || "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, email, productKey]);

  if (!open) return null;

  const seats = data?.seats || 1;
  const seatsUsed = data?.seatsUsed || 0;
  const devices = Array.isArray(data?.devices) ? data.devices : [];

  async function revoke(fp) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/device/revoke`, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey, fingerprint: fp }),
      });
      await load();
      await refreshParent?.();
      setMsg("Device revoked");
    } catch (e) {
      setMsg(e?.message || "Failed to revoke");
    }
  }

  async function del(fp) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/device/delete`, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey, fingerprint: fp }),
      });
      await load();
      await refreshParent?.();
      setMsg("Device deleted");
    } catch (e) {
      setMsg(e?.message || "Failed to delete");
    }
  }

  async function resetAll() {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/reset-device`, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey }),
      });
      await load();
      await refreshParent?.();
      setMsg("All devices reset");
    } catch (e) {
      setMsg(e?.message || "Failed to reset devices");
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">Devices</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {email} · {productKey} · {seatsUsed}/{seats} used
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn btn-sm" onClick={resetAll}>
                Reset all
              </button>
              <button className="btn btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : err ? (
              <div className="text-sm text-red-600">{err}</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-slate-600">
                No devices bound yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-600">
                    <tr className="border-b">
                      <th className="py-2 pr-3">Fingerprint</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Bound</th>
                      <th className="py-2 pr-3">Last seen</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => {
                      const revoked = !!d.revokedAt;
                      return (
                        <tr key={d.fingerprint} className="border-b">
                          <td className="py-2 pr-3 font-mono text-xs break-all">
                            {d.fingerprint}
                          </td>
                          <td className="py-2 pr-3">{d.name || "—"}</td>
                          <td className="py-2 pr-3">
                            {d.boundAt
                              ? dayjs(d.boundAt).format("YYYY-MM-DD HH:mm")
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {d.lastSeenAt
                              ? dayjs(d.lastSeenAt).format("YYYY-MM-DD HH:mm")
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {revoked ? (
                              <Badge label="Revoked" tone="red" />
                            ) : (
                              <Badge label="Active" tone="green" />
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-2 justify-end">
                              {!revoked && (
                                <button
                                  className="btn btn-sm"
                                  onClick={() => revoke(d.fingerprint)}
                                >
                                  Revoke
                                </button>
                              )}
                              <button
                                className="btn btn-sm"
                                onClick={() => {
                                  const ok = window.confirm(
                                    "Delete this device record?",
                                  );
                                  if (ok) del(d.fingerprint);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t text-xs text-slate-500">
            Tip: “Revoke” keeps history but frees a seat. “Delete” removes the
            record completely.
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({ open, url, title, onClose }) {
  if (!open) return null;

  const cleanUrl = String(url || "");
  const base = cleanUrl.split("?")[0];
  const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(base);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">Payment Receipt</div>
              {title ? (
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {title}
                </div>
              ) : null}
            </div>

            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="p-4">
            {!cleanUrl ? (
              <div className="text-sm text-slate-600">No receipt found.</div>
            ) : isImage ? (
              <img
                src={cleanUrl}
                alt="Receipt"
                className="w-full h-auto rounded-lg border"
                style={{ maxHeight: "70vh", objectFit: "contain" }}
              />
            ) : (
              <iframe
                title="Receipt"
                src={cleanUrl}
                className="w-full rounded-lg border"
                style={{ height: "70vh" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------ main page ------------------ */

export default function Admin() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = React.useState("pending");
  const [users, setUsers] = React.useState([]);
  const [purchases, setPurchases] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [installations, setInstallations] = React.useState([]);

  // ✅ Expiry reminder job (manual trigger)
  const [expiryJobBusy, setExpiryJobBusy] = React.useState(false);
  const [expiryDryRun, setExpiryDryRun] = React.useState(false); // optional safety toggle
  const [expiryLimit, setExpiryLimit] = React.useState(0); // optional: 0 = no limit
  const [expiryLast, setExpiryLast] = React.useState(null); // store last result

  // pTrainings
  const [ptrainings, setPTrainings] = React.useState([]);
  const [trainingEnrollments, setTrainingEnrollments] = React.useState([]);
  const [ptTrainingFilter, setPtTrainingFilter] = React.useState("all"); // trainingId or "all"
  const [ptShowAllEnrollments, setPtShowAllEnrollments] = React.useState(false);
  const [ptBusy, setPtBusy] = React.useState({});

  const [receiptModal, setReceiptModal] = React.useState({
    open: false,
    url: "",
    title: "",
  });

  const [devicesModal, setDevicesModal] = React.useState({
    open: false,
    email: "",
    productKey: "",
  });

  // ── Training Locations state ──
  const [tLocations, setTLocations] = React.useState([]);
  const [tLocBusy, setTLocBusy] = React.useState(false);
  const [tLocMsg, setTLocMsg] = React.useState("");
  const [tLocForm, setTLocForm] = React.useState(null); // null = closed, {} = new, {_id} = edit
  const [trainingDateModal, setTrainingDateModal] = React.useState({ open: false, purchaseId: null });
  const [trainingDateVal, setTrainingDateVal] = React.useState("");
  const [trainingEndDateVal, setTrainingEndDateVal] = React.useState("");

  // ── Settings state ──
  const [settingsMobileAppUrl, setSettingsMobileAppUrl] = React.useState("");
  const [settingsMobileAppDraft, setSettingsMobileAppDraft] = React.useState("");
  const [settingsBusy, setSettingsBusy] = React.useState(false);
  const [settingsMsg, setSettingsMsg] = React.useState("");

  // ── Installer Hub state ──
  const [ihUrl, setIhUrl] = React.useState("");
  const [ihUrlDraft, setIhUrlDraft] = React.useState("");
  const [ihVideoUrl, setIhVideoUrl] = React.useState("");
  const [ihVideoDraft, setIhVideoDraft] = React.useState("");
  const [ihBusy, setIhBusy] = React.useState(false);
  const [ihMsg, setIhMsg] = React.useState("");
  const [ihUploadProg, setIhUploadProg] = React.useState(0);

  // ── VAT state ──
  const [vatEnabled, setVatEnabled] = React.useState(false);
  const [vatPercent, setVatPercent] = React.useState(0);
  const [vatLabel, setVatLabel] = React.useState("VAT");
  const [vatApplyPurchases, setVatApplyPurchases] = React.useState(true);
  const [vatApplyQuotes, setVatApplyQuotes] = React.useState(true);
  const [vatApplyInvoices, setVatApplyInvoices] = React.useState(true);
  const [vatBusy, setVatBusy] = React.useState(false);
  const [vatMsg, setVatMsg] = React.useState("");

  // ── Classrooms state ──
  const [classrooms, setClassrooms] = React.useState([]);
  const [classroomBusy, setClassroomBusy] = React.useState(false);
  const [classroomMsg, setClassroomMsg] = React.useState("");
  const [classroomModalOpen, setClassroomModalOpen] = React.useState(false);
  const [classroomDraft, setClassroomDraft] = React.useState({
    userId: "",
    userLabel: "",
    title: "",
    description: "",
    classroomCode: "",
    classroomUrl: "",
    companyName: "",
  });
  const [classroomQuery, setClassroomQuery] = React.useState("");
  const [classroomSuggestions, setClassroomSuggestions] = React.useState([]);
  const [classroomSearching, setClassroomSearching] = React.useState(false);

  const loadClassrooms = React.useCallback(async () => {
    try {
      const res = await apiAuthed("/admin/classrooms?includeInactive=true", {
        token: accessToken,
      });
      setClassrooms(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setClassroomMsg(e?.message || "Failed to load classrooms");
    }
  }, [accessToken]);

  React.useEffect(() => {
    if (tab === "classrooms" && accessToken) loadClassrooms();
  }, [tab, accessToken, loadClassrooms]);

  // Debounced user autocomplete for the "create classroom" modal.
  React.useEffect(() => {
    if (!classroomModalOpen) return;
    const q = classroomQuery.trim();
    if (q.length < 2) {
      setClassroomSuggestions([]);
      return;
    }
    let cancelled = false;
    setClassroomSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiAuthed(
          `/admin/classrooms/users-suggest?q=${encodeURIComponent(q)}`,
          { token: accessToken },
        );
        if (!cancelled) setClassroomSuggestions(Array.isArray(res?.users) ? res.users : []);
      } catch {
        if (!cancelled) setClassroomSuggestions([]);
      } finally {
        if (!cancelled) setClassroomSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [classroomQuery, classroomModalOpen, accessToken]);

  function pickClassroomUser(u) {
    setClassroomDraft((p) => ({
      ...p,
      userId: u._id,
      userLabel: `${u.name || u.email}${u.email && u.name ? ` <${u.email}>` : ""}`,
    }));
    setClassroomQuery("");
    setClassroomSuggestions([]);
  }

  async function createClassroom() {
    if (!classroomDraft.userId) {
      setClassroomMsg("Pick a user first.");
      return;
    }
    if (!classroomDraft.title.trim()) {
      setClassroomMsg("Title is required.");
      return;
    }
    setClassroomBusy(true);
    setClassroomMsg("");
    try {
      await apiAuthed("/admin/classrooms", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: classroomDraft.userId,
          title: classroomDraft.title.trim(),
          description: classroomDraft.description.trim(),
          classroomCode: classroomDraft.classroomCode.trim(),
          classroomUrl: classroomDraft.classroomUrl.trim(),
          companyName: classroomDraft.companyName.trim(),
        }),
      });
      setClassroomModalOpen(false);
      setClassroomDraft({
        userId: "",
        userLabel: "",
        title: "",
        description: "",
        classroomCode: "",
        classroomUrl: "",
        companyName: "",
      });
      setClassroomMsg("Classroom created and granted to user.");
      await loadClassrooms();
    } catch (e) {
      setClassroomMsg(e?.message || "Failed to create classroom");
    } finally {
      setClassroomBusy(false);
    }
  }

  async function revokeClassroom(id) {
    if (!confirm("Revoke this classroom from the user? This cannot be undone.")) return;
    try {
      await apiAuthed(`/admin/classrooms/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      await loadClassrooms();
    } catch (e) {
      setClassroomMsg(e?.message || "Failed to revoke");
    }
  }

  // ── Force-reinstall broadcast state ──
  const [frActive, setFrActive] = React.useState(false);
  const [frMessage, setFrMessage] = React.useState("");
  const [frTriggeredAt, setFrTriggeredAt] = React.useState(null);
  const [frConfirmOpen, setFrConfirmOpen] = React.useState(false);
  const [frConfirmText, setFrConfirmText] = React.useState("");
  const [frCustomMessage, setFrCustomMessage] = React.useState("");
  const [frBusy, setFrBusy] = React.useState(false);
  const [frMsg, setFrMsg] = React.useState("");
  const [frResult, setFrResult] = React.useState(null);

  const loadSettings = React.useCallback(async () => {
    try {
      const [mobileData, ihData, frData, vatData] = await Promise.all([
        apiAuthed("/admin/settings/mobile-app-url", { token: accessToken }),
        apiAuthed("/admin/settings/installer-hub", { token: accessToken }),
        apiAuthed("/admin/settings/force-reinstall", { token: accessToken }),
        apiAuthed("/admin/settings/vat", { token: accessToken }),
      ]);
      const url = mobileData?.mobileAppUrl || "";
      setSettingsMobileAppUrl(url);
      setSettingsMobileAppDraft(url);

      setIhUrl(ihData?.installerHubUrl || "");
      setIhUrlDraft(ihData?.installerHubUrl || "");
      setIhVideoUrl(ihData?.installerHubVideoUrl || "");
      setIhVideoDraft(ihData?.installerHubVideoUrl || "");

      setFrActive(!!frData?.active);
      setFrMessage(frData?.message || "");
      setFrTriggeredAt(frData?.triggeredAt || null);

      setVatEnabled(!!vatData?.vatEnabled);
      setVatPercent(Number(vatData?.vatPercent || 0));
      setVatLabel(vatData?.vatLabel || "VAT");
      setVatApplyPurchases(vatData?.vatApplyToPurchases !== false);
      setVatApplyQuotes(vatData?.vatApplyToQuotes !== false);
      setVatApplyInvoices(vatData?.vatApplyToInvoices !== false);
    } catch { /* ignore */ }
  }, [accessToken]);

  const saveVat = async () => {
    setVatBusy(true);
    setVatMsg("");
    try {
      await apiAuthed("/admin/settings/vat", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vatEnabled,
          vatPercent,
          vatLabel,
          vatApplyToPurchases: vatApplyPurchases,
          vatApplyToQuotes: vatApplyQuotes,
          vatApplyToInvoices: vatApplyInvoices,
        }),
      });
      setVatMsg("VAT settings saved.");
    } catch (e) {
      setVatMsg(e?.message || "Failed to save VAT settings.");
    } finally {
      setVatBusy(false);
    }
  };

  // load settings when switching to settings tab
  React.useEffect(() => {
    if (tab === "settings" && accessToken) loadSettings();
  }, [tab, accessToken, loadSettings]);

  // ── Training Locations helpers ──
  const loadTLocations = React.useCallback(async () => {
    try {
      const data = await apiAuthed("/admin/training-locations", { token: accessToken });
      setTLocations(Array.isArray(data?.locations) ? data.locations : []);
    } catch { /* ignore */ }
  }, [accessToken]);

  React.useEffect(() => {
    if (tab === "tlocations" && accessToken) loadTLocations();
  }, [tab, accessToken, loadTLocations]);

  async function saveTLocation() {
    if (!tLocForm) return;
    setTLocBusy(true);
    setTLocMsg("");
    try {
      const isEdit = !!tLocForm._id;
      await apiAuthed(
        isEdit ? `/admin/training-locations/${tLocForm._id}` : "/admin/training-locations",
        {
          token: accessToken,
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tLocForm),
        },
      );
      setTLocForm(null);
      await loadTLocations();
      setTLocMsg(isEdit ? "Location updated" : "Location created");
    } catch (e) {
      setTLocMsg(e.message || "Save failed");
    } finally {
      setTLocBusy(false);
    }
  }

  async function deleteTLocation(id) {
    if (!confirm("Delete this training location?")) return;
    try {
      await apiAuthed(`/admin/training-locations/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      await loadTLocations();
    } catch (e) {
      setTLocMsg(e.message || "Delete failed");
    }
  }

  async function proposeTrainingDate(purchaseId) {
    if (!trainingDateVal) return;
    setTLocBusy(true);
    try {
      await apiAuthed(`/admin/purchases/${purchaseId}/propose-training-date`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate: trainingDateVal,
          scheduledEndDate: trainingEndDateVal || null,
        }),
      });
      setTrainingDateModal({ open: false, purchaseId: null });
      setTrainingDateVal("");
      setTrainingEndDateVal("");
      setMsg("Training date proposed and user notified!");
      load();
    } catch (e) {
      setMsg(e.message || "Failed to propose date");
    } finally {
      setTLocBusy(false);
    }
  }

  async function completeTraining(purchaseId) {
    try {
      await apiAuthed(`/admin/purchases/${purchaseId}/complete-training`, {
        token: accessToken,
        method: "POST",
      });
      setMsg("Training marked as completed");
      load();
    } catch (e) {
      setMsg(e.message || "Failed");
    }
  }

  const saveMobileAppUrl = async () => {
    setSettingsBusy(true);
    setSettingsMsg("");
    try {
      await apiAuthed("/admin/settings/mobile-app-url", {
        token: accessToken,
        method: "POST",
        body: { mobileAppUrl: settingsMobileAppDraft },
      });
      setSettingsMobileAppUrl(settingsMobileAppDraft);
      setSettingsMsg("Mobile app URL saved!");
    } catch (e) {
      setSettingsMsg(e?.message || "Failed to save");
    } finally {
      setSettingsBusy(false);
    }
  };

  const saveInstallerHub = async () => {
    setIhBusy(true);
    setIhMsg("");
    try {
      await apiAuthed("/admin/settings/installer-hub", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installerHubUrl: ihUrlDraft,
          installerHubVideoUrl: ihVideoDraft,
        }),
      });
      setIhUrl(ihUrlDraft);
      setIhVideoUrl(ihVideoDraft);
      setIhMsg("Installer Hub settings saved!");
    } catch (e) {
      setIhMsg(e?.message || "Failed to save");
    } finally {
      setIhBusy(false);
    }
  };

  const triggerForceReinstall = async () => {
    setFrBusy(true);
    setFrMsg("");
    setFrResult(null);
    try {
      const data = await apiAuthed("/admin/settings/force-reinstall", {
        token: accessToken,
        method: "POST",
        body: { message: frCustomMessage.trim() || undefined },
      });
      setFrActive(true);
      setFrMessage(data?.message || "");
      setFrTriggeredAt(data?.triggeredAt || new Date().toISOString());
      setFrResult({
        usersTouched: data?.usersTouched ?? 0,
        devicesRevoked: data?.devicesRevoked ?? 0,
      });
      setFrMsg("Global reinstall triggered.");
      setFrConfirmOpen(false);
      setFrConfirmText("");
    } catch (e) {
      setFrMsg(e?.message || "Failed to trigger");
    } finally {
      setFrBusy(false);
    }
  };

  const clearForceReinstall = async () => {
    if (!confirm("Clear the global reinstall banner? Devices already revoked stay revoked.")) return;
    setFrBusy(true);
    setFrMsg("");
    try {
      await apiAuthed("/admin/settings/force-reinstall/clear", {
        token: accessToken,
        method: "POST",
      });
      setFrActive(false);
      setFrMsg("Banner cleared.");
    } catch (e) {
      setFrMsg(e?.message || "Failed to clear");
    } finally {
      setFrBusy(false);
    }
  };

  function handleIhVideoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIhUploadProg(1);

    const TEN_MB = 10 * 1024 * 1024;
    const isLarge = file.size > TEN_MB;

    // Use apiAuthed for server-side upload (handles API_BASE + auth)
    const doUpload = async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (!isLarge) fd.append("resourceType", "video");

        const endpoint = isLarge ? "/admin/media/upload-video-r2" : "/admin/media/upload-file";
        const res = await apiAuthed(endpoint, {
          token: accessToken,
          method: "POST",
          body: fd,
        });
        if (res?.secure_url) {
          setIhVideoDraft(res.secure_url);
          setIhMsg("Video uploaded! Click Save to apply.");
        } else {
          setIhMsg("Upload failed — no URL returned");
        }
      } catch (err) {
        setIhMsg(err?.message || "Upload failed");
      } finally {
        setIhUploadProg(0);
      }
    };
    doUpload();
  }

  function handleIhInstallerUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIhUploadProg(1);

    (async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiAuthed("/admin/media/upload-installer", {
          token: accessToken,
          method: "POST",
          body: fd,
        });
        if (res?.secure_url) {
          setIhUrlDraft(res.secure_url);
          setIhMsg(
            `Installer uploaded (${res.storageProvider || "cloud"}, SHA-256 ${(res.sha256 || "").slice(0, 12)}…). Click Save to apply.`,
          );
        } else {
          setIhMsg("Upload failed — no URL returned");
        }
      } catch (err) {
        setIhMsg(err?.message || "Installer upload failed");
      } finally {
        setIhUploadProg(0);
      }
    })();
  }

  function handleApkUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setSettingsBusy(true);
    setSettingsMsg("Uploading APK…");

    (async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiAuthed("/admin/media/upload-apk", {
          token: accessToken,
          method: "POST",
          body: fd,
        });
        if (res?.secure_url) {
          setSettingsMobileAppDraft(res.secure_url);
          setSettingsMsg(
            `APK uploaded (SHA-256 ${(res.sha256 || "").slice(0, 12)}…). Click Save to apply.`,
          );
        } else {
          setSettingsMsg("Upload failed — no URL returned");
        }
      } catch (err) {
        setSettingsMsg(err?.message || "APK upload failed");
      } finally {
        setSettingsBusy(false);
      }
    })();
  }

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const [uRes, pRes, iRes, tRes, teRes] = await Promise.all([
        apiAuthed(`/admin/users${qs}`, { token: accessToken }),
        apiAuthed(`/admin/purchases?status=pending`, { token: accessToken }),
        apiAuthed(`/admin/installations?view=all`, { token: accessToken }),
        apiAuthed(`/admin/ptrainings/events`, { token: accessToken }),
        apiAuthed(`/admin/ptrainings/enrollments`, { token: accessToken }),
      ]);

      setUsers(uRes || []);
      setInstallations(iRes || []);
      setPurchases(pRes || []);

      setPTrainings(Array.isArray(tRes) ? tRes : tRes?.data || []);
      setTrainingEnrollments(teRes || []);
    } catch (e) {
      setMsg(e?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function runExpiryRemindersNow() {
    setMsg("");

    // Safety prompt when NOT dry-running
    if (!expiryDryRun) {
      const ok = window.confirm(
        "Send subscription expiry/reminder emails now?\n\nThis may email many users.",
      );
      if (!ok) return;
    }

    setExpiryJobBusy(true);
    try {
      const body = {
        dryRun: !!expiryDryRun,
        limit: Number(expiryLimit || 0) || 0,
      };

      const out = await apiAuthed(`/admin/jobs/expiry-notifier/run`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setExpiryLast(out);

      if (out?.skipped && out?.reason === "lock-held") {
        setMsg(
          "Expiry job skipped: another run is currently in progress (lock held). Try again in a few minutes.",
        );
        return;
      }

      if (out?.ok) {
        const mode = out?.dryRun ? "DRY RUN" : "SENT";
        setMsg(
          `Expiry reminders ${mode}: ${out?.sent ?? 0} email(s). Scanned users: ${out?.scannedUsers ?? 0}. Errors: ${out?.errors ?? 0}.`,
        );
      } else {
        setMsg(out?.error || "Failed to run expiry notifier job");
      }
    } catch (e) {
      setMsg(
        e?.data?.error || e?.message || "Failed to run expiry notifier job",
      );
    } finally {
      setExpiryJobBusy(false);
    }
  }

  async function deleteTrainingEvent(trainingId) {
    setMsg("");
    try {
      await apiAuthed(`/admin/ptrainings/events/${trainingId}`, {
        token: accessToken,
        method: "DELETE",
      });

      if (String(ptTrainingFilter) === String(trainingId)) {
        setPtTrainingFilter("all");
      }

      await load();
      setMsg("Training deleted");
    } catch (e) {
      setMsg(e?.message || "Failed to delete training");
    }
  }

  function goNewTraining() {
    navigate(`${PTRAININGS_ADMIN_ROUTE}?new=1`);
  }

  function goEditTraining(id) {
    navigate(`${PTRAININGS_ADMIN_ROUTE}?eventId=${encodeURIComponent(id)}`);
  }

  const ptPendingCount = React.useMemo(() => {
    const rows = Array.isArray(trainingEnrollments) ? trainingEnrollments : [];
    let n = 0;

    for (const e of rows) {
      const st = String(e?.status || "").toLowerCase();
      if (st === "approved" || st === "rejected") continue;

      const payState = String(
        e?.paymentState || e?.payment?.raw?.state || e?.payment?.state || "",
      ).toLowerCase();

      const receiptUrl =
        e?.receiptUrl ||
        e?.payment?.receiptUrl ||
        e?.payment?.raw?.receiptUrl ||
        "";

      const hasSubmitted =
        payState === "submitted" ||
        !!receiptUrl ||
        !!e?.payerReference ||
        !!e?.payment?.reference ||
        !!e?.payerNote ||
        !!e?.payment?.note;

      if (hasSubmitted) n += 1;
    }

    return n;
  }, [trainingEnrollments]);

  async function deleteEntitlement(email, productKey) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/entitlement/delete`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey }),
      });
      await load();
      setMsg(`Entitlement deleted for ${productKey}`);
    } catch (e) {
      setMsg(e?.message || "Failed to delete entitlement");
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function updateEntitlement(email, productKey, months = 0, status) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/entitlement`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productKey, months, status }),
      });
      await load();
      setMsg("Entitlement updated");
    } catch (e) {
      setMsg(e?.message || "Failed to update entitlement");
    }
  }

  async function setDisabled(email, disabled) {
    setMsg("");
    try {
      await apiAuthed(`/admin/users/disable`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, disabled }),
      });
      await load();
      setMsg("User status updated");
    } catch (e) {
      setMsg(e?.message || "Failed to update user status");
    }
  }

  async function approvePurchase(id, months) {
    setMsg("");
    try {
      const bodyObj =
        typeof months === "number" && Number.isFinite(months) && months > 0
          ? { months }
          : {};

      const res = await apiAuthed(`/admin/purchases/${id}/approve`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });

      await load();
      setMsg(res?.message || "Purchase approved");
    } catch (e) {
      setMsg(e?.message || "Failed to approve purchase");
    }
  }

  async function rejectPurchase(id) {
    setMsg("");
    try {
      await apiAuthed(`/admin/purchases/${id}/reject`, {
        token: accessToken,
        method: "POST",
      });
      await load();
      setMsg("Purchase rejected");
    } catch (e) {
      setMsg(e?.message || "Failed to reject purchase");
    }
  }

  async function markTrainingInstallationComplete(enrollmentId) {
    setMsg("");
    setPtBusy((s) => ({ ...s, [`inst-${enrollmentId}`]: true }));

    try {
      const res = await apiAuthed(
        `/admin/ptrainings/enrollments/${enrollmentId}/installation-complete`,
        { token: accessToken, method: "PATCH" },
      );

      await load();
      setMsg(res?.message || "Installation marked complete");
    } catch (e) {
      setMsg(
        e?.data?.error || e?.message || "Failed to mark installation complete",
      );
    } finally {
      setPtBusy((s) => {
        const n = { ...s };
        delete n[`inst-${enrollmentId}`];
        return n;
      });
    }
  }

  // ✅ Active subscriptions view: ONLY active + not expired
  const activeRows = React.useMemo(() => {
    const rows = [];
    (users || []).forEach((u) => {
      (u.entitlements || []).forEach((e) => {
        const status = String(e?.status || "").toLowerCase();
        if (status !== "active") return;
        if (isEntExpired(e)) return;

        const seats = Math.max(Number(e?.seats || 1), 1);
        const lt = inferLicenseType(e?.licenseType, seats, e?.organizationName);
        const orgName =
          lt === "organization" ? String(e?.organizationName || "").trim() : "";

        rows.push({
          email: u.email,
          username: u.username,
          productKey: e.productKey,
          expiresAt: e.expiresAt,
          status: e.status,
          seats,
          licenseType: lt,
          organizationName: orgName,
          seatsUsed: countActiveDevices(e),
        });
      });
    });

    const rx = q ? new RegExp(q, "i") : null;
    return rx
      ? rows.filter(
          (r) =>
            rx.test(r.email || "") ||
            rx.test(r.username || "") ||
            rx.test(r.productKey || ""),
        )
      : rows;
  }, [users, q]);

  // ✅ All subscriptions view: active + expired + disabled
  const allRows = React.useMemo(() => {
    const rows = [];
    (users || []).forEach((u) => {
      (u.entitlements || []).forEach((e) => {
        const seats = Math.max(Number(e?.seats || 1), 1);
        const lt = inferLicenseType(e?.licenseType, seats, e?.organizationName);
        const orgName =
          lt === "organization" ? String(e?.organizationName || "").trim() : "";

        const effStatus = effectiveEntStatus(e);
        const daysLeft = getDaysLeft(e?.expiresAt);

        rows.push({
          email: u.email,
          username: u.username,
          userDisabled: !!u.disabled,

          productKey: e.productKey,
          expiresAt: e.expiresAt,
          rawStatus: e.status,
          status: effStatus,

          seats,
          licenseType: lt,
          organizationName: orgName,
          seatsUsed: countActiveDevices(e),

          daysLeft,
        });
      });
    });

    const rx = q ? new RegExp(q, "i") : null;
    const filtered = rx
      ? rows.filter(
          (r) =>
            rx.test(r.email || "") ||
            rx.test(r.username || "") ||
            rx.test(r.productKey || ""),
        )
      : rows;

    return [...filtered].sort((a, b) => {
      const ad =
        typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
      const bd =
        typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
      const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      if (ax !== bx) return ax - bx;
      return String(a.email || "").localeCompare(String(b.email || ""));
    });
  }, [users, q]);

  async function approveTrainingEnrollment(enrollmentId) {
    setMsg("");
    setPtBusy((s) => ({ ...s, [enrollmentId]: true }));

    try {
      const res = await apiAuthed(
        `/admin/ptrainings/enrollments/${enrollmentId}/approve`,
        {
          token: accessToken,
          method: "PATCH",
        },
      );

      await load();
      setMsg(res?.message || "Training enrollment approved");
    } catch (e) {
      setMsg(
        e?.data?.error || e?.message || "Failed to approve training enrollment",
      );
    } finally {
      setPtBusy((s) => {
        const n = { ...s };
        delete n[enrollmentId];
        return n;
      });
    }
  }

  async function rejectTrainingEnrollment(enrollmentId) {
    setMsg("");
    try {
      const res = await apiAuthed(
        `/admin/ptrainings/enrollments/${enrollmentId}/reject`,
        {
          token: accessToken,
          method: "PATCH",
        },
      );
      await load();
      setMsg(res?.message || "Training enrollment rejected");
    } catch (e) {
      setMsg(e?.message || "Failed to reject training enrollment");
    }
  }

  function ActiveSubscriptionsByProduct({
    productKeys,
    productMap,
    users,
    setDisabled,
    updateEntitlement,
    accessToken,
    load,
    setMsg,
    deleteEntitlement,
    onOpenDevices,
  }) {
    const [activeProduct, setActiveProduct] = React.useState(
      productKeys[0] || "",
    );

    React.useEffect(() => {
      if (!productKeys.includes(activeProduct))
        setActiveProduct(productKeys[0] || "");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productKeys.join("|")]);

    const rows = React.useMemo(
      () => productMap.get(activeProduct) || [],
      [productMap, activeProduct],
    );

    const sortedRows = [...rows].sort((a, b) => {
      const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
      const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      if (ax !== bx) return ax - bx;
      return String(a.email || "").localeCompare(String(b.email || ""));
    });

    const userByEmail = React.useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) =>
        m.set(String(u.email || "").toLowerCase(), u),
      );
      return m;
    }, [users]);

    const totals = React.useMemo(() => {
      const t = { subs: 0, seats: 0, used: 0 };
      for (const r of rows) {
        t.subs += 1;
        t.seats += Math.max(Number(r.seats || 1), 1);
        t.used += Math.max(Number(r.seatsUsed || 0), 0);
      }
      return t;
    }, [rows]);

    return (
      <div className="space-y-4">
        <div className="border-b">
          <nav className="flex gap-3 flex-wrap">
            {productKeys.map((pk) => {
              const list = productMap.get(pk) || [];
              const subs = list.length;
              const seats = list.reduce(
                (acc, r) => acc + Math.max(Number(r.seats || 1), 1),
                0,
              );
              const used = list.reduce(
                (acc, r) => acc + Math.max(Number(r.seatsUsed || 0), 0),
                0,
              );

              const active = pk === activeProduct;
              return (
                <button
                  key={pk}
                  onClick={() => setActiveProduct(pk)}
                  className={`py-2 -mb-px border-b-2 transition text-sm ${
                    active
                      ? "border-adlm-blue-700 text-adlm-blue-700"
                      : "border-transparent text-slate-600 hover:text-slate-800"
                  }`}
                  title={`${subs} subscriptions · ${seats} seats · ${used} devices used`}
                >
                  {pk} <span className="text-slate-400">({subs})</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Subscription</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">Time left</th>
                <th className="py-2 pr-3">Devices</th>
                <th className="py-2 pr-3">Renewal</th>
                <th className="py-2 pr-3">Entitlement</th>
                <th className="py-2 pr-3">User Status</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((r, i) => {
                const u =
                  userByEmail.get(String(r.email || "").toLowerCase()) || {};
                const disabledUser = !!u.disabled;

                const selId = `renew-${activeProduct}-${i}`;

                return (
                  <tr
                    key={`${r.email}-${r.productKey}-${i}`}
                    className={`border-b ${disabledUser ? "opacity-60" : ""}`}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-medium">{r.email}</div>
                      <div className="text-xs text-slate-500">
                        {u.username ? `@${u.username} · ` : ""}
                        {u.role ? `Role: ${u.role}` : ""}
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <OrganizationBadge
                        licenseType={r.licenseType}
                        organizationName={r.organizationName}
                        seats={r.seats}
                      />
                    </td>

                    <td className="py-3 pr-3">
                      {r.expiresAt
                        ? dayjs(r.expiresAt).format("YYYY-MM-DD")
                        : "-"}
                    </td>

                    <td className="py-3 pr-3">{timeLeftBadge(r.expiresAt)}</td>

                    <td className="py-3 pr-3">
                      <div className="text-xs text-slate-700">
                        <b>{r.seatsUsed}</b> / {r.seats} used
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button
                          className="btn btn-sm"
                          onClick={() => onOpenDevices(r.email, r.productKey)}
                          title="View bound devices"
                        >
                          View
                        </button>

                        <button
                          className="btn btn-sm"
                          title="Reset all devices for this entitlement"
                          onClick={async () => {
                            setMsg("");
                            try {
                              await apiAuthed(`/admin/users/reset-device`, {
                                token: accessToken,
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  email: r.email,
                                  productKey: r.productKey,
                                }),
                              });
                              await load();
                              setMsg(`Device lock reset for ${r.productKey}`);
                            } catch (err) {
                              setMsg(err?.message || "Failed to reset device");
                            }
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <select id={selId} className="input max-w-[140px]">
                          {MONTH_CHOICES.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <button
                          className="btn btn-sm"
                          title="Renew selected period"
                          onClick={() =>
                            updateEntitlement(
                              r.email,
                              r.productKey,
                              Number(document.getElementById(selId).value),
                              "active",
                            )
                          }
                        >
                          Renew
                        </button>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm"
                          title="Disable this entitlement"
                          onClick={() =>
                            updateEntitlement(
                              r.email,
                              r.productKey,
                              0,
                              "disabled",
                            )
                          }
                        >
                          Disable
                        </button>

                        <button
                          className="btn btn-sm"
                          title="Permanently remove entitlement"
                          onClick={() => {
                            const ok = window.confirm(
                              `Delete entitlement ${r.productKey} for ${r.email}? This cannot be undone.`,
                            );
                            if (ok) deleteEntitlement(r.email, r.productKey);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">
                          {disabledUser ? "Disabled" : "Active"}
                        </span>

                        <button
                          className="btn btn-sm"
                          onClick={() => setDisabled(r.email, !disabledUser)}
                        >
                          {disabledUser ? "Enable" : "Disable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedRows.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-600" colSpan={8}>
                    No users found under this subscription.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-slate-500">
          Showing <b>{totals.subs}</b> active subscriptions for{" "}
          <b>{activeProduct}</b> · <b>{totals.seats}</b> seats total ·{" "}
          <b>{totals.used}</b> devices used.
        </div>
      </div>
    );
  }

  const [installSubTab, setInstallSubTab] = React.useState("pending");

  const sortedInstallations = React.useMemo(() => {
    const arr = Array.isArray(installations) ? [...installations] : [];
    arr.sort((a, b) => {
      const ax = a?.decidedAt ? new Date(a.decidedAt).getTime() : 0;
      const bx = b?.decidedAt ? new Date(b.decidedAt).getTime() : 0;
      if (ax !== bx) return bx - ax;
      const ac = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bc = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bc - ac;
    });
    return arr;
  }, [installations]);

  const pendingInstalls = React.useMemo(
    () => sortedInstallations.filter((p) => (p?.installation?.status || "pending") === "pending"),
    [sortedInstallations],
  );
  const completedInstalls = React.useMemo(
    () => sortedInstallations.filter((p) => p?.installation?.status === "complete"),
    [sortedInstallations],
  );
  const uninstalledInstalls = React.useMemo(
    () => sortedInstallations.filter((p) => p?.installation?.status === "uninstalled"),
    [sortedInstallations],
  );

  const pTrainingsSorted = React.useMemo(() => {
    const arr = Array.isArray(ptrainings) ? [...ptrainings] : [];
    arr.sort((a, b) => {
      const ax = a?.startAt ? new Date(a.startAt).getTime() : 0;
      const bx = b?.startAt ? new Date(b.startAt).getTime() : 0;
      return bx - ax;
    });
    return arr;
  }, [ptrainings]);

  const enrollmentsFiltered = React.useMemo(() => {
    const rows = Array.isArray(trainingEnrollments) ? trainingEnrollments : [];
    const rx = q ? new RegExp(q, "i") : null;

    return rows.filter((e) => {
      const trainingId =
        e?.training?._id || e?.trainingId || e?.ptrainingId || "";

      if (
        ptTrainingFilter !== "all" &&
        String(trainingId) !== String(ptTrainingFilter)
      ) {
        return false;
      }

      if (!ptShowAllEnrollments) {
        const st = String(e?.status || "").toLowerCase();
        if (st === "approved" || st === "rejected") return false;

        const payState = String(
          e?.paymentState || e?.payment?.raw?.state || e?.payment?.state || "",
        ).toLowerCase();

        const receiptUrl =
          e?.receiptUrl ||
          e?.payment?.receiptUrl ||
          e?.payment?.raw?.receiptUrl ||
          "";

        const hasSubmitted =
          payState === "submitted" ||
          !!receiptUrl ||
          !!e?.payerReference ||
          !!e?.payment?.reference ||
          !!e?.payerNote ||
          !!e?.payment?.note;

        if (!hasSubmitted) return false;
      }

      if (!rx) return true;

      const email = String(e?.email || e?.userEmail || e?.user?.email || "");
      const name =
        `${e?.firstName || e?.user?.firstName || ""} ${e?.lastName || e?.user?.lastName || ""}`.trim();
      const title = String(e?.training?.title || e?.trainingTitle || "");
      return rx.test(email) || rx.test(name) || rx.test(title);
    });
  }, [trainingEnrollments, ptTrainingFilter, ptShowAllEnrollments, q]);

  function trainingSeatBadge(t) {
    const cap = Math.max(
      Number(t?.capacityApproved ?? t?.capacity ?? 0) || 0,
      0,
    );

    const manualLeft =
      typeof t?.seatsLeft === "number" && Number.isFinite(t.seatsLeft)
        ? Math.max(Math.floor(t.seatsLeft), 0)
        : null;

    // If seatsLeft is provided by backend/admin, trust that manual value
    if (manualLeft != null) {
      const tone =
        manualLeft === 0 ? "red" : manualLeft <= 2 ? "yellow" : "green";
      return <Badge label={`${manualLeft} left`} tone={tone} />;
    }

    // Fallback display if no manual seatsLeft
    if (cap > 0) return <Badge label={`${cap} slots`} tone="blue" />;

    return <Badge label="—" tone="slate" />;
  }

  function pTrainingStatusBadge(st) {
    const s = String(st || "").toLowerCase();
    if (s === "approved") return <Badge label="Approved" tone="green" />;
    if (s === "rejected") return <Badge label="Rejected" tone="red" />;
    if (s === "pending") return <Badge label="Pending" tone="yellow" />;
    if (s === "submitted") return <Badge label="Submitted" tone="blue" />;
    return <Badge label={s || "—"} tone="slate" />;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Admin</h1>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input"
              placeholder="Search email / username / product…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <button className="btn btn-sm" onClick={load}>
              Refresh
            </button>

            {/* ✅ Expiry reminders button */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={expiryDryRun}
                  onChange={(e) => setExpiryDryRun(e.target.checked)}
                />
                Dry run
              </label>

              <input
                className="input w-[90px]"
                type="number"
                min="0"
                step="1"
                value={expiryLimit}
                onChange={(e) => setExpiryLimit(e.target.value)}
                placeholder="Limit"
                title="Optional: 0 means no limit. Use this to test safely."
              />

              <button
                className="btn btn-sm"
                disabled={expiryJobBusy}
                onClick={runExpiryRemindersNow}
                title="Manually trigger subscription expiry/reminder emails"
              >
                {expiryJobBusy
                  ? "Running…"
                  : expiryDryRun
                    ? "Run expiry (dry)"
                    : "Send expiry emails"}
              </button>
            </div>

            <button
              className="btn btn-sm"
              onClick={() => navigate("/admin/coupons")}
              title="Create / manage coupons"
            >
              AddCoupon
            </button>

            <button
              className="btn btn-sm"
              onClick={() => navigate("/admin/freebies")}
              title="Create / manage freebies"
            >
              AddFreebie
            </button>

            <button
              className="btn btn-sm"
              onClick={() => navigate("/admin/course-grading")}
              title="Grade submissions & mark course enrollments as complete"
            >
              Course Grading
            </button>

            <button
              className="btn btn-sm"
              onClick={() => navigate("/admin/invoices")}
              title="Create and manage invoices"
            >
              Invoices
            </button>
          </div>
        </div>

        {msg && <div className="text-sm mt-2">{msg}</div>}

        {expiryLast?.ok && (
          <div className="text-xs text-slate-500 mt-1">
            Last run: {expiryLast.dryRun ? "dry run" : "sent"} · scanned{" "}
            {expiryLast.scannedUsers ?? 0} · emails {expiryLast.sent ?? 0} ·
            errors {expiryLast.errors ?? 0}
          </div>
        )}
        <div className="mt-4 border-b">
          <nav className="flex gap-6 flex-wrap">
            <button
              onClick={() => setTab("pending")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "pending"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Pending ({purchases.length})
            </button>

            <button
              onClick={() => setTab("active")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "active"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Active subscriptions ({activeRows.length})
            </button>

            <button
              onClick={() => setTab("ptrainings")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "ptrainings"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                Physical Training
                {ptPendingCount > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    {ptPendingCount}
                  </span>
                ) : null}
              </span>
            </button>

            <button
              onClick={() => setTab("subscriptions")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "subscriptions"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
              title="Shows Active + Expired + Disabled entitlements"
            >
              Subscriptions ({allRows.length})
            </button>

            <button
              onClick={() => setTab("installations")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "installations"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Installations ({pendingInstalls.length})
            </button>

            <button
              onClick={() => setTab("tlocations")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "tlocations"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Training Locations
            </button>

            <button
              onClick={() => setTab("classrooms")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "classrooms"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Classrooms
            </button>

            <button
              onClick={() => setTab("settings")}
              className={`py-2 -mb-px border-b-2 transition ${
                tab === "settings"
                  ? "border-adlm-blue-700 text-adlm-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-800"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </div>

      {/* ------------------ pTrainings tab ------------------ */}
      {tab === "ptrainings" && (
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Physical Training</h2>
              <div className="text-xs text-slate-500 mt-1">
                Manage trainings and approve submitted payments + registrations.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn btn-sm" onClick={goNewTraining}>
                New Training
              </button>

              <button
                className="btn btn-sm"
                onClick={() => navigate(PTRAININGS_ADMIN_ROUTE)}
                title="Open full training editor"
              >
                Manage All
              </button>

              <button className="btn btn-sm" onClick={load}>
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Trainings list */}
              <div className="lg:col-span-1 border rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">Trainings</div>
                  <select
                    className="input max-w-[170px]"
                    value={ptTrainingFilter}
                    onChange={(e) => setPtTrainingFilter(e.target.value)}
                    title="Filter enrollments by training"
                  >
                    <option value="all">All</option>
                    {pTrainingsSorted.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.title || "Training"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 space-y-2">
                  {pTrainingsSorted.length === 0 ? (
                    <div className="text-sm text-slate-600">
                      No trainings yet. Click “New Training”.
                    </div>
                  ) : (
                    pTrainingsSorted.map((t) => {
                      const when = t?.startAt
                        ? dayjs(t.startAt).format("YYYY-MM-DD")
                        : "—";
                      const status = String(t?.status || "open").toLowerCase();
                      const selected =
                        String(ptTrainingFilter) === String(t._id);

                      return (
                        <div
                          key={t._id}
                          role="button"
                          tabIndex={0}
                          className={`w-full text-left border rounded p-3 hover:bg-slate-50 cursor-pointer ${
                            selected
                              ? "ring-2 ring-blue-200 border-blue-200"
                              : ""
                          }`}
                          onClick={() => setPtTrainingFilter(String(t._id))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPtTrainingFilter(String(t._id));
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {t.title || "Training"}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {when}
                                {t?.location?.name
                                  ? ` · ${t.location.name}`
                                  : t?.location
                                    ? ` · ${t.location}`
                                    : ""}
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {trainingSeatBadge(t)}
                              <Badge
                                label={status}
                                tone={
                                  status === "closed"
                                    ? "red"
                                    : status === "draft"
                                      ? "slate"
                                      : "green"
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2 justify-end flex-wrap">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                goEditTraining(t._id);
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const ok = window.confirm(
                                  "Delete this training?",
                                );
                                if (ok) deleteTrainingEvent(t._id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Enrollments */}
              <div className="lg:col-span-2 border rounded p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm">
                    Enrollments{" "}
                    <span className="text-slate-400">
                      ({enrollmentsFiltered.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ptShowAllEnrollments}
                        onChange={(e) =>
                          setPtShowAllEnrollments(e.target.checked)
                        }
                      />
                      Show all (incl. approved/rejected)
                    </label>
                  </div>
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  When “Show all” is OFF, you only see submitted proofs needing
                  review.
                </div>

                <div className="mt-3 space-y-2">
                  {enrollmentsFiltered.length === 0 ? (
                    <div className="text-sm text-slate-600">
                      No enrollments match your filter.
                    </div>
                  ) : (
                    enrollmentsFiltered.map((e) => {
                      const trainingTitle =
                        e?.training?.title || e?.trainingTitle || "Training";
                      const when = e?.training?.startAt
                        ? dayjs(e.training.startAt).format("YYYY-MM-DD")
                        : e?.training?.date
                          ? dayjs(e.training.date).format("YYYY-MM-DD")
                          : "—";

                      const userEmail =
                        e?.user?.email || e?.email || e?.userEmail || "—";

                      const firstName =
                        e?.user?.firstName || e?.firstName || "";

                      const payer =
                        `${e?.payerName || e?.payment?.payerName || ""}`.trim() ||
                        `${e?.firstName || ""} ${e?.lastName || ""}`.trim() ||
                        "—";

                      const receipt =
                        e?.receiptUrl ||
                        e?.payment?.receiptUrl ||
                        e?.payment?.raw?.receiptUrl ||
                        "";

                      const st = String(e?.status || "").toLowerCase();
                      const instSt = String(
                        e?.installation?.status || "pending",
                      ).toLowerCase();

                      const decidedAt = e?.decidedAt
                        ? dayjs(e.decidedAt).format("YYYY-MM-DD HH:mm")
                        : "";

                      return (
                        <div
                          key={e._id}
                          className="border rounded p-3 flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-medium truncate">
                                  {firstName ? `${firstName} · ` : ""}
                                  {userEmail}
                                </div>

                                {pTrainingStatusBadge(st)}

                                {/* ✅ show installation state ONLY when approved */}
                                {st === "approved" ? (
                                  <Badge
                                    label={`Install: ${instSt}`}
                                    tone={
                                      instSt === "complete" ? "green" : "yellow"
                                    }
                                  />
                                ) : null}

                                {decidedAt ? (
                                  <span className="text-xs text-slate-500">
                                    · {decidedAt}
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-xs text-slate-500 mt-1">
                                <b>{trainingTitle}</b> · {when}
                              </div>

                              <div className="mt-2 text-xs text-slate-600 space-y-1">
                                <div>
                                  Payer:{" "}
                                  <b className="text-slate-800">{payer}</b>
                                </div>
                                {e?.payment?.bankName ? (
                                  <div>
                                    Bank:{" "}
                                    <b className="text-slate-800">
                                      {e.payment.bankName}
                                    </b>
                                  </div>
                                ) : null}
                                {e?.payment?.reference ? (
                                  <div>
                                    Ref:{" "}
                                    <b className="text-slate-800">
                                      {e.payment.reference}
                                    </b>
                                  </div>
                                ) : null}
                                {e?.payment?.note ? (
                                  <div className="text-slate-700">
                                    Note: {e.payment.note}
                                  </div>
                                ) : null}
                              </div>

                              {receipt ? (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    className="text-sm font-semibold text-adlm-blue-700 hover:underline"
                                    onClick={() =>
                                      setReceiptModal({
                                        open: true,
                                        url: receipt,
                                        title: `${firstName || payer || "User"} · ${userEmail}`,
                                      })
                                    }
                                  >
                                    Show receipt
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="shrink-0 flex gap-2 flex-wrap justify-end">
                              {/* ✅ Approve/Reject only for pending/submitted */}
                              {st !== "approved" && st !== "rejected" && (
                                <>
                                  <button
                                    className="btn"
                                    disabled={!!ptBusy[e._id]}
                                    title={
                                      ptBusy[e._id]
                                        ? "Approving…"
                                        : "Approve enrollment"
                                    }
                                    onClick={() => {
                                      const ok = window.confirm(
                                        "Approve this training payment and registration?",
                                      );
                                      if (ok) approveTrainingEnrollment(e._id);
                                    }}
                                  >
                                    {ptBusy[e._id] ? "Approving…" : "Approve"}
                                  </button>

                                  <button
                                    className="btn"
                                    onClick={() => {
                                      const ok = window.confirm(
                                        "Reject this enrollment?",
                                      );
                                      if (ok) rejectTrainingEnrollment(e._id);
                                    }}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {/* ✅ Installation complete action (ONLY for approved) */}
                              {st === "approved" && instSt !== "complete" && (
                                <button
                                  className="btn"
                                  disabled={!!ptBusy[`inst-${e._id}`]}
                                  onClick={() => {
                                    const ok = window.confirm(
                                      "Mark this user's installation as complete?",
                                    );
                                    if (ok)
                                      markTrainingInstallationComplete(e._id);
                                  }}
                                >
                                  {ptBusy[`inst-${e._id}`]
                                    ? "Saving…"
                                    : "Mark installation complete"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------ pending tab ------------------ */}
      {tab === "pending" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Pending Purchases</h2>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="text-sm text-slate-600">No pending purchases.</div>
          ) : (
            <div className="space-y-2">
              {purchases.map((p) => {
                const isCart = Array.isArray(p.lines) && p.lines.length > 0;

                const seatsTotal = seatsForPurchaseBadge(p);
                const lt = inferLicenseType(
                  p.licenseType,
                  seatsTotal,
                  p?.organization?.name,
                );

                return (
                  <div
                    key={p._id}
                    className="border rounded p-3 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="truncate">{p.email}</b>
                          <OrganizationBadge
                            licenseType={lt}
                            organization={p.organization}
                            organizationName={p?.organization?.name}
                            seats={seatsTotal}
                          />
                        </div>

                        <div className="text-slate-600 mt-1">
                          {isCart ? (
                            <>Submitted a cart</>
                          ) : (
                            <>
                              Requested <b>{p.productKey}</b>
                            </>
                          )}
                        </div>

                        <div className="text-slate-600">
                          Requested:{" "}
                          {p.requestedMonths
                            ? `${p.requestedMonths} mo · `
                            : ""}
                          {dayjs(p.createdAt).format("YYYY-MM-DD HH:mm")}
                        </div>
                      </div>

                      <div className="flex gap-2 items-center shrink-0">
                        {!isCart ? (
                          <>
                            <select
                              id={`m-${p._id}`}
                              defaultValue={p.requestedMonths || 1}
                              className="input max-w-[140px]"
                            >
                              {MONTH_CHOICES.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>

                            <button
                              className="btn"
                              onClick={() =>
                                approvePurchase(
                                  p._id,
                                  Number(
                                    document.getElementById(`m-${p._id}`).value,
                                  ),
                                )
                              }
                            >
                              Approve
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn"
                            onClick={() => approvePurchase(p._id)}
                          >
                            Approve cart
                          </button>
                        )}

                        <button
                          className="btn"
                          onClick={() => rejectPurchase(p._id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {isCart && (
                      <div className="rounded border bg-slate-50">
                        <div className="px-3 py-2 text-sm font-medium flex items-center justify-between gap-2">
                          <span>
                            Cart · {p.currency}{" "}
                            {p.totalAmount?.toLocaleString?.() ?? p.totalAmount}
                          </span>
                          {Number(p.vatAmount || 0) > 0 && (
                            <span className="text-xs text-slate-600 font-normal">
                              incl. {p.vatLabel || `VAT ${p.vatPercent || 0}%`} {p.currency}{" "}
                              {Number(p.vatAmount).toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="divide-y">
                          {p.lines.map((ln, idx) => {
                            const periods = Math.max(
                              parseInt(ln?.periods ?? 1, 10) || 1,
                              1,
                            );
                            const months = monthsFromLine(p, ln);

                            const seatsLine = Math.max(
                              parseInt(ln?.qty ?? 1, 10) || 1,
                              1,
                            );

                            const inferredLineLt = inferLicenseType(
                              ln?.licenseType || p.licenseType,
                              seatsLine,
                              ln.organizationName || p?.organization?.name,
                            );

                            return (
                              <div
                                key={idx}
                                className="px-3 py-2 text-sm flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {ln.name || ln.productKey}
                                  </div>

                                  <div className="text-slate-600 text-xs mt-1 flex flex-wrap items-center gap-2">
                                    <span className="capitalize">
                                      {ln.billingInterval}
                                    </span>
                                    <span>
                                      · seats <b>{seatsLine}</b>
                                    </span>
                                    <span>
                                      · periods <b>{periods}</b>
                                    </span>
                                    <span>
                                      · adds <b>{months}</b> month
                                      {months === 1 ? "" : "s"}{" "}
                                      <span className="text-slate-500">
                                        (per seat)
                                      </span>
                                    </span>
                                    <span>·</span>
                                    <OrganizationBadge
                                      licenseType={inferredLineLt}
                                      organizationName={
                                        ln.organizationName ||
                                        p?.organization?.name
                                      }
                                      seats={seatsLine}
                                      className="ml-0"
                                    />
                                  </div>
                                </div>

                                <div className="text-right text-slate-700 shrink-0">
                                  <div>
                                    Unit: {p.currency}{" "}
                                    {ln.unit?.toLocaleString?.() ?? ln.unit}
                                  </div>
                                  {ln.install > 0 && (
                                    <div className="text-xs">
                                      Install: {p.currency}{" "}
                                      {Number(ln.install || 0).toLocaleString()}
                                    </div>
                                  )}
                                  <div className="font-semibold">
                                    Subtotal: {p.currency}{" "}
                                    {ln.subtotal?.toLocaleString?.() ??
                                      ln.subtotal}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------ active tab ------------------ */}
      {tab === "active" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Active Subscriptions</h2>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : activeRows.length === 0 ? (
            <div className="text-sm text-slate-600">
              No active subscriptions.
            </div>
          ) : (
            (() => {
              const productMap = new Map();
              for (const row of activeRows) {
                const key = String(row.productKey || "Unknown");
                if (!productMap.has(key)) productMap.set(key, []);
                productMap.get(key).push(row);
              }

              const productKeys = Array.from(productMap.keys()).sort((a, b) =>
                a.localeCompare(b),
              );

              return (
                <ActiveSubscriptionsByProduct
                  productKeys={productKeys}
                  productMap={productMap}
                  users={users}
                  setDisabled={setDisabled}
                  updateEntitlement={updateEntitlement}
                  accessToken={accessToken}
                  load={load}
                  setMsg={setMsg}
                  deleteEntitlement={deleteEntitlement}
                  onOpenDevices={(email, productKey) =>
                    setDevicesModal({ open: true, email, productKey })
                  }
                />
              );
            })()
          )}
        </div>
      )}

      {/* ------------------ subscriptions tab ------------------ */}
      {tab === "subscriptions" && (
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Subscriptions</h2>
            <div className="text-xs text-slate-500">
              Shows Active + Expired + Disabled. Sorted by Expired/Expiring
              soon.
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : allRows.length === 0 ? (
            <div className="text-sm text-slate-600">
              No subscriptions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr className="border-b">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">License</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Expiry</th>
                    <th className="py-2 pr-3">Time left</th>
                    <th className="py-2 pr-3">Seats / Devices</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r, i) => {
                    const renewSelId = `all-renew-${i}`;
                    const entPseudo = {
                      status: r.rawStatus,
                      expiresAt: r.expiresAt,
                    };

                    return (
                      <tr
                        key={`${r.email}-${r.productKey}-${i}`}
                        className={`border-b ${r.userDisabled ? "opacity-60" : ""}`}
                      >
                        <td className="py-3 pr-3">
                          <div className="font-medium">{r.email}</div>
                          <div className="text-xs text-slate-500">
                            {r.username ? `@${r.username}` : ""}
                            {r.userDisabled ? " · User disabled" : ""}
                          </div>
                        </td>

                        <td className="py-3 pr-3">{r.productKey}</td>

                        <td className="py-3 pr-3">
                          <OrganizationBadge
                            licenseType={r.licenseType}
                            organizationName={r.organizationName}
                            seats={r.seats}
                          />
                        </td>

                        <td className="py-3 pr-3">
                          {statusBadgeFrom(entPseudo)}
                        </td>

                        <td className="py-3 pr-3">
                          {r.expiresAt
                            ? dayjs(r.expiresAt).format("YYYY-MM-DD")
                            : "—"}
                        </td>

                        <td className="py-3 pr-3">
                          {timeLeftBadge(r.expiresAt)}
                        </td>

                        <td className="py-3 pr-3">
                          <div className="text-xs text-slate-700">
                            <b>{r.seatsUsed}</b> / {r.seats} used
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="btn btn-sm"
                              onClick={() =>
                                setDevicesModal({
                                  open: true,
                                  email: r.email,
                                  productKey: r.productKey,
                                })
                              }
                            >
                              Devices
                            </button>

                            <button
                              className="btn btn-sm"
                              onClick={async () => {
                                setMsg("");
                                try {
                                  await apiAuthed(`/admin/users/reset-device`, {
                                    token: accessToken,
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      email: r.email,
                                      productKey: r.productKey,
                                    }),
                                  });
                                  await load();
                                  setMsg(
                                    `Device lock reset for ${r.productKey}`,
                                  );
                                } catch (e) {
                                  setMsg(
                                    e?.message || "Failed to reset device",
                                  );
                                }
                              }}
                            >
                              Reset
                            </button>
                          </div>
                        </td>

                        <td className="py-3 pr-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <select
                                id={renewSelId}
                                className="input max-w-[140px]"
                              >
                                {MONTH_CHOICES.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>

                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  updateEntitlement(
                                    r.email,
                                    r.productKey,
                                    Number(
                                      document.getElementById(renewSelId).value,
                                    ),
                                    "active",
                                  )
                                }
                              >
                                Renew
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              {r.status === "disabled" ? (
                                <button
                                  className="btn btn-sm"
                                  onClick={() =>
                                    updateEntitlement(
                                      r.email,
                                      r.productKey,
                                      0,
                                      "active",
                                    )
                                  }
                                >
                                  Enable
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  onClick={() =>
                                    updateEntitlement(
                                      r.email,
                                      r.productKey,
                                      0,
                                      "disabled",
                                    )
                                  }
                                >
                                  Disable
                                </button>
                              )}

                              <button
                                className="btn btn-sm"
                                onClick={() => {
                                  const ok = window.confirm(
                                    `Delete entitlement ${r.productKey} for ${r.email}? This cannot be undone.`,
                                  );
                                  if (ok)
                                    deleteEntitlement(r.email, r.productKey);
                                }}
                              >
                                Delete
                              </button>

                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  setDisabled(r.email, !r.userDisabled)
                                }
                              >
                                {r.userDisabled
                                  ? "Enable user"
                                  : "Disable user"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="text-xs text-slate-500 mt-3">
                Tip: Expired entitlements are automatically blocked. Access
                returns only after admin approval/renewal.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------ installations tab ------------------ */}
      {tab === "installations" && (
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Installations</h2>
          </div>

          {/* Sub-tabs */}
          <nav className="flex gap-4 border-b mb-4 text-sm">
            {[
              { key: "pending", label: "Pending", count: pendingInstalls.length },
              { key: "completed", label: "Completed", count: completedInstalls.length },
              { key: "uninstalled", label: "Uninstalled", count: uninstalledInstalls.length },
            ].map((st) => (
              <button
                key={st.key}
                onClick={() => setInstallSubTab(st.key)}
                className={`py-2 -mb-px border-b-2 transition ${
                  installSubTab === st.key
                    ? "border-adlm-blue-700 text-adlm-blue-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {st.label} ({st.count})
              </button>
            ))}
          </nav>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (() => {
            const visibleList =
              installSubTab === "completed" ? completedInstalls
              : installSubTab === "uninstalled" ? uninstalledInstalls
              : pendingInstalls;

            if (visibleList.length === 0) {
              return (
                <div className="text-sm text-slate-600">
                  No {installSubTab} installations.
                </div>
              );
            }

            return (
              <div className="space-y-2">
                {visibleList.map((p) => {
                  const badge = getInstallState(p);
                  const grants = formatGrants(p);

                  const seatsTotal = seatsForPurchaseBadge(p);
                  const lt = inferLicenseType(
                    p.licenseType,
                    seatsTotal,
                    p?.organization?.name,
                  );

                  const inst = p?.installation || {};
                  const instStatus = String(inst.status || "pending").toLowerCase();

                  return (
                    <div
                      key={p._id}
                      className="border rounded p-3 flex items-start justify-between gap-4"
                    >
                      <div className="text-sm min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium truncate">
                            {p.email || "Unknown email"}
                          </div>
                          <OrganizationBadge
                            licenseType={lt}
                            organization={p.organization}
                            organizationName={p?.organization?.name}
                            seats={seatsTotal}
                          />
                          <Badge label={badge.label} tone={badge.tone} />
                        </div>

                        <div className="text-slate-600 mt-1">
                          Approved:{" "}
                          {p.decidedAt
                            ? dayjs(p.decidedAt).format("YYYY-MM-DD HH:mm")
                            : "—"}
                        </div>

                        <div className="mt-2">
                          <div className="text-xs text-slate-500 mb-1">
                            Product(s)
                          </div>
                          <div className="text-sm text-slate-800 break-words">
                            {grants.text}
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                          Status:{" "}
                          <b className="text-slate-700">
                            {instStatus}
                          </b>
                          {" · "}
                          EntitlementsApplied:{" "}
                          <b className="text-slate-700">
                            {typeof inst.entitlementsApplied === "boolean"
                              ? String(inst.entitlementsApplied)
                              : "missing (legacy)"}
                          </b>
                          {inst.uninstalledAt && (
                            <>
                              {" · "}
                              Uninstalled: <b className="text-slate-700">{dayjs(inst.uninstalledAt).format("YYYY-MM-DD HH:mm")}</b>
                              {inst.uninstalledBy ? ` by ${inst.uninstalledBy}` : ""}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {/* Pending → Mark Complete */}
                        {instStatus === "pending" && (
                          <button
                            className="btn"
                            title="Mark installation complete and apply entitlements"
                            onClick={async () => {
                              setMsg("");
                              try {
                                const res = await apiAuthed(
                                  `/admin/installations/${p._id}/complete`,
                                  { token: accessToken, method: "POST" },
                                );
                                await load();
                                setMsg(res?.message || "Installation marked complete");
                              } catch (e) {
                                setMsg(e?.message || "Failed to mark complete");
                              }
                            }}
                          >
                            Mark complete
                          </button>
                        )}

                        {/* Completed → Mark Uninstalled */}
                        {instStatus === "complete" && (
                          <button
                            className="px-3 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 transition"
                            title="Mark as uninstalled — reverses the installation status"
                            onClick={async () => {
                              setMsg("");
                              try {
                                const res = await apiAuthed(
                                  `/admin/installations/${p._id}/uninstall`,
                                  { token: accessToken, method: "POST" },
                                );
                                await load();
                                setMsg(res?.message || "Installation marked as uninstalled");
                              } catch (e) {
                                setMsg(e?.message || "Failed to mark uninstalled");
                              }
                            }}
                          >
                            Mark uninstalled
                          </button>
                        )}

                        {/* Uninstalled → Revert to Pending */}
                        {instStatus === "uninstalled" && (
                          <button
                            className="btn"
                            title="Revert to pending — allows re-installation"
                            onClick={async () => {
                              setMsg("");
                              try {
                                const res = await apiAuthed(
                                  `/admin/installations/${p._id}/toggle`,
                                  { token: accessToken, method: "POST" },
                                );
                                await load();
                                setMsg(res?.message || "Installation reverted to pending");
                              } catch (e) {
                                setMsg(e?.message || "Failed to revert");
                              }
                            }}
                          >
                            Revert to pending
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ------------------ training locations tab ------------------ */}
      {tab === "tlocations" && (
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold">Training Locations</h2>
              <div className="text-xs text-slate-500">
                Manage locations for organization physical training, including costs and duration.
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() =>
                setTLocForm({
                  name: "",
                  city: "",
                  state: "",
                  address: "",
                  trainingCostNGN: 0,
                  trainingCostUSD: 0,
                  bimInstallCostNGN: 0,
                  bimInstallCostUSD: 0,
                  durationDays: 1,
                  isActive: true,
                })
              }
            >
              + Add Location
            </button>
          </div>

          {tLocMsg && (
            <div className="text-sm text-emerald-700 mb-3">{tLocMsg}</div>
          )}

          {/* Location form modal */}
          {tLocForm && (
            <div className="mb-4 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4">
              <h3 className="font-semibold text-sm mb-3">
                {tLocForm._id ? "Edit Location" : "New Location"}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <label>
                  Name <span className="text-rose-600">*</span>
                  <input
                    className="input mt-1"
                    value={tLocForm.name || ""}
                    onChange={(e) =>
                      setTLocForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <label>
                  City
                  <input
                    className="input mt-1"
                    value={tLocForm.city || ""}
                    onChange={(e) =>
                      setTLocForm((f) => ({ ...f, city: e.target.value }))
                    }
                  />
                </label>
                <label>
                  State
                  <input
                    className="input mt-1"
                    value={tLocForm.state || ""}
                    onChange={(e) =>
                      setTLocForm((f) => ({ ...f, state: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Address
                  <input
                    className="input mt-1"
                    value={tLocForm.address || ""}
                    onChange={(e) =>
                      setTLocForm((f) => ({ ...f, address: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Training Cost (NGN)
                  <input
                    type="number"
                    className="input mt-1"
                    value={tLocForm.trainingCostNGN || 0}
                    onChange={(e) =>
                      setTLocForm((f) => ({
                        ...f,
                        trainingCostNGN: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Training Cost (USD)
                  <input
                    type="number"
                    className="input mt-1"
                    value={tLocForm.trainingCostUSD || 0}
                    onChange={(e) =>
                      setTLocForm((f) => ({
                        ...f,
                        trainingCostUSD: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  BIM Install Cost (NGN)
                  <input
                    type="number"
                    className="input mt-1"
                    value={tLocForm.bimInstallCostNGN || 0}
                    onChange={(e) =>
                      setTLocForm((f) => ({
                        ...f,
                        bimInstallCostNGN: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  BIM Install Cost (USD)
                  <input
                    type="number"
                    className="input mt-1"
                    value={tLocForm.bimInstallCostUSD || 0}
                    onChange={(e) =>
                      setTLocForm((f) => ({
                        ...f,
                        bimInstallCostUSD: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Duration (days)
                  <input
                    type="number"
                    min="1"
                    className="input mt-1"
                    value={tLocForm.durationDays || 1}
                    onChange={(e) =>
                      setTLocForm((f) => ({
                        ...f,
                        durationDays: Math.max(Number(e.target.value), 1),
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    checked={tLocForm.isActive !== false}
                    onChange={(e) =>
                      setTLocForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn btn-sm"
                  onClick={saveTLocation}
                  disabled={tLocBusy}
                >
                  {tLocBusy ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setTLocForm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Locations table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr className="border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">City / State</th>
                  <th className="py-2 pr-3 text-right">Cost NGN</th>
                  <th className="py-2 pr-3 text-right">Cost USD</th>
                  <th className="py-2 pr-3 text-right">BIM NGN</th>
                  <th className="py-2 pr-3 text-right">BIM USD</th>
                  <th className="py-2 pr-3 text-right">Days</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tLocations.map((loc) => (
                  <tr key={loc._id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{loc.name}</td>
                    <td className="py-2 pr-3">
                      {loc.city}
                      {loc.state ? `, ${loc.state}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {Number(loc.trainingCostNGN || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {Number(loc.trainingCostUSD || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {Number(loc.bimInstallCostNGN || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {Number(loc.bimInstallCostUSD || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {loc.durationDays || 1}
                    </td>
                    <td className="py-2 pr-3">
                      {loc.isActive ? (
                        <span className="text-emerald-700 text-xs font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Inactive</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <button
                          className="text-xs text-adlm-blue-700 hover:underline"
                          onClick={() => setTLocForm({ ...loc })}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => deleteTLocation(loc._id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tLocations.length === 0 && (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={9}>
                      No training locations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Purchases with physical training (quick view) */}
          <div className="mt-6 pt-4 border-t">
            <h3 className="font-semibold text-sm mb-2">
              Org Purchases with Physical Training
            </h3>
            <div className="space-y-2">
              {purchases
                .filter((p) => p.physicalTraining?.requested)
                .map((p) => (
                  <div
                    key={p._id}
                    className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">
                          {p.email || p.organization?.name || "—"}
                        </span>
                        <span className="text-slate-500 ml-2">
                          {p.physicalTraining.locationName || "—"}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.physicalTraining.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-700"
                            : p.physicalTraining.status === "completed"
                              ? "bg-blue-100 text-blue-700"
                              : p.physicalTraining.status === "date_proposed"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {(p.physicalTraining.status || "pending")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Training: {p.currency}{" "}
                      {Number(
                        p.physicalTraining.trainingCost || 0,
                      ).toLocaleString()}
                      {p.physicalTraining.bimInstallRequested
                        ? ` + BIM: ${p.currency} ${Number(p.physicalTraining.bimInstallCost || 0).toLocaleString()}`
                        : ""}
                      {" · "}
                      {p.physicalTraining.durationDays || 1} day(s)
                    </div>
                    <div className="flex gap-2 mt-2">
                      {p.physicalTraining.status === "pending_date" && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setTrainingDateModal({
                              open: true,
                              purchaseId: p._id,
                            });
                            setTrainingDateVal("");
                            setTrainingEndDateVal("");
                          }}
                        >
                          Propose Date
                        </button>
                      )}
                      {p.physicalTraining.status === "confirmed" && (
                        <button
                          className="btn btn-sm"
                          onClick={() => completeTraining(p._id)}
                        >
                          Mark Completed
                        </button>
                      )}
                      {p.physicalTraining.scheduledDate && (
                        <span className="text-xs text-slate-600 self-center">
                          Scheduled:{" "}
                          {new Date(
                            p.physicalTraining.scheduledDate,
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              {!purchases.some((p) => p.physicalTraining?.requested) && (
                <div className="text-sm text-slate-500">
                  No organization purchases with physical training yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Training date proposal modal */}
      {trainingDateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() =>
              setTrainingDateModal({ open: false, purchaseId: null })
            }
          />
          <div className="relative bg-white rounded-lg p-6 max-w-md w-full z-10">
            <h3 className="font-semibold mb-3">Propose Training Date</h3>
            <label className="block text-sm mb-3">
              Start date
              <input
                type="date"
                className="input mt-1"
                value={trainingDateVal}
                onChange={(e) => setTrainingDateVal(e.target.value)}
              />
            </label>
            <label className="block text-sm mb-3">
              End date (optional)
              <input
                type="date"
                className="input mt-1"
                value={trainingEndDateVal}
                onChange={(e) => setTrainingEndDateVal(e.target.value)}
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setTrainingDateModal({ open: false, purchaseId: null })
                }
              >
                Cancel
              </button>
              <button
                className="btn btn-sm"
                onClick={() =>
                  proposeTrainingDate(trainingDateModal.purchaseId)
                }
                disabled={!trainingDateVal || tLocBusy}
              >
                {tLocBusy ? "Sending…" : "Propose & Notify User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------ classrooms tab ------------------ */}
      {tab === "classrooms" && (
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Classrooms</h2>
              <div className="text-xs text-slate-500 mt-1">
                Grant a Google Classroom (or other LMS) to a specific user. The classroom appears in their "My Courses" section on the dashboard.
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                setClassroomMsg("");
                setClassroomDraft({
                  userId: "",
                  userLabel: "",
                  title: "",
                  description: "",
                  classroomCode: "",
                  classroomUrl: "",
                  companyName: "",
                });
                setClassroomModalOpen(true);
              }}
            >
              + Create classroom
            </button>
          </div>

          {classroomMsg && (
            <div
              className={`mb-3 text-sm ${
                classroomMsg.toLowerCase().includes("fail") ||
                classroomMsg.toLowerCase().includes("required") ||
                classroomMsg.toLowerCase().includes("first")
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {classroomMsg}
            </div>
          )}

          {classrooms.length === 0 ? (
            <div className="text-sm text-slate-600">No classrooms yet.</div>
          ) : (
            <div className="space-y-2">
              {classrooms.map((c) => (
                <div
                  key={c._id}
                  className="rounded border bg-white p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {c.userName || c.userEmail || c.userId}
                      {c.companyName ? ` · ${c.companyName}` : ""}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.classroomCode ? `Code: ${c.classroomCode}` : ""}
                      {c.classroomCode && c.classroomUrl ? " · " : ""}
                      {c.classroomUrl ? (
                        <a
                          href={c.classroomUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {c.classroomUrl.length > 60
                            ? c.classroomUrl.slice(0, 60) + "…"
                            : c.classroomUrl}
                        </a>
                      ) : null}
                    </div>
                    {c.description && (
                      <div className="text-xs text-slate-500 mt-1">{c.description}</div>
                    )}
                    {!c.isActive && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-600 border">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="btn btn-sm"
                      onClick={() => revokeClassroom(c._id)}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------ create-classroom modal ------------------ */}
      {classroomModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => !classroomBusy && setClassroomModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold">Create classroom</h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => !classroomBusy && setClassroomModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* User picker with autocomplete */}
            <label className="block text-sm font-medium mb-1">User</label>
            {classroomDraft.userId ? (
              <div className="flex items-center justify-between gap-2 rounded border bg-slate-50 px-3 py-2 text-sm mb-3">
                <span className="truncate">{classroomDraft.userLabel}</span>
                <button
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                  onClick={() =>
                    setClassroomDraft((p) => ({ ...p, userId: "", userLabel: "" }))
                  }
                >
                  change
                </button>
              </div>
            ) : (
              <div className="relative mb-3">
                <input
                  className="input w-full"
                  placeholder="Search by name or email…"
                  value={classroomQuery}
                  onChange={(e) => setClassroomQuery(e.target.value)}
                  autoFocus
                />
                {(classroomSuggestions.length > 0 || classroomSearching) && (
                  <div className="absolute z-10 mt-1 w-full rounded border bg-white shadow-lg max-h-56 overflow-auto">
                    {classroomSearching && (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        Searching…
                      </div>
                    )}
                    {classroomSuggestions.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => pickClassroomUser(u)}
                      >
                        <div className="font-medium">{u.name || u.email}</div>
                        {u.name && u.email && (
                          <div className="text-xs text-slate-500">{u.email}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              className="input w-full mb-3"
              placeholder="e.g. Revit Architecture Training"
              value={classroomDraft.title}
              onChange={(e) =>
                setClassroomDraft((p) => ({ ...p, title: e.target.value }))
              }
            />

            <label className="block text-sm font-medium mb-1">
              Classroom code{" "}
              <span className="text-xs font-normal text-slate-500">
                (Google Classroom join code)
              </span>
            </label>
            <input
              className="input w-full mb-3"
              placeholder="e.g. abc123def"
              value={classroomDraft.classroomCode}
              onChange={(e) =>
                setClassroomDraft((p) => ({ ...p, classroomCode: e.target.value }))
              }
            />

            <label className="block text-sm font-medium mb-1">
              Classroom URL{" "}
              <span className="text-xs font-normal text-slate-500">
                (optional — overrides code if set)
              </span>
            </label>
            <input
              className="input w-full mb-3"
              placeholder="https://classroom.google.com/c/..."
              value={classroomDraft.classroomUrl}
              onChange={(e) =>
                setClassroomDraft((p) => ({ ...p, classroomUrl: e.target.value }))
              }
            />

            <label className="block text-sm font-medium mb-1">
              Company{" "}
              <span className="text-xs font-normal text-slate-500">(optional)</span>
            </label>
            <input
              className="input w-full mb-3"
              placeholder="Company name for reference"
              value={classroomDraft.companyName}
              onChange={(e) =>
                setClassroomDraft((p) => ({ ...p, companyName: e.target.value }))
              }
            />

            <label className="block text-sm font-medium mb-1">
              Description{" "}
              <span className="text-xs font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              className="input w-full mb-4"
              rows={2}
              placeholder="Notes shown on the user's card"
              value={classroomDraft.description}
              onChange={(e) =>
                setClassroomDraft((p) => ({ ...p, description: e.target.value }))
              }
            />

            <div className="flex justify-end gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setClassroomModalOpen(false)}
                disabled={classroomBusy}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm bg-adlm-blue-700 text-white hover:bg-[#0050c8]"
                onClick={createClassroom}
                disabled={classroomBusy || !classroomDraft.userId || !classroomDraft.title.trim()}
              >
                {classroomBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------ settings tab ------------------ */}
      {tab === "settings" && (
        <div className="card">
          <h2 className="font-semibold text-lg mb-4">Site Settings</h2>

          <div className="space-y-6">
            {/* Mobile App URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mobile App Download URL (APK)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Upload an APK directly (stored on Cloudflare R2) or paste a Google Drive / Play Store link. This is what the home page and footer "Download Mobile App" button uses.
              </p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="url"
                  className="flex-1 min-w-[220px] border rounded px-3 py-2 text-sm"
                  placeholder="https://drive.google.com/file/d/... or upload an APK →"
                  value={settingsMobileAppDraft}
                  onChange={(e) => setSettingsMobileAppDraft(e.target.value)}
                />
                <label className="px-3 py-2 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 cursor-pointer transition shrink-0">
                  Upload APK
                  <input
                    type="file"
                    accept=".apk,.aab,application/vnd.android.package-archive"
                    className="hidden"
                    onChange={handleApkUpload}
                  />
                </label>
                <button
                  onClick={saveMobileAppUrl}
                  disabled={settingsBusy || settingsMobileAppDraft === settingsMobileAppUrl}
                  className="px-4 py-2 rounded bg-adlm-blue-700 text-white text-sm font-medium hover:bg-[#0050c8] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {settingsBusy ? "Saving…" : "Save"}
                </button>
              </div>
              {settingsMsg && (
                <p className={`mt-2 text-sm ${settingsMsg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                  {settingsMsg}
                </p>
              )}
              {settingsMobileAppUrl && (
                <p className="mt-2 text-xs text-slate-500">
                  Current:{" "}
                  <a href={settingsMobileAppUrl} target="_blank" rel="noreferrer" className="text-adlm-blue-700 underline break-all">
                    {settingsMobileAppUrl}
                  </a>
                </p>
              )}
            </div>

            {/* VAT / Tax */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-base mb-1">VAT / Tax</h3>
              <p className="text-xs text-slate-500 mb-4">
                When enabled, VAT is added on top of the post-discount subtotal for Purchase summaries, Quotes, and Invoices (per the toggles below). The label and percent are shown on receipts and PDFs (e.g. "VAT 7.5%").
              </p>

              <div className="space-y-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vatEnabled}
                    onChange={(e) => setVatEnabled(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-700">Enable VAT</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      VAT percent
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="e.g. 7.5"
                      value={vatPercent}
                      onChange={(e) => setVatPercent(Number(e.target.value || 0))}
                      disabled={!vatEnabled}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="VAT"
                      value={vatLabel}
                      onChange={(e) => setVatLabel(e.target.value)}
                      disabled={!vatEnabled}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">Apply to:</div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={vatApplyPurchases}
                        onChange={(e) => setVatApplyPurchases(e.target.checked)}
                        disabled={!vatEnabled}
                      />
                      <span className="text-sm">Purchase summary</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={vatApplyQuotes}
                        onChange={(e) => setVatApplyQuotes(e.target.checked)}
                        disabled={!vatEnabled}
                      />
                      <span className="text-sm">Quotes</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={vatApplyInvoices}
                        onChange={(e) => setVatApplyInvoices(e.target.checked)}
                        disabled={!vatEnabled}
                      />
                      <span className="text-sm">Invoices</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveVat}
                    disabled={vatBusy}
                    className="px-4 py-2 rounded bg-adlm-blue-700 text-white text-sm font-medium hover:bg-[#0050c8] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {vatBusy ? "Saving..." : "Save VAT Settings"}
                  </button>
                  {vatMsg && (
                    <span className={`text-sm ${vatMsg.toLowerCase().includes("fail") ? "text-red-600" : "text-green-600"}`}>
                      {vatMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Installer Hub */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-base mb-1">Installer Hub</h3>
              <p className="text-xs text-slate-500 mb-4">
                Configure the Installer Hub download link and setup guide video. Users will see these in their Installations section when they have pending installations.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Installer Hub Download URL
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Upload the Hub setup file (.exe / .msi / .zip / .msix) directly — small files go to Cloudinary, larger ones to Cloudflare R2 — or paste a hosted URL.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="url"
                      className="flex-1 min-w-[220px] border rounded px-3 py-2 text-sm"
                      placeholder="https://... or upload an installer →"
                      value={ihUrlDraft}
                      onChange={(e) => setIhUrlDraft(e.target.value)}
                    />
                    <label className="px-3 py-2 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 cursor-pointer transition shrink-0">
                      Upload installer
                      <input
                        type="file"
                        accept=".exe,.msi,.zip,.7z,.appx,.appxbundle,.msix,.msixbundle"
                        className="hidden"
                        onChange={handleIhInstallerUpload}
                      />
                    </label>
                  </div>
                  {ihUrl && (
                    <p className="mt-1 text-xs text-slate-500">
                      Current:{" "}
                      <a href={ihUrl} target="_blank" rel="noreferrer" className="text-adlm-blue-700 underline break-all">
                        {ihUrl.length > 80 ? ihUrl.slice(0, 80) + "..." : ihUrl}
                      </a>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Setup Guide Video URL
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Upload a video or paste a URL. Files over 10MB go to Cloudflare R2, smaller files to Cloudinary.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      className="flex-1 border rounded px-3 py-2 text-sm"
                      placeholder="https://..."
                      value={ihVideoDraft}
                      onChange={(e) => setIhVideoDraft(e.target.value)}
                    />
                    <label className="px-3 py-2 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 cursor-pointer transition shrink-0">
                      Upload video
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleIhVideoUpload}
                      />
                    </label>
                  </div>
                  {ihUploadProg > 0 && (
                    <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200">
                      <div className="h-full bg-adlm-blue-700 transition-all" style={{ width: `${ihUploadProg}%` }} />
                    </div>
                  )}
                  {ihVideoUrl && (
                    <p className="mt-1 text-xs text-slate-500">
                      Current:{" "}
                      <a href={ihVideoUrl} target="_blank" rel="noreferrer" className="text-adlm-blue-700 underline break-all">
                        {ihVideoUrl.length > 80 ? ihVideoUrl.slice(0, 80) + "..." : ihVideoUrl}
                      </a>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveInstallerHub}
                    disabled={ihBusy || (ihUrlDraft === ihUrl && ihVideoDraft === ihVideoUrl)}
                    className="px-4 py-2 rounded bg-adlm-blue-700 text-white text-sm font-medium hover:bg-[#0050c8] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ihBusy ? "Saving..." : "Save Installer Hub Settings"}
                  </button>
                  {ihMsg && (
                    <span className={`text-sm ${ihMsg.includes("Failed") || ihMsg.includes("error") ? "text-red-600" : "text-green-600"}`}>
                      {ihMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Force Global Reinstall — DANGER ZONE */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-base mb-1 text-red-700">
                Force Global Reinstall (Danger Zone)
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                Revokes <b>every active device</b> across all users and shows a site-wide banner
                instructing everyone to redownload the Installer Hub, watch the setup video,
                reinstall the Hub, and redownload all software updates.
                Make sure the Installer Hub URL and video URL above are current before clicking.
              </p>

              {frActive ? (
                <div className="rounded border border-red-200 bg-red-50 p-3 mb-4">
                  <div className="text-sm text-red-800">
                    <b>Banner is currently active</b>
                    {frTriggeredAt && (
                      <span className="ml-2 text-xs text-red-700">
                        (triggered {dayjs(frTriggeredAt).format("MMM D, YYYY HH:mm")})
                      </span>
                    )}
                  </div>
                  {frMessage && (
                    <div className="text-xs text-red-700 mt-1 italic">"{frMessage}"</div>
                  )}
                  <button
                    onClick={clearForceReinstall}
                    disabled={frBusy}
                    className="mt-3 px-3 py-1.5 rounded bg-white border border-red-300 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
                  >
                    {frBusy ? "Clearing..." : "Clear banner (devices stay revoked)"}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500 mb-3">
                  Banner is not active. Default message will tell users to redownload the
                  Installer Hub, watch the video, reinstall, and redownload all updates.
                </div>
              )}

              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Optional custom message (leave blank for default)
                </label>
                <textarea
                  rows={2}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Leave blank to use the standard reinstall instructions..."
                  value={frCustomMessage}
                  onChange={(e) => setFrCustomMessage(e.target.value)}
                />
              </div>

              <button
                onClick={() => {
                  setFrConfirmText("");
                  setFrMsg("");
                  setFrConfirmOpen(true);
                }}
                disabled={frBusy}
                className="px-4 py-2 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-50"
              >
                Reset all devices &amp; broadcast reinstall message
              </button>

              {frMsg && (
                <span className={`ml-3 text-sm ${frMsg.includes("Failed") ? "text-red-600" : "text-green-700"}`}>
                  {frMsg}
                </span>
              )}

              {frResult && (
                <div className="mt-3 text-xs text-slate-600">
                  Revoked <b>{frResult.devicesRevoked}</b> device(s) across <b>{frResult.usersTouched}</b> user(s).
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Force-reinstall confirm modal */}
      {frConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-red-700 mb-2">
              Confirm: Force Global Reinstall
            </h3>
            <p className="text-sm text-slate-700 mb-3">
              This will <b>revoke every active device</b> for every user and broadcast a
              banner asking everyone to reinstall the Installer Hub. Users will be signed
              out of installed software and must re-activate.
            </p>
            <p className="text-sm text-slate-700 mb-2">
              Type <b className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">RESET</b> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              className="w-full border rounded px-3 py-2 text-sm font-mono mb-4"
              value={frConfirmText}
              onChange={(e) => setFrConfirmText(e.target.value)}
              placeholder="RESET"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setFrConfirmOpen(false);
                  setFrConfirmText("");
                }}
                disabled={frBusy}
                className="px-4 py-2 rounded border border-slate-300 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={triggerForceReinstall}
                disabled={frBusy || frConfirmText !== "RESET"}
                className="px-4 py-2 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {frBusy ? "Working..." : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <DevicesModal
        open={devicesModal.open}
        onClose={() =>
          setDevicesModal({ open: false, email: "", productKey: "" })
        }
        email={devicesModal.email}
        productKey={devicesModal.productKey}
        token={accessToken}
        refreshParent={load}
        setMsg={setMsg}
      />

      <ReceiptModal
        open={receiptModal.open}
        url={receiptModal.url}
        title={receiptModal.title}
        onClose={() => setReceiptModal({ open: false, url: "", title: "" })}
      />
    </div>
  );
}


