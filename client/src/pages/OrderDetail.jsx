// One order, as the buyer sees it before it is paid.
//
// The proforma invoice ends with "Open your order", and there was nowhere for
// it to go. /purchase is the page where you choose what to buy — it says
// nothing about an order already placed — and /receipt/:id refuses outright
// until the order is approved, which a proforma invoice by definition is not.
// So the one link on the document that asks the buyer to act led either
// nowhere useful or to "Receipt not available yet".
//
// This is that page: what was ordered, what it costs, where to pay it, and the
// receipt upload the invoice tells them about. Once the order is approved it
// hands off to /receipt/:id, which is the document for a settled purchase.

import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(n) || 0);

const STATUS = {
  pending: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", tone: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", tone: "bg-rose-100 text-rose-800" },
};

export default function OrderDetail() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = React.useState(null);
  const [bank, setBank] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const fileRef = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      const data = await apiAuthed(`/me/orders/${id}`, { token: accessToken });
      setOrder(data);
    } catch (e) {
      setErr(e.message || "That order could not be loaded.");
    }
  }, [id, accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!accessToken) return;
    apiAuthed("/purchase/bank-details", { token: accessToken })
      .then(setBank)
      .catch(() => {});
  }, [accessToken]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setNote("");
    try {
      const body = new FormData();
      body.append("receipt", file);
      // No Content-Type header: FormData sets its own multipart boundary and
      // naming the type by hand strips it.
      const res = await fetch(`${API_BASE}/purchase/${id}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The receipt could not be uploaded.");
      setNote(data.message || "Receipt received. We will confirm your licence shortly.");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (err && !order) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-xl bg-white ring-1 ring-slate-200 p-4 dark:bg-slate-800 dark:ring-slate-700">
          <div className="font-semibold">Order not found</div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{err}</p>
          <button
            className="mt-4 px-3 py-2 rounded-md border text-sm"
            onClick={() => navigate("/dashboard")}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!order) return <div className="p-6 text-sm text-slate-600">Loading your order…</div>;

  const currency = order.currency || "NGN";
  const status = STATUS[order.status] || STATUS.pending;
  const ref = String(order._id || "").slice(-8).toUpperCase();
  const lines = order.lines || [];
  const paid = order.status === "approved" || order.paid === true;
  // Only these two wait on a human. A card order that has not cleared is
  // Paystack's business, not something a receipt upload can help with.
  const manual = order.paymentMethod === "transfer" || order.paymentMethod === "invoice";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Order {ref}</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${status.tone}`}>{status.label}</span>
        {order.paymentMethod && (
          <span className="text-xs text-slate-500">
            {order.paymentMethod === "transfer"
              ? "Bank transfer"
              : order.paymentMethod === "invoice"
                ? "Invoice requested"
                : "Card"}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium text-right">Seats</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.productKey}-${i}`} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-2">
                  {l.name || l.productKey}
                  <div className="text-xs text-slate-500">
                    {l.periods || 1}{" "}
                    {l.billingInterval === "yearly"
                      ? `year${(l.periods || 1) === 1 ? "" : "s"}`
                      : `month${(l.periods || 1) === 1 ? "" : "s"}`}
                    {Number(l.install) > 0 && ` · includes ${fmt(l.install, currency)} installation`}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{l.qty || 1}</td>
                <td className="px-4 py-2 text-right">{fmt(l.subtotal, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 dark:border-slate-700">
            {Number(order.vatAmount) > 0 && (
              <tr>
                <td className="px-4 py-1.5 text-slate-500" colSpan={2}>
                  {order.vatLabel || "VAT"}
                </td>
                <td className="px-4 py-1.5 text-right">{fmt(order.vatAmount, currency)}</td>
              </tr>
            )}
            <tr>
              <td className="px-4 py-2 font-semibold" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold">
                {fmt(order.totalAmount, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!paid && manual && (
        <div className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 p-4">
          <div className="font-semibold mb-2">How to pay</div>
          {bank ? (
            <dl className="text-sm grid grid-cols-2 gap-y-1">
              <dt className="text-slate-500">Bank</dt>
              <dd className="text-right">{bank.bankName}</dd>
              <dt className="text-slate-500">Account name</dt>
              <dd className="text-right">{bank.accountName}</dd>
              <dt className="text-slate-500">Account number</dt>
              <dd className="text-right font-medium">{bank.accountNumber}</dd>
              <dt className="text-slate-500">Reference</dt>
              <dd className="text-right font-medium">{ref}</dd>
              <dt className="text-slate-500">Amount</dt>
              <dd className="text-right font-medium">{fmt(order.totalAmount, currency)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Loading the account details…</p>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            {order.paymentProof?.url ? (
              <p className="text-sm">
                Receipt uploaded.{" "}
                <a
                  className="text-adlm-blue-700 underline"
                  href={order.paymentProof.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View it
                </a>{" "}
. We will confirm your licence shortly.
              </p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Transfer the exact amount quoting the reference, then upload the receipt here.
                There is no need to send it anywhere else.
              </p>
            )}
            <label
              className="inline-block mt-3 px-3 py-2 rounded-md border text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
              htmlFor="order-receipt"
            >
              {order.paymentProof?.url ? "Upload a different receipt" : "Upload your receipt"}
            </label>
            <input
              id="order-receipt"
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <span className="ml-3 text-xs text-slate-500">A photo or PDF, up to 8MB.</span>
          </div>
        </div>
      )}

      {note && (
        <p className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-4 py-3">{note}</p>
      )}
      {err && order && (
        <p className="rounded-lg bg-rose-50 text-rose-800 text-sm px-4 py-3">{err}</p>
      )}

      {paid && (
        <Link to={`/receipt/${order._id}`} className="inline-block text-sm text-adlm-blue-700 underline">
          View your receipt
        </Link>
      )}
    </div>
  );
}
