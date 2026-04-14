import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    n || 0,
  );

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500",
};

const DEFAULT_TERMS =
  "Payment is due within 14 days of invoice date. Please reference the invoice number in your payment.";

function emptyInvoice() {
  return {
    invoiceDate: dayjs().format("YYYY-MM-DD"),
    dueDate: dayjs().add(14, "day").format("YYYY-MM-DD"),
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    clientOrganization: "",
    items: [{ description: "", qty: 1, unitPrice: 0, total: 0 }],
    currency: "NGN",
    discount: 0,
    tax: 0,
    terms: DEFAULT_TERMS,
    notes: "",
    status: "draft",
  };
}

export default function AdminInvoices() {
  const { accessToken } = useAuth();

  const [invoices, setInvoices] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const [mode, setMode] = React.useState("list"); // list | form | preview
  const [form, setForm] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const data = await apiAuthed(`/admin/invoices${qs}`, {
        token: accessToken,
      });
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
    } catch (e) {
      setMsg(e.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (accessToken) load();
  }, [accessToken, statusFilter]);

  function startNew() {
    setForm(emptyInvoice());
    setEditId(null);
    setMode("form");
  }

  function startEdit(inv) {
    setForm({
      ...inv,
      invoiceDate: inv.invoiceDate
        ? dayjs(inv.invoiceDate).format("YYYY-MM-DD")
        : "",
      dueDate: inv.dueDate ? dayjs(inv.dueDate).format("YYYY-MM-DD") : "",
      items:
        inv.items?.length > 0
          ? inv.items
          : [{ description: "", qty: 1, unitPrice: 0, total: 0 }],
    });
    setEditId(inv._id);
    setMode("form");
  }

  function updateItem(idx, patch) {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], ...patch };
      // Auto-calc total
      items[idx].total =
        Number(items[idx].qty || 0) * Number(items[idx].unitPrice || 0);
      return { ...f, items };
    });
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [...f.items, { description: "", qty: 1, unitPrice: 0, total: 0 }],
    }));
  }

  function removeItem(idx) {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx),
    }));
  }

  const subtotal = (form?.items || []).reduce(
    (s, it) => s + Number(it.total || 0),
    0,
  );
  const total = Math.max(
    subtotal - Number(form?.discount || 0) + Number(form?.tax || 0),
    0,
  );

  async function saveInvoice() {
    if (!form) return;
    setBusy(true);
    setMsg("");
    try {
      const payload = {
        ...form,
        items: form.items.map((it) => ({
          description: it.description,
          qty: Number(it.qty || 1),
          unitPrice: Number(it.unitPrice || 0),
          total: Number(it.total || 0),
        })),
        discount: Number(form.discount || 0),
        tax: Number(form.tax || 0),
      };

      if (editId) {
        await apiAuthed(`/admin/invoices/${editId}`, {
          token: accessToken,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiAuthed(`/admin/invoices`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setMode("list");
      setForm(null);
      setEditId(null);
      load();
      setMsg(editId ? "Invoice updated" : "Invoice created");
    } catch (e) {
      setMsg(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvoice(id) {
    if (!confirm("Delete this draft invoice?")) return;
    try {
      await apiAuthed(`/admin/invoices/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      load();
    } catch (e) {
      setMsg(e.message || "Delete failed");
    }
  }

  async function sendInvoice(id) {
    setBusy(true);
    try {
      await apiAuthed(`/admin/invoices/${id}/send`, {
        token: accessToken,
        method: "POST",
      });
      load();
      setMsg("Invoice sent to client");
    } catch (e) {
      setMsg(e.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf(id) {
    window.open(
      `${API_BASE}/admin/invoices/${id}/pdf?token=${accessToken}`,
      "_blank",
    );
  }

  // ── LIST MODE ──
  if (mode === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Invoices</h1>
            <p className="text-sm text-slate-500">
              Create, manage, and send invoices to clients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="btn btn-sm" onClick={startNew}>
              + New Invoice
            </button>
          </div>
        </div>

        {msg && <div className="text-sm text-emerald-700">{msg}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3">Invoice #</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id} className="border-b hover:bg-slate-50">
                  <td className="py-2 pr-3 font-medium">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-2 pr-3">
                    {inv.clientOrganization || inv.clientName || inv.clientEmail || "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {dayjs(inv.invoiceDate).format("MMM D, YYYY")}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {fmt(inv.total, inv.currency)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status] || ""}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2 text-xs">
                      <button
                        className="text-adlm-blue-700 hover:underline"
                        onClick={() => startEdit(inv)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-adlm-blue-700 hover:underline"
                        onClick={() => downloadPdf(inv._id)}
                      >
                        PDF
                      </button>
                      {inv.clientEmail && (
                        <button
                          className="text-adlm-blue-700 hover:underline"
                          onClick={() => sendInvoice(inv._id)}
                        >
                          Send
                        </button>
                      )}
                      {inv.status === "draft" && (
                        <button
                          className="text-rose-600 hover:underline"
                          onClick={() => deleteInvoice(inv._id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    {loading ? "Loading…" : "No invoices yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── FORM MODE ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {editId ? "Edit Invoice" : "New Invoice"}
        </h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setMode("list");
            setForm(null);
            setEditId(null);
          }}
        >
          Back to list
        </button>
      </div>

      {msg && <div className="text-sm text-emerald-700">{msg}</div>}

      {form && (
        <div className="card space-y-4">
          {/* Invoice header */}
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <label>
              Invoice Date
              <input
                type="date"
                className="input mt-1"
                value={form.invoiceDate || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceDate: e.target.value }))
                }
              />
            </label>
            <label>
              Due Date
              <input
                type="date"
                className="input mt-1"
                value={form.dueDate || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </label>
            <label>
              Currency
              <select
                className="input mt-1"
                value={form.currency || "NGN"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value }))
                }
              >
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>

          {/* Client info */}
          <div className="border-t pt-4">
            <div className="text-sm font-semibold mb-2">Bill To</div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <label>
                Organization
                <input
                  className="input mt-1"
                  value={form.clientOrganization || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      clientOrganization: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Client Name
                <input
                  className="input mt-1"
                  value={form.clientName || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientName: e.target.value }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  className="input mt-1"
                  value={form.clientEmail || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientEmail: e.target.value }))
                  }
                />
              </label>
              <label>
                Phone
                <input
                  className="input mt-1"
                  value={form.clientPhone || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientPhone: e.target.value }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                Address
                <input
                  className="input mt-1"
                  value={form.clientAddress || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientAddress: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>

          {/* Line items */}
          <div className="border-t pt-4">
            <div className="text-sm font-semibold mb-2">Line Items</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr className="border-b">
                    <th className="py-1 pr-2">Description</th>
                    <th className="py-1 pr-2 w-20">Qty</th>
                    <th className="py-1 pr-2 w-28">Unit Price</th>
                    <th className="py-1 pr-2 w-28 text-right">Total</th>
                    <th className="py-1 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-1 pr-2">
                        <input
                          className="input"
                          value={item.description || ""}
                          onChange={(e) =>
                            updateItem(idx, { description: e.target.value })
                          }
                          placeholder="Item description"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          min="0"
                          className="input"
                          value={item.qty || ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              qty: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          min="0"
                          className="input"
                          value={item.unitPrice || ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              unitPrice: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2 text-right font-medium">
                        {fmt(item.total, form.currency)}
                      </td>
                      <td className="py-1">
                        {form.items.length > 1 && (
                          <button
                            className="text-rose-500 text-xs hover:underline"
                            onClick={() => removeItem(idx)}
                          >
                            x
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="text-sm text-adlm-blue-700 hover:underline mt-2"
              onClick={addItem}
            >
              + Add line item
            </button>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-3 text-sm">
              <label>
                Discount
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={form.discount || 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label>
                Tax
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={form.tax || 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tax: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label>
                Status
                <select
                  className="input mt-1"
                  value={form.status || "draft"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
            <div className="text-right space-y-1 text-sm">
              <div>
                Subtotal:{" "}
                <span className="font-medium">
                  {fmt(subtotal, form.currency)}
                </span>
              </div>
              {form.discount > 0 && (
                <div>
                  Discount:{" "}
                  <span className="font-medium">
                    - {fmt(form.discount, form.currency)}
                  </span>
                </div>
              )}
              {form.tax > 0 && (
                <div>
                  Tax:{" "}
                  <span className="font-medium">
                    {fmt(form.tax, form.currency)}
                  </span>
                </div>
              )}
              <div className="text-lg font-semibold border-t pt-2 mt-2">
                Total: {fmt(total, form.currency)}
              </div>
            </div>
          </div>

          {/* Terms & Notes */}
          <div className="border-t pt-4 grid sm:grid-cols-2 gap-4 text-sm">
            <label>
              Terms & Conditions
              <textarea
                className="input mt-1"
                rows={3}
                value={form.terms || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, terms: e.target.value }))
                }
              />
            </label>
            <label>
              Notes
              <textarea
                className="input mt-1"
                rows={3}
                value={form.notes || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              className="btn"
              onClick={saveInvoice}
              disabled={busy}
            >
              {busy ? "Saving…" : editId ? "Update Invoice" : "Create Invoice"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setMode("list");
                setForm(null);
                setEditId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
