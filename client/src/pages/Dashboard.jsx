// src/pages/Dashboard.jsx
import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import { useNavigate } from "react-router-dom";
import OrganizationBadge from "../components/common/OrganizationBadge.jsx";
import { parseBunny, bunnyIframeSrc } from "../lib/video";
import CertificateNameModal from "../components/CertificateNameModal.jsx";
import { TiltCard } from "../components/effects.jsx";

dayjs.extend(relativeTime);

/* ---------------- subscription helpers ---------------- */

function isExpiredSub(s) {
  if (!s?.expiresAt) return false;
  const end = dayjs(s.expiresAt).endOf("day");
  return end.isValid() && end.isBefore(dayjs());
}

function getSubscriptionState(s) {
  const now = dayjs();
  const exp = s?.expiresAt ? dayjs(s.expiresAt) : null;

  if (exp && exp.isValid()) {
    const end = exp.endOf("day");

    if (end.isBefore(now)) {
      return {
        label: "expired",
        pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
      };
    }

    const daysLeft = end.diff(now, "day");
    if (daysLeft <= 7) {
      return {
        label: "expiring soon",
        pill: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
      };
    }
  }

  const status = (s?.status || "active").toLowerCase();

  if (status === "active") {
    return {
      label: "active",
      pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    };
  }

  return {
    label: status,
    pill: "bg-slate-50 text-slate-600 ring-1 ring-slate-100",
  };
}

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

