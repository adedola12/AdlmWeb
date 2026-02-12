// src/pages/Dashboard.jsx
import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useNavigate } from "react-router-dom";
import OrganizationBadge from "../components/common/OrganizationBadge.jsx";

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
  const [courses, setCourses] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("subscriptions");
  const [orders, setOrders] = React.useState([]);
  const [ordersPage, setOrdersPage] = React.useState(1);
  const [ordersPagination, setOrdersPagination] = React.useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: 10,
    hasPrev: false,
    hasNext: false,
  });

  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const [ordersErr, setOrdersErr] = React.useState("");

  // ✅ Physical training enrollments (new)
  const [pEnrollments, setPEnrollments] = React.useState([]);
  const [loadingPEnrollments, setLoadingPEnrollments] = React.useState(false);
  const [pEnrollmentsErr, setPEnrollmentsErr] = React.useState("");

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
    try {
      const data = await apiAuthed(`/me/courses`, { token: accessToken });
      setCourses(data || []);
    } catch (e) {
      console.error(e);
    }
  }, [accessToken]);

  const loadOrders = React.useCallback(
    async (page) => {
      setLoadingOrders(true);
      setOrdersErr("");
      try {
        const data = await apiAuthed(`/me/orders?page=${page}&limit=10`, {
          token: accessToken,
        });

        setOrders(data?.items || []);
        setOrdersPagination(
          data?.pagination || {
            page,
            pages: 1,
            total: (data?.items || []).length,
            limit: 10,
            hasPrev: page > 1,
            hasNext: false,
          },
        );
      } catch (e) {
        setOrdersErr(e.message || "Failed to load orders");
      } finally {
        setLoadingOrders(false);
      }
    },
    [accessToken],
  );

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
    loadPTrainings();
  }, [loadSummary, loadCourses, loadPTrainings]);

  React.useEffect(() => {
    if (activeTab !== "orders") return;
    loadOrders(ordersPage);
  }, [activeTab, ordersPage, loadOrders]);

  // refresh physical trainings when user opens relevant tabs
  React.useEffect(() => {
    if (
      activeTab === "learning" ||
      activeTab === "orders" ||
      activeTab === "installations"
    ) {
      loadPTrainings();
    }
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

      <div className="rounded-lg overflow-hidden bg-blue-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
          <h1 className="text-xl md:text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-blue-100/90 mt-1">
            Manage your products, subscriptions, and learning progress
          </p>
          <p className="text-xs text-blue-100/80 mt-2">
            Welcome, {displayName}.
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
          />
          <StatCard
            title="Active Subscriptions"
            value={activeSubscriptionsCount}
            subtitle="Currently active"
            delay={120}
          />
          <StatCard
            title="Tutorials Watched"
            value={tutorialsWatched}
            subtitle="Learning progress"
            delay={180}
          />
          <StatCard
            title="Total Orders"
            value={totalOrders}
            subtitle="Purchases + trainings"
            delay={240}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
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
              <TabBtn
                label="Order History"
                active={activeTab === "orders"}
                onClick={() => {
                  setActiveTab("orders");
                  setOrdersPage(1);
                }}
              />
              <TabBtn
                label="Installations"
                active={activeTab === "installations"}
                onClick={() => setActiveTab("installations")}
              />

              {user?.role === "admin" && (
                <div className="ml-auto">
                  <a
                    href="/admin/products"
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700 transition"
                  >
                    + Add product
                  </a>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4 space-y-4">
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
                  pEnrollments={approvedPTrainings}
                  loadingPTrainings={loadingPEnrollments}
                  pTrainingsError={pEnrollmentsErr}
                />
              )}

              {activeTab === "orders" && (
                <OrdersTab
                  orders={orders}
                  loading={loadingOrders}
                  error={ordersErr}
                  pagination={ordersPagination}
                  onPageChange={setOrdersPage}
                  onOpenReceipt={(orderId) =>
                    window.open(
                      `/receipt/${orderId}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  // ✅ physical trainings (new)
                  pEnrollments={pEnrollments}
                  loadingPTrainings={loadingPEnrollments}
                  pTrainingsError={pEnrollmentsErr}
                  onRefreshPTrainings={loadPTrainings}
                />
              )}

              {activeTab === "installations" && (
                <InstallationsTab
                  installations={summary?.installations || []}
                  // ✅ physical trainings (new)
                  pEnrollments={pEnrollments}
                  loadingPTrainings={loadingPEnrollments}
                  pTrainingsError={pEnrollmentsErr}
                  onRefreshPTrainings={loadPTrainings}
                />
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4 card-hover">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-sm text-slate-500">Membership</div>
                  <div className="mt-2 font-semibold text-lg">Premium Plus</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Started on{" "}
                    {summary?.membership?.startedAt
                      ? dayjs(summary.membership.startedAt).format("YYYY-MM-DD")
                      : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">Status</div>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-slate-700">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckIcon /> Unlimited access to all tutorials
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon /> Priority customer support
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon /> Advanced analytics dashboard
                  </li>
                </ul>
              </div>

              <div className="mt-4">
                <button
                  className="text-left bg-blue-600 text-white text-sm py-2 px-3 rounded-md hover:bg-slate-50 hover:text-black transition"
                  onClick={() => navigate("/freebies")}
                >
                  ADLM Freebies
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4">
              <div className="text-sm font-semibold">Quick Links</div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  className="text-left text-sm py-2 px-3 rounded-md hover:bg-slate-50 transition"
                  onClick={() => navigate("/projects/revit")}
                >
                  Your Projects (Revit)
                </button>
                <button
                  className="text-left text-sm py-2 px-3 rounded-md hover:bg-slate-50 transition"
                  onClick={() => navigate("/learn")}
                >
                  Learning Center
                </button>
                <button
                  className="text-left text-sm py-2 px-3 rounded-md hover:bg-slate-50 transition"
                  onClick={() => navigate("/support")}
                >
                  Contact Support
                </button>
              </div>
            </div>
          </aside>
        </div>

        {user?.role === "admin" && (
          <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4">
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

function StatCard({ title, value, subtitle = "", delay = 0 }) {
  return (
    <div
      className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4 stat-appear"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-slate-400">{subtitle}</div>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-md text-sm ${
        active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
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
              className="text-blue-600 text-sm"
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
            className="rounded-xl ring-1 ring-slate-200 p-4 bg-white shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-500">{s.productKey}</div>
                <div className="font-semibold mt-1">
                  {s.productName || s.productKey}
                </div>

                <div className="mt-2">
                  <OrganizationBadge
                    licenseType={lt}
                    organizationName={s.organizationName}
                    seats={seats}
                  />
                </div>

                <div className="text-xs text-slate-400 mt-2">
                  {s.billingInterval ? `${s.billingInterval}` : ""}
                  {s.installFee
                    ? ` · Install: ₦${Number(s.installFee).toLocaleString()}`
                    : ""}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-400">Status</div>
                <div className="mt-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${st.pill}`}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-2">Expires</div>
                <div className="mt-1 text-sm">
                  {s.expiresAt ? dayjs(s.expiresAt).format("YYYY-MM-DD") : "-"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={expired}
                onClick={() => onOpen(s)}
              >
                Open
              </button>

              <button
                className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                onClick={() => onManage?.(s)}
              >
                Manage
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LearningTab({
  courses = [],
  pEnrollments = [],
  loadingPTrainings,
  pTrainingsError,
}) {
  const hasOnline = Array.isArray(courses) && courses.length > 0;
  const hasPhysical = Array.isArray(pEnrollments) && pEnrollments.length > 0;

  return (
    <div className="space-y-6">
      {/* Online */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Online Courses</h3>
        </div>

        {!courses ? (
          <div>Loading…</div>
        ) : !hasOnline ? (
          <div className="text-sm text-slate-600">No enrolled courses yet.</div>
        ) : (
          <div className="space-y-3 mt-3">
            {courses.map((c) => {
              const course = c.course || {};
              const progress = c.progress || 0;
              return (
                <div
                  key={course.sku || c.enrollment?.courseSku}
                  className="rounded-xl ring-1 ring-slate-200 p-3 bg-white shadow-sm flex gap-3 items-center"
                >
                  <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden">
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      {course.title || c.enrollment?.courseSku}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Progress: {progress}%
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded mt-2">
                      <div
                        className="bg-blue-600 h-2 rounded"
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <a
                      className="text-blue-600 text-sm"
                      href={course.sku ? `/learn/course/${course.sku}` : "#"}
                    >
                      Open
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Physical Trainings */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Physical Trainings</h3>
        </div>

        {pTrainingsError ? (
          <div className="text-sm text-red-600 mt-2">{pTrainingsError}</div>
        ) : null}

        {loadingPTrainings ? (
          <div className="text-sm text-slate-600 mt-2">
            Loading physical trainings…
          </div>
        ) : !hasPhysical ? (
          <div className="text-sm text-slate-600 mt-2">
            No approved physical trainings yet. (Check Order History for pending
            approvals.)
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {pEnrollments.map((enr) => {
              const t = enr?.training || {};
              const address = buildTrainingAddress(t);
              return (
                <div
                  key={String(enr._id)}
                  className="rounded-xl ring-1 ring-slate-200 p-4 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">
                        Physical training
                      </div>
                      <div className="font-semibold mt-1">{t.title || "—"}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        Duration: {trainingDurationText(t)}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Location: {address || "—"}
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
                      className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
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
    </div>
  );
}

function OrdersTab({
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
                    className="rounded-xl ring-1 ring-slate-200 bg-white p-4 shadow-sm"
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
                          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
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
                        ? "bg-blue-600 text-white border-blue-600"
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
                  className="rounded-xl ring-1 ring-slate-200 bg-white p-4 shadow-sm"
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
                        className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
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

function InstallationsTab({
  installations = [],
  pEnrollments = [],
  loadingPTrainings,
  pTrainingsError,
  onRefreshPTrainings,
}) {
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
                  className="rounded-xl ring-1 ring-slate-200 p-4 bg-white shadow-sm"
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
                                className="text-blue-600"
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
                            className="text-blue-600"
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
                      className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
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
                  className="rounded-xl ring-1 ring-slate-200 p-4 bg-white shadow-sm"
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
                    <div className="mt-3 text-sm text-slate-700 space-y-2">
                      <div className="font-medium">Next steps</div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          Download AnyDesk:{" "}
                          <a
                            className="text-blue-600"
                            href={p.installation?.anydeskUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Click here
                          </a>
                        </li>
                        <li>Send your AnyDesk Address to support</li>
                        <li>
                          Watch installation process video:{" "}
                          <a
                            className="text-blue-600"
                            href={p.installation?.installVideoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch
                          </a>
                        </li>
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
