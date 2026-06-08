// Account activity — Orders, Invoices and Installations.
//
// Moved off the Dashboard so the dashboard can focus on using the product
// (products / projects / learning). This component is self-contained: it loads
// its own data and reuses the OrdersTab / InstallationsTab renderers exported
// from the Dashboard page (so there's a single source of truth for that UI).

import React from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";
import { API_BASE } from "../../config";
import { OrdersTab, InstallationsTab } from "../../pages/Dashboard.jsx";

function SubTab({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-adlm-blue-700 text-white shadow-glow-blue"
          : "text-slate-600 dark:text-adlm-dark-muted hover:bg-slate-100 dark:hover:bg-adlm-dark-hover"
      }`}
    >
      {label}
      {typeof count === "number" && count > 0 ? ` (${count})` : ""}
    </button>
  );
}

function InvoicesTab({ invoices = [], loading, error, navigate, accessToken }) {
  const statusColors = {
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-slate-200 text-slate-500",
  };

  if (loading) return <div className="text-sm text-slate-500">Loading invoices…</div>;
  if (!invoices.length) {
    return (
      <div className="text-sm text-slate-500">
        No invoices found.
        {error ? <span className="block text-xs text-rose-500 mt-1">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const curr = inv.currency === "USD" ? "$" : "₦";
        return (
          <div
            key={inv._id}
            className="group relative spotlight rounded-2xl bg-white dark:bg-adlm-dark-panel ring-1 ring-slate-200 shadow-depth p-4 lift"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {inv.invoiceNumber}
                </div>
                <div className="text-xs text-slate-500">
                  {dayjs(inv.invoiceDate).format("MMM D, YYYY")}
                  {inv.dueDate ? ` · Due: ${dayjs(inv.dueDate).format("MMM D, YYYY")}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    statusColors[inv.status] || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {inv.status}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {curr}
                  {Number(inv.total || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {(inv.items || []).length} item
              {(inv.items || []).length !== 1 ? "s" : ""}
              {" · "}Total:{" "}
              <span className="font-medium text-slate-700 dark:text-adlm-dark-text">
                {curr}
                {Number(inv.total || 0).toLocaleString()}
              </span>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-adlm-dark-border flex gap-2">
              <button
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white"
                style={{ backgroundColor: "#091E39" }}
                onClick={() => navigate(`/invoice/${inv._id}`)}
              >
                View Invoice
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-adlm-dark-border text-slate-600 dark:text-adlm-dark-text hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                onClick={async () => {
                  try {
                    const resp = await fetch(`${API_BASE}/me/invoices/${inv._id}/pdf`, {
                      headers: { Authorization: `Bearer ${accessToken}` },
                      credentials: "include",
                    });
                    if (!resp.ok) throw new Error("Download failed");
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${inv.invoiceNumber}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    alert("Download failed");
                  }
                }}
              >
                Download PDF
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AccountActivity() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = React.useState("orders");

  // Orders (paginated)
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

  // Invoices
  const [invoices, setInvoices] = React.useState([]);
  const [loadingInvoices, setLoadingInvoices] = React.useState(false);
  const [invoicesErr, setInvoicesErr] = React.useState("");

  // Installations (from summary) + physical training enrollments
  const [summary, setSummary] = React.useState(null);
  const [pEnrollments, setPEnrollments] = React.useState([]);
  const [loadingPEnrollments, setLoadingPEnrollments] = React.useState(false);
  const [pEnrollmentsErr, setPEnrollmentsErr] = React.useState("");

  const loadOrders = React.useCallback(
    async (page) => {
      setLoadingOrders(true);
      setOrdersErr("");
      try {
        const data = await apiAuthed(`/me/orders?page=${page}&limit=10`, { token: accessToken });
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
        setOrdersErr(e?.message || "Failed to load orders");
      } finally {
        setLoadingOrders(false);
      }
    },
    [accessToken],
  );

  const loadInvoices = React.useCallback(async () => {
    setLoadingInvoices(true);
    setInvoicesErr("");
    try {
      const data = await apiAuthed(`/me/invoices`, { token: accessToken });
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
      if (data?._error) setInvoicesErr(data._error);
    } catch (e) {
      setInvoices([]);
      setInvoicesErr(e?.message || "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }, [accessToken]);

  const loadSummary = React.useCallback(async () => {
    try {
      const data = await apiAuthed(`/me/summary`, { token: accessToken });
      setSummary(data || {});
    } catch {
      setSummary({});
    }
  }, [accessToken]);

  const loadPTrainings = React.useCallback(async () => {
    setLoadingPEnrollments(true);
    setPEnrollmentsErr("");
    try {
      const data = await apiAuthed(`/me/ptrainings/enrollments`, { token: accessToken });
      setPEnrollments(Array.isArray(data) ? data : []);
    } catch (e) {
      setPEnrollmentsErr(e?.message || "Failed to load physical trainings");
    } finally {
      setLoadingPEnrollments(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    if (!accessToken) return;
    loadInvoices();
    loadSummary();
    loadPTrainings();
  }, [accessToken, loadInvoices, loadSummary, loadPTrainings]);

  React.useEffect(() => {
    if (!accessToken) return;
    if (tab === "orders") loadOrders(ordersPage);
  }, [accessToken, tab, ordersPage, loadOrders]);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span aria-hidden="true" className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400" />
          Orders, Invoices &amp; Installations
        </h2>
        <div className="flex flex-wrap gap-2">
          <SubTab label="Orders" active={tab === "orders"} onClick={() => setTab("orders")} />
          <SubTab label="Invoices" active={tab === "invoices"} onClick={() => setTab("invoices")} count={invoices.length} />
          <SubTab label="Installations" active={tab === "installations"} onClick={() => setTab("installations")} />
        </div>
      </div>

      {tab === "orders" && (
        <OrdersTab
          orders={orders}
          loading={loadingOrders}
          error={ordersErr}
          pagination={ordersPagination}
          onPageChange={setOrdersPage}
          onOpenReceipt={(orderId) =>
            window.open(`/receipt/${orderId}`, "_blank", "noopener,noreferrer")
          }
          pEnrollments={pEnrollments}
          loadingPTrainings={loadingPEnrollments}
          pTrainingsError={pEnrollmentsErr}
          onRefreshPTrainings={loadPTrainings}
        />
      )}

      {tab === "invoices" && (
        <InvoicesTab
          invoices={invoices}
          loading={loadingInvoices}
          error={invoicesErr}
          navigate={navigate}
          accessToken={accessToken}
        />
      )}

      {tab === "installations" && (
        <InstallationsTab
          installations={summary?.installations || []}
          installerHub={summary?.installerHub}
          pEnrollments={pEnrollments}
          loadingPTrainings={loadingPEnrollments}
          pTrainingsError={pEnrollmentsErr}
          onRefreshPTrainings={loadPTrainings}
        />
      )}
    </div>
  );
}