export default function Dashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [reinstall, setReinstall] = React.useState(null);
  const [courses, setCourses] = React.useState(null);
  const [coursesErr, setCoursesErr] = React.useState("");
  const [loadingCourses, setLoadingCourses] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("subscriptions");

  // ✅ Physical training enrollments (new)
  const [pEnrollments, setPEnrollments] = React.useState([]);
  const [loadingPEnrollments, setLoadingPEnrollments] = React.useState(false);
  const [pEnrollmentsErr, setPEnrollmentsErr] = React.useState("");

  // ── Classrooms (admin-granted standalone classrooms) ──
  const [classrooms, setClassrooms] = React.useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = React.useState(false);
  const [classroomsErr, setClassroomsErr] = React.useState("");

  const navigate = useNavigate();

  const displayName =
    (user?.firstName && user.firstName.trim()) ||
    (user?.username && user.username.trim()) ||
    user?.email ||
    "there";

  const loadSummary = React.useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await apiAuthed(`/me/summary`, { token: accessToken });
      setSummary(data || {});
    } catch (e) {
      setErr(e.message || "Failed to load summary");
    } finally {
      setLoadingSummary(false);
    }
  }, [accessToken]);

  const loadCourses = React.useCallback(async () => {
    setLoadingCourses(true);
    setCoursesErr("");
    try {
      const data = await apiAuthed(`/me/courses`, { token: accessToken });
      setCourses(data || []);
    } catch (e) {
      setCourses([]);
      setCoursesErr(e.message || "Failed to load online courses");
    } finally {
      setLoadingCourses(false);
    }
  }, [accessToken]);

  const loadClassrooms = React.useCallback(async () => {
    setLoadingClassrooms(true);
    setClassroomsErr("");
    try {
      const data = await apiAuthed(`/me/classrooms`, { token: accessToken });
      setClassrooms(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setClassrooms([]);
      setClassroomsErr(e?.message || "Failed to load classrooms");
    } finally {
      setLoadingClassrooms(false);
    }
  }, [accessToken]);

  const loadPTrainings = React.useCallback(async () => {
    setLoadingPEnrollments(true);
    setPEnrollmentsErr("");
    try {
      const data = await apiAuthed(`/me/ptrainings/enrollments`, {
        token: accessToken,
      });
      setPEnrollments(Array.isArray(data) ? data : []);
    } catch (e) {
      setPEnrollmentsErr(e.message || "Failed to load physical trainings");
    } finally {
      setLoadingPEnrollments(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    loadSummary();
    loadCourses();
    loadClassrooms();
    loadPTrainings();
  }, [loadSummary, loadCourses, loadClassrooms, loadPTrainings]);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchReinstall() {
      try {
        const res = await fetch(`${API_BASE}/settings/force-reinstall`);
        const json = await res.json();
        if (!cancelled) setReinstall(json || null);
      } catch {
        // ignore
      }
    }
    fetchReinstall();
    const id = setInterval(fetchReinstall, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // refresh physical trainings when the learning tab is opened
  React.useEffect(() => {
    if (activeTab === "learning") loadPTrainings();
  }, [activeTab, loadPTrainings]);

  const activeProductsCount =
    summary?.products?.filter?.((p) => p.isActive !== false)?.length ??
    (summary?.entitlements || []).filter((e) => !e.isCourse).length ??
    0;

  const activeSubscriptionsCount = (summary?.entitlements || []).filter((e) => {
    if (e.isCourse) return false;
    if ((e.status || "").toLowerCase() !== "active") return false;
    if (isExpiredSub(e)) return false;
    return true;
  }).length;

  const tutorialsWatched = summary?.tutorialsWatched ?? 0;

  // ✅ include physical enrollments inside the dashboard "total orders" stat
  const baseOrdersCount = summary?.ordersCount ?? summary?.totalOrders ?? 0;
  const totalOrders =
    Number(baseOrdersCount || 0) + (pEnrollments?.length || 0);

  function openProduct(e) {
    if (!e) return;
    if (isExpiredSub(e)) return;
    if ((e.status || "").toLowerCase() !== "active") return;

    const key = (e.productKey || "").toLowerCase();
    if (key === "revit") return navigate("/projects/revit");
    if (key === "mep") return navigate("/projects/mep");
    if (key === "planswift") return navigate("/projects/planswift");
    if (key === "civil3d") return navigate("/projects/civil3d");
    if (key === "rategen") return navigate("/rategen");
    navigate(`/product/${e.productKey}`);
  }

  function manageSubscription(s) {
    if (!s?.productKey) return;
    const interval = (s.billingInterval || "monthly").toLowerCase();
    const qty = interval === "yearly" ? 1 : 1;

    navigate(
      `/purchase?product=${encodeURIComponent(
        s.productKey,
      )}&months=${qty}&return=/dashboard`,
    );
  }

  const approvedPTrainings = (pEnrollments || []).filter(
    (x) => String(x?.status || "").toLowerCase() === "approved",
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <style>{`
        .fade-up { opacity:0; transform: translateY(8px); animation: fadeUp .6s ease forwards; }
        @keyframes fadeUp { to { opacity:1; transform: translateY(0); } }
        .card-hover { transition: transform .18s ease, box-shadow .18s ease; }
        .card-hover:hover { transform: translateY(-6px); box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
        .stat-appear { opacity:0; transform: translateY(8px) scale(.99); animation: statIn .6s ease forwards; }
        @keyframes statIn { to { opacity:1; transform: translateY(0) scale(1); } }
      `}</style>

      <div className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white shadow-depth">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-10 w-72 h-72 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 py-7 md:py-9">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-blue-100/90 mt-1.5">
            Manage your products, subscriptions, and learning progress
          </p>
          <p className="text-xs text-blue-100/70 mt-2">
            Welcome back, <span className="font-semibold text-white">{displayName}</span>.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Products"
            value={activeProductsCount}
            subtitle="Products you can access"
            delay={60}
            accent="blue"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></svg>}
          />
          <StatCard
            title="Active Subscriptions"
            value={activeSubscriptionsCount}
            subtitle="Currently active"
            delay={120}
            accent="emerald"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>}
          />
          <StatCard
            title="Tutorials Watched"
            value={tutorialsWatched}
            subtitle="Learning progress"
            delay={180}
            accent="orange"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" /></svg>}
          />
          <StatCard
            title="Total Orders"
            value={totalOrders}
            subtitle="Purchases + trainings"
            delay={240}
            accent="violet"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>}
          />
        </div>

        {reinstall?.active && activeSubscriptionsCount > 0 ? (
          <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl shadow-depth p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold uppercase tracking-wide text-red-700">
                  Action required: reinstall
                </div>
                <div className="text-sm mt-1 leading-relaxed">
                  {reinstall.message?.trim() ||
                    "Please redownload the Installer Hub, watch the setup video, reinstall the Hub, and redownload all software updates. Your installed apps must be re-activated."}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reinstall.installerHubUrl ? (
                    <a
                      href={reinstall.installerHubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition"
                    >
                      Download Installer Hub
                    </a>
                  ) : null}
                  {reinstall.installerHubVideoUrl ? (
                    <a
                      href={reinstall.installerHubVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 transition"
                    >
                      Watch setup video
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeSubscriptionsCount > 0 && summary?.installerHub?.downloadUrl ? (
          <div className="bg-gradient-to-r from-adlm-blue-700 to-[#0050c8] text-white rounded-xl shadow-depth p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold opacity-90">
                Installer Hub
              </div>
              <div className="text-base md:text-lg font-bold">
                Download the Installer Hub to set up your active products
              </div>
              <div className="text-xs text-blue-100/90 mt-1">
                Available because you have {activeSubscriptionsCount} active
                subscription{activeSubscriptionsCount === 1 ? "" : "s"}.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <a
                href={summary.installerHub.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-white text-adlm-blue-700 text-sm font-semibold hover:bg-blue-50 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download Installer Hub
              </a>
              {summary.installerHub.videoUrl ? (
                <a
                  href={summary.installerHub.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-white/10 ring-1 ring-white/40 text-white text-sm font-semibold hover:bg-white/20 transition"
                >
                  Watch Setup Guide
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-depth p-3 flex flex-wrap items-center gap-2">
              <TabBtn
                label="My Products"
                active={activeTab === "products"}
                onClick={() => setActiveTab("products")}
              />
              <TabBtn
                label="Subscriptions"
                active={activeTab === "subscriptions"}
                onClick={() => setActiveTab("subscriptions")}
              />
              <TabBtn
                label="Learning"
                active={activeTab === "learning"}
                onClick={() => setActiveTab("learning")}
              />
              <a
                href="/profile"
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-adlm-dark-muted hover:bg-slate-100 dark:hover:bg-adlm-dark-hover transition"
                title="Orders, invoices & installations are on your profile"
              >
                Orders &amp; Billing ↗
              </a>

              {(user?.role === "admin" || user?.role === "mini_admin") && (
                <div className="ml-auto flex gap-2">
                  <a
                    href="/admin/invoices"
                    className="inline-flex items-center gap-2 text-white px-3 py-1.5 rounded-md text-sm transition"
                    style={{ backgroundColor: "#091E39" }}
                  >
                    Create Invoice
                  </a>
                  {user?.role === "admin" && (
                    <a
                      href="/admin/products"
                      className="inline-flex items-center gap-2 bg-adlm-blue-700 text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#0050c8] transition"
                    >
                      + Add product
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-depth p-4 space-y-4">
              {err ? <div className="text-sm text-red-600">{err}</div> : null}

              {activeTab === "products" && (
                <ProductsTab
                  products={summary?.products || []}
                  loading={loadingSummary}
                />
              )}

              {activeTab === "subscriptions" && (
                <SubscriptionsTab
                  entitlements={summary?.entitlements || []}
                  onOpen={openProduct}
                  onManage={manageSubscription}
                />
              )}

              {activeTab === "learning" && (
                <LearningTab
                  courses={courses}
                  loadingCourses={loadingCourses}
                  coursesError={coursesErr}
                  onRefreshCourses={loadCourses}
                  classrooms={classrooms}
                  loadingClassrooms={loadingClassrooms}
                  classroomsError={classroomsErr}
                  onRefreshClassrooms={loadClassrooms}
                  pEnrollments={approvedPTrainings}
                  loadingPTrainings={loadingPEnrollments}
                  pTrainingsError={pEnrollmentsErr}
                />
              )}

              {/* Orders, Invoices & Installations now live on the Profile page */}

              {/* invoices tab moved to the Profile page */}

            </div>
          </div>

          <aside className="space-y-4">
            <div className="group relative spotlight overflow-hidden bg-white rounded-2xl ring-1 ring-slate-200 shadow-depth p-5 card-hover">
              <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-adlm-orange/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br from-adlm-orange to-amber-500 text-white shadow-glow-orange">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>
                  </span>
                  <div>
                    <div className="text-xs text-slate-500">Membership</div>
                    <div className="font-bold text-lg text-slate-900 dark:text-white leading-tight">Premium Plus</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              </div>
              <div className="relative text-xs text-slate-400 mt-2">
                Started on{" "}
                {summary?.membership?.startedAt
                  ? dayjs(summary.membership.startedAt).format("MMM D, YYYY")
                  : "—"}
              </div>

              <ul className="relative mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2"><CheckIcon /> Unlimited access to all tutorials</li>
                <li className="flex items-start gap-2"><CheckIcon /> Priority customer support</li>
                <li className="flex items-start gap-2"><CheckIcon /> Advanced analytics dashboard</li>
              </ul>

              <button
                className="relative mt-5 w-full inline-flex items-center justify-center gap-2 bg-adlm-orange text-white text-sm font-semibold py-2.5 px-3 rounded-lg shadow-glow-orange hover:brightness-110 active:scale-[.99] transition"
                onClick={() => navigate("/freebies")}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
                Explore ADLM Freebies
              </button>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-depth p-4">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Quick Links</div>
              <div className="mt-3 grid grid-cols-1 gap-1.5">
                {[
                  { label: "Your Projects (Revit)", to: "/projects/revit", icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /> },
                  { label: "Learning Center", to: "/learn", icon: <><path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" /></> },
                  { label: "Contact Support", to: "/support", icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
                ].map((q) => (
                  <button
                    key={q.to}
                    className="group flex items-center gap-3 text-left text-sm py-2 px-3 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
                    onClick={() => navigate(q.to)}
                  >
                    <span className="text-adlm-blue-700 dark:text-adlm-blue-400">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{q.icon}</svg>
                    </span>
                    <span className="flex-1">{q.label}</span>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-300 transition group-hover:text-adlm-blue-700 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {user?.role === "admin" && (
          <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-depth p-4">
            <h3 className="font-semibold mb-2">Admin tools</h3>
            <div className="flex gap-2 flex-wrap">
              <a href="/admin/products" className="btn btn-sm">
                Products
              </a>
              <a href="/admin/courses" className="btn btn-sm">
                Courses
              </a>
              <a href="/admin/course-grading" className="btn btn-sm">
                Course grading
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- small components ---------- */

function StatCard({ title, value, subtitle = "", delay = 0, icon = null, accent = "blue" }) {
  const accents = {
    blue: "bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400",
    orange: "bg-adlm-orange/10 text-adlm-orange",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="stat-appear h-full" style={{ animationDelay: `${delay}ms` }}>
      <TiltCard
        max={9}
        className="h-full bg-white rounded-2xl ring-1 ring-slate-200 shadow-depth p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-500">{title}</div>
          {icon ? (
            <span className={`tilt-layer w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${accents[accent] || accents.blue}`}>
              {icon}
            </span>
          ) : null}
        </div>
        <div className="tilt-layer mt-2 text-2xl md:text-3xl font-bold text-slate-900">{value}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-slate-400">{subtitle}</div> : null}
      </TiltCard>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-adlm-blue-700 text-white shadow-glow-blue"
          : "text-slate-600 hover:bg-slate-100 dark:hover:bg-adlm-dark-hover"
      }`}
    >
      {label}
    </button>
  );
}

function ProductsTab({ products = [], loading }) {
  if (loading) return <div>Loading products…</div>;
  if (!products || products.length === 0)
    return <div className="text-sm text-slate-600">No products yet.</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {products.map((p) => (
        <div
          key={p._id}
          className="rounded-lg ring-1 ring-slate-200 p-3 hover:shadow-md transition card-hover flex gap-3 items-start"
        >
          <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden flex-shrink-0">
            {p.thumbnailUrl ? (
              <img
                src={p.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-slate-100" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-slate-500">{p.blurb}</div>
            <div className="text-xs text-slate-400 mt-2">
              {p.price?.monthlyNGN
                ? `₦${Number(p.price.monthlyNGN).toLocaleString()}/mo`
                : ""}
            </div>
          </div>
          <div>
            <a
              className="text-adlm-blue-700 text-sm"
              href={`/product/${encodeURIComponent(p.key)}`}
            >
              View
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubscriptionsTab({ entitlements = [], onOpen, onManage }) {
  const subs = entitlements.filter((e) => !e.isCourse);
  if (!subs.length)
    return <div className="text-sm text-slate-600">No subscriptions yet.</div>;

  return (
    <div className="space-y-3">
      {subs.map((s, i) => {
        const st = getSubscriptionState(s);
        const expired = isExpiredSub(s);

        const lt = String(s.licenseType || "personal").toLowerCase();
        const seats = lt === "organization" ? s.seats : null;

        return (
          <div
            key={i}
            className="group relative spotlight rounded-2xl ring-1 ring-slate-200 p-4 sm:p-5 bg-white shadow-depth transition-shadow hover:shadow-depth-lg"
          >
            <div className="flex items-start gap-4">
              <div className="hidden sm:grid place-items-center w-12 h-12 rounded-xl flex-shrink-0 bg-gradient-to-br from-adlm-blue-700 to-adlm-blue-600 text-white shadow-glow-blue">
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></svg>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {s.productName || s.productKey}
                    </div>
                    <div className="mt-1 inline-flex items-center rounded-md bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {s.productKey}
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs ${st.pill}`}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-2">
                  <OrganizationBadge
                    licenseType={lt}
                    organizationName={s.organizationName}
                    seats={seats}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {s.billingInterval ? <span className="capitalize">{s.billingInterval}</span> : null}
                  {s.installFee ? <span>Install: ₦{Number(s.installFee).toLocaleString()}</span> : null}
                  <span>
                    Expires:{" "}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {s.expiresAt ? dayjs(s.expiresAt).format("MMM D, YYYY") : "—"}
                    </span>
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="group/btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-adlm-blue-700 text-white text-sm font-medium hover:bg-adlm-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={expired}
                    onClick={() => onOpen(s)}
                  >
                    Open
                    <svg viewBox="0 0 24 24" className="w-4 h-4 transition-transform group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                  <button
                    className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-adlm-dark-border text-sm hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
                    onClick={() => onManage?.(s)}
                  >
                    Manage
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LearningTab({
  courses = [],
  loadingCourses,
  coursesError,
  onRefreshCourses,
  classrooms = [],
  loadingClassrooms,
  classroomsError,
  onRefreshClassrooms,
  pEnrollments = [],
  loadingPTrainings,
  pTrainingsError,
}) {
  const hasOnline = Array.isArray(courses) && courses.length > 0;
  const hasClassrooms = Array.isArray(classrooms) && classrooms.length > 0;
  const hasPhysical = Array.isArray(pEnrollments) && pEnrollments.length > 0;
  const [onboardingModal, setOnboardingModal] = React.useState(null);
  const [certModal, setCertModal] = React.useState(null);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Online Courses</h3>
          <button
            type="button"
            className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
            onClick={() => onRefreshCourses?.()}
            disabled={loadingCourses}
          >
            Refresh
          </button>
        </div>

        {coursesError ? (
          <div className="mt-2 text-sm text-red-600">{coursesError}</div>
        ) : null}

        {loadingCourses && !courses ? (
          <div className="mt-2 text-sm text-slate-600">Loading online courses...</div>
        ) : !hasOnline && !hasClassrooms ? (
          <div className="mt-2 text-sm text-slate-600">No enrolled courses yet.</div>
        ) : !hasOnline ? null : (
          <div className="mt-3 space-y-3">
            {courses.map((entry) => {
              const course = entry.course || {};
              const summary = entry.summary || {};
              const access = entry.access || {};
              const classroom = entry.classroom || {};
              const accessPill = access.isExpired
                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                : typeof access.daysLeft === "number" && access.daysLeft <= 7
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
                  : access.expiresAt
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-100";
              const accessLine = access.expiresAt
                ? `Access until ${dayjs(access.expiresAt).format("MMM D, YYYY")}`
                : "Open access";

              return (
                <div
                  key={course.sku || entry.enrollment?.courseSku}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-depth lift"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="h-20 w-28 overflow-hidden rounded-lg bg-slate-100 shrink-0">
                      {course.thumbnailUrl ? (
                        <img
                          src={course.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-100" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-900">
                          {course.title || entry.enrollment?.courseSku}
                        </div>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${accessPill}`}>
                          {access.label || "Open access"}
                        </span>
                        {classroom.joinUrl ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-50 text-adlm-blue-700 ring-1 ring-blue-100">
                            Google Classroom linked
                          </span>
                        ) : null}
                      </div>

                      {course.blurb ? (
                        <div className="mt-1 text-sm text-slate-600">{course.blurb}</div>
                      ) : null}

                      <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
                        <div
                          className="h-full rounded bg-adlm-blue-700"
                          style={{ width: `${Math.min(100, entry.progress || 0)}%` }}
                        />
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div>
                          Modules: {summary.completedModules || 0}/{summary.totalModules || 0}
                        </div>
                        <div>
                          Assignments: {summary.submittedAssignments || 0}/{summary.requiredAssignments || 0}
                        </div>
                        <div>{accessLine}</div>
                        <div>Pending review: {summary.pendingAssignments || 0}</div>
                      </div>

                      {classroom.notes ? (
                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                          {classroom.notes}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                          href={course.sku ? `/learn/course/${course.sku}` : "#"}
                        >
                          Open course
                        </a>
                        {course.onboardingVideoUrl ? (
                          <button
                            className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition"
                            onClick={() =>
                              setOnboardingModal({
                                title: course.title,
                                url: course.onboardingVideoUrl,
                              })
                            }
                          >
                            Watch Onboarding
                          </button>
                        ) : null}
                        {classroom.joinUrl ? (
                          <a
                            className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                            href={classroom.joinUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Go to classroom
                          </a>
                        ) : null}
                        {entry.enrollment?.status === "completed" && course.certificateTemplateUrl ? (
                          <button
                            className="px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700 transition"
                            onClick={() =>
                              setCertModal({
                                sku: course.sku || entry.enrollment?.courseSku,
                                title: course.title,
                                description: course.blurb || "",
                                completionDate: entry.enrollment?.certificateIssuedAt || entry.enrollment?.updatedAt,
                              })
                            }
                          >
                            Download Certificate
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Classroom Access (admin-granted standalone classrooms) */}
        {classroomsError ? (
          <div className="mt-2 text-sm text-red-600">{classroomsError}</div>
        ) : null}
        {hasClassrooms && (
          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Classroom Access
            </div>
            <div className="space-y-3">
              {classrooms.map((c) => (
                <div
                  key={c._id}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-depth lift"
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-900">{c.title}</div>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-50 text-adlm-blue-700 ring-1 ring-blue-100">
                          Classroom
                        </span>
                      </div>
                      {c.description ? (
                        <div className="mt-1 text-sm text-slate-600">
                          {c.description}
                        </div>
                      ) : null}
                      {c.companyName ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {c.companyName}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {c.effectiveJoinUrl ? (
                          <a
                            className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                            href={c.effectiveJoinUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Go to Classroom
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">
                            No classroom link configured yet — ask admin.
                          </span>
                        )}
                        <button
                          className="px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700 transition"
                          onClick={() =>
                            setCertModal({
                              sku: `classroom:${c._id}`,
                              title: c.title,
                              description: c.description || "",
                              completionDate: c.updatedAt || c.createdAt,
                            })
                          }
                        >
                          Download Certificate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Physical Trainings</h3>
        </div>

        {pTrainingsError ? (
          <div className="text-sm text-red-600 mt-2">{pTrainingsError}</div>
        ) : null}

        {loadingPTrainings ? (
          <div className="text-sm text-slate-600 mt-2">
            Loading physical trainings...
          </div>
        ) : !hasPhysical ? (
          <div className="text-sm text-slate-600 mt-2">
            No approved physical trainings yet. (Check Order History for pending approvals.)
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {pEnrollments.map((enr) => {
              const t = enr?.training || {};
              const address = buildTrainingAddress(t);
              return (
                <div
                  key={String(enr._id)}
                  className="group relative spotlight rounded-2xl ring-1 ring-slate-200 p-4 bg-white shadow-depth lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">Physical training</div>
                      <div className="font-semibold mt-1">{t.title || "-"}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        Duration: {trainingDurationText(t)}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Location: {address || "-"}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Installation</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                            installationMetaFromEnrollment(enr).pill
                          }`}
                        >
                          {installationMetaFromEnrollment(enr).label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
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
                      title="Add to Calendar"
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

      <CertificateNameModal
        open={!!certModal}
        onClose={() => setCertModal(null)}
        courseSku={certModal?.sku}
        courseTitle={certModal?.title}
        courseDescription={certModal?.description}
        completionDate={certModal?.completionDate}
      />

      {onboardingModal ? (() => {
        const parsed = parseBunny(onboardingModal.url || "");
        const isBunny = parsed?.kind === "bunny";
        const src = isBunny
          ? bunnyIframeSrc(parsed.libId, parsed.videoId)
          : parsed?.src;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setOnboardingModal(null)}
          >
            <div
              className="relative w-full max-w-3xl mx-4 rounded-xl bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-sm truncate">
                  {onboardingModal.title} &mdash; Onboarding Video
                </h3>
                <button
                  className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                  onClick={() => setOnboardingModal(null)}
                >
                  &times;
                </button>
              </div>
              <div className="bg-black">
                {src ? (
                  isBunny ? (
                    <iframe
                      src={src}
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                      allowFullScreen
                      className="w-full aspect-video"
                      title="onboarding-video"
                    />
                  ) : (
                    <video
                      className="w-full aspect-video"
                      src={src}
                      controls
                      autoPlay
                      preload="metadata"
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-64 text-white text-sm">
                    Video unavailable
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

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
                      <div className="text-sm text-slate-600">—</div>
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
                      <div className="text-sm text-slate-600">—</div>
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
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Installer Hub
                          </a>
                        ) : null}

                        {installerHub?.videoUrl ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                            onClick={() => setSetupVideoModal(true)}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Watch Setup Guide
                          </button>
                        ) : null}
                      </div>

                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        {installerHub?.downloadUrl ? (
                          <li>Download and run the Installer Hub to set up your software</li>
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
    <svg
      className="w-4 h-4 text-emerald-600 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path strokeWidth="2" d="M5 13l4 4L19 7" />
    </svg>
  );
}
