import React from "react";
import dayjs from "dayjs";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import invoiceLogo from "../assets/logo/invoiceLogo.png";
import InvoicePreviewPage from "../components/InvoicePreview.jsx";

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
    items: [{ source: "", description: "", qty: 1, unitPrice: 0, total: 0 }],
    currency: "NGN",
    discountPercent: 0,
    taxPercent: 0,
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

  // User autocomplete for client fields
  const [userSuggestions, setUserSuggestions] = React.useState([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestTimer = React.useRef(null);

  function handleClientFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));

    // Trigger autocomplete on email or name fields
    if (field === "clientEmail" || field === "clientName") {
      clearTimeout(suggestTimer.current);
      if (value.trim().length >= 2) {
        suggestTimer.current = setTimeout(async () => {
          try {
            const data = await apiAuthed(
              `/admin/invoices/user-suggest?q=${encodeURIComponent(value.trim())}`,
              { token: accessToken },
            );
            setUserSuggestions(data?.users || []);
            setShowSuggestions(true);
          } catch {
            setUserSuggestions([]);
          }
        }, 300);
      } else {
        setUserSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }

  function pickSuggestion(user) {
    setForm((f) => ({
      ...f,
      clientEmail: user.email || f.clientEmail,
      clientName: user.name || f.clientName,
      clientPhone: user.phone || f.clientPhone,
    }));
    setShowSuggestions(false);
    setUserSuggestions([]);
  }

  // Product + training location catalog for line-item dropdown
  const [products, setProducts] = React.useState([]);
  const [trainingLocations, setTrainingLocations] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/products?page=1&pageSize=200`, {
            credentials: "include",
          }).then((r) => r.json()),
          fetch(`${API_BASE}/training-locations`, {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        setProducts(Array.isArray(pRes?.items) ? pRes.items : []);
        setTrainingLocations(
          Array.isArray(tRes?.locations) ? tRes.locations : [],
        );
      } catch {
        /* silent */
      }
    })();
  }, []);

  // Build the dropdown options for line items
  const lineItemOptions = React.useMemo(() => {
    const opts = [{ value: "", label: "— Custom item —", group: "custom" }];

    // Software products — add both monthly and yearly options
    for (const p of products) {
      const key = p.key || p._id;
      const monthlyNGN = Number(p.price?.monthlyNGN || 0);
      const monthlyUSD = Number(p.price?.monthlyUSD || 0);
      const yearlyNGN = Number(p.price?.yearlyNGN || 0);
      const yearlyUSD = Number(p.price?.yearlyUSD || 0);

      // Yearly option (prefer yearly price, fallback to monthly * 12)
      const yrNGN = yearlyNGN > 0 ? yearlyNGN : monthlyNGN * 12;
      const yrUSD = yearlyUSD > 0 ? yearlyUSD : monthlyUSD * 12;
      if (yrNGN > 0 || yrUSD > 0) {
        opts.push({
          value: `product-yr:${key}`,
          label: `${p.name} (Yearly) per PC/User`,
          group: "Products",
          priceNGN: yrNGN,
          priceUSD: yrUSD,
          description: `${p.name} (Yearly) per PC/User`,
        });
      }

      // Monthly option
      if (monthlyNGN > 0 || monthlyUSD > 0) {
        opts.push({
          value: `product-mo:${key}`,
          label: `${p.name} (Monthly) per PC/User`,
          group: "Products",
          priceNGN: monthlyNGN,
          priceUSD: monthlyUSD,
          description: `${p.name} (Monthly) per PC/User`,
        });
      }
    }

    // Training locations (physical training)
    for (const loc of trainingLocations) {
      opts.push({
        value: `training:${loc._id}`,
        label: `Physical Training — ${loc.name}${loc.city ? ` (${loc.city})` : ""}`,
        group: "Physical Training",
        priceNGN: Number(loc.trainingCostNGN || 0),
        priceUSD: Number(loc.trainingCostUSD || 0),
        description: `Physical Training — ${loc.name}`,
        durationDays: loc.durationDays || 1,
      });
      // BIM Install option per location
      if (Number(loc.bimInstallCostNGN || 0) > 0 || Number(loc.bimInstallCostUSD || 0) > 0) {
        opts.push({
          value: `bim:${loc._id}`,
          label: `BIM Software Install — ${loc.name}`,
          group: "Physical Training",
          priceNGN: Number(loc.bimInstallCostNGN || 0),
          priceUSD: Number(loc.bimInstallCostUSD || 0),
          description: `BIM Software Installation — ${loc.name}`,
        });
      }
    }

    return opts;
  }, [products, trainingLocations]);

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
      discountPercent: inv.discountPercent ?? 0,
      taxPercent: inv.taxPercent ?? 0,
      items:
        inv.items?.length > 0
          ? inv.items.map((it) => ({ source: it.source || "", ...it }))
          : [{ source: "", description: "", qty: 1, unitPrice: 0, total: 0 }],
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

  /** When user picks from the dropdown, auto-fill description + price */
  function selectLineSource(idx, sourceValue) {
    const opt = lineItemOptions.find((o) => o.value === sourceValue);
    if (!opt || !sourceValue) {
      // Custom — clear source, keep current description
      updateItem(idx, { source: "" });
      return;
    }

    const currency = form?.currency || "NGN";
    const price =
      currency === "USD"
        ? Number(opt.priceUSD || 0)
        : Number(opt.priceNGN || 0);

    updateItem(idx, {
      source: sourceValue,
      description: opt.description || opt.label,
      unitPrice: price,
      qty: 1,
      total: price,
    });
  }

  // When currency changes, re-price items that came from a catalog source
  React.useEffect(() => {
    if (!form?.items?.length) return;
    const currency = form.currency || "NGN";
    let changed = false;

    const updated = form.items.map((item) => {
      if (!item.source) return item;
      const opt = lineItemOptions.find((o) => o.value === item.source);
      if (!opt) return item;
      const price =
        currency === "USD"
          ? Number(opt.priceUSD || 0)
          : Number(opt.priceNGN || 0);
      if (price !== item.unitPrice) {
        changed = true;
        return {
          ...item,
          unitPrice: price,
          total: Number(item.qty || 1) * price,
        };
      }
      return item;
    });

    if (changed) setForm((f) => ({ ...f, items: updated }));
  }, [form?.currency]);

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { source: "", description: "", qty: 1, unitPrice: 0, total: 0 },
      ],
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
  const discPct = Math.min(Math.max(Number(form?.discountPercent || 0), 0), 100);
  const taxPct = Math.min(Math.max(Number(form?.taxPercent || 0), 0), 100);
  const discountAmount = Math.round((subtotal * discPct) / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxPct) / 100 * 100) / 100;
  const total = Math.max(afterDiscount + taxAmount, 0);

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
        discountPercent: Number(form.discountPercent || 0),
        taxPercent: Number(form.taxPercent || 0),
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
    if (!confirm("Are you sure you want to delete this invoice? This cannot be undone.")) return;
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
      const result = await apiAuthed(`/admin/invoices/${id}/send`, {
        token: accessToken,
        method: "POST",
      });
      load();
      setMsg(result?.message || "Invoice sent to client");
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
            <button
              className="btn btn-sm btn-ghost text-xs"
              onClick={async () => {
                try {
                  const r = await apiAuthed("/admin/invoices/relink-users", {
                    token: accessToken,
                    method: "POST",
                  });
                  setMsg(r?.message || "Relinked");
                } catch (e) {
                  setMsg(e.message || "Relink failed");
                }
              }}
              title="Link existing invoices to registered user accounts by matching email"
            >
              Relink Users
            </button>
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
                        onClick={() => {
                          startEdit(inv);
                          // small delay so form state sets, then switch to preview
                          setTimeout(() => setMode("preview"), 50);
                        }}
                      >
                        Preview
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
                      <button
                        className="text-rose-600 hover:underline"
                        onClick={() => deleteInvoice(inv._id)}
                      >
                        Delete
                      </button>
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

  // ── PREVIEW MODE ──
  if (mode === "preview" && form) {
    return (
      <InvoicePreview
        form={form}
        subtotal={subtotal}
        discountAmount={discountAmount}
        discPct={discPct}
        taxAmount={taxAmount}
        taxPct={taxPct}
        total={total}
        editId={editId}
        accessToken={accessToken}
        busy={busy}
        onBack={() => setMode("form")}
        onSend={() => editId && sendInvoice(editId)}
      />
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
            <div className="text-xs text-slate-500 mb-2">
              Start typing a client name or email to search registered users.
            </div>
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
              <div className="relative">
                <label>
                  Client Name
                  <input
                    className="input mt-1"
                    value={form.clientName || ""}
                    onChange={(e) =>
                      handleClientFieldChange("clientName", e.target.value)
                    }
                    onFocus={() =>
                      userSuggestions.length > 0 && setShowSuggestions(true)
                    }
                    onBlur={() =>
                      setTimeout(() => setShowSuggestions(false), 200)
                    }
                    autoComplete="off"
                  />
                </label>
                {showSuggestions && userSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full bg-white rounded-md shadow-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto">
                    {userSuggestions.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                        onMouseDown={() => pickSuggestion(u)}
                      >
                        <div className="font-medium">{u.name || u.email}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label>
                  Email
                  <input
                    type="email"
                    className="input mt-1"
                    value={form.clientEmail || ""}
                    onChange={(e) =>
                      handleClientFieldChange("clientEmail", e.target.value)
                    }
                    onFocus={() =>
                      userSuggestions.length > 0 && setShowSuggestions(true)
                    }
                    onBlur={() =>
                      setTimeout(() => setShowSuggestions(false), 200)
                    }
                    autoComplete="off"
                  />
                </label>
                {showSuggestions && userSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full bg-white rounded-md shadow-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto">
                    {userSuggestions.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                        onMouseDown={() => pickSuggestion(u)}
                      >
                        <div className="font-medium">{u.name || u.email}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs font-medium text-slate-500">
                      Item {idx + 1}
                    </div>
                    {form.items.length > 1 && (
                      <button
                        className="text-rose-500 text-xs hover:underline"
                        onClick={() => removeItem(idx)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Source dropdown */}
                  <label className="block text-sm mb-2">
                    Select product / training
                    <select
                      className="input mt-1"
                      value={item.source || ""}
                      onChange={(e) => selectLineSource(idx, e.target.value)}
                    >
                      <option value="">— Custom item —</option>
                      {products.length > 0 && (
                        <optgroup label="Software Products">
                          {lineItemOptions
                            .filter((o) => o.group === "Products")
                            .map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {trainingLocations.length > 0 && (
                        <optgroup label="Physical Training">
                          {lineItemOptions
                            .filter((o) => o.group === "Physical Training")
                            .map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </label>

                  <div className="grid grid-cols-12 gap-2 text-sm">
                    {/* Description */}
                    <div className="col-span-5">
                      <label className="text-xs text-slate-500">
                        Description
                      </label>
                      <input
                        className="input mt-0.5"
                        value={item.description || ""}
                        onChange={(e) =>
                          updateItem(idx, { description: e.target.value })
                        }
                        placeholder="Item description"
                      />
                    </div>
                    {/* Qty */}
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500">Qty</label>
                      <input
                        type="number"
                        min="1"
                        className="input mt-0.5"
                        value={item.qty || ""}
                        onChange={(e) =>
                          updateItem(idx, {
                            qty: Number(e.target.value || 0),
                          })
                        }
                      />
                    </div>
                    {/* Unit Price */}
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500">
                        Unit Price
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input mt-0.5"
                        value={item.unitPrice || ""}
                        onChange={(e) =>
                          updateItem(idx, {
                            unitPrice: Number(e.target.value || 0),
                          })
                        }
                      />
                    </div>
                    {/* Total */}
                    <div className="col-span-3 text-right">
                      <label className="text-xs text-slate-500">Total</label>
                      <div className="font-semibold mt-1.5">
                        {fmt(item.total, form.currency)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="text-sm text-adlm-blue-700 hover:underline mt-3"
              onClick={addItem}
            >
              + Add line item
            </button>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-3 text-sm">
              <label>
                Discount (%)
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input flex-1"
                    value={form.discountPercent || 0}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        discountPercent: Number(e.target.value || 0),
                      }))
                    }
                  />
                  <span className="text-slate-500">%</span>
                </div>
              </label>
              <label>
                Tax (%)
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input flex-1"
                    value={form.taxPercent || 0}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        taxPercent: Number(e.target.value || 0),
                      }))
                    }
                  />
                  <span className="text-slate-500">%</span>
                </div>
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
              {discPct > 0 && (
                <div>
                  Discount ({discPct}%):{" "}
                  <span className="font-medium text-rose-600">
                    - {fmt(discountAmount, form.currency)}
                  </span>
                </div>
              )}
              {taxPct > 0 && (
                <div>
                  Tax ({taxPct}%):{" "}
                  <span className="font-medium">
                    + {fmt(taxAmount, form.currency)}
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
              onClick={() => setMode("preview")}
            >
              Preview
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

/* ─────────────────────────────────────────────
   Invoice Preview — pixel-match to Figma design
   ───────────────────────────────────────────── */

/* Decorative dot grid (Figma has 5×3 dots on the right side) */
function InvoicePreview({
  form, subtotal, discountAmount, discPct, taxAmount, taxPct, total,
  onBack, onSend, editId, accessToken, busy,
}) {
  const previewRef = React.useRef(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  async function handleDownloadPdf() {
    if (!previewRef.current) return;
    setPdfBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const el = previewRef.current;
      const origW = el.style.width;
      el.style.width = "595px";

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        width: 595,
        windowWidth: 595,
      });

      el.style.width = origW;

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let yOff = 0;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, yOff, imgW, imgH);
      let remaining = imgH - pageH;
      while (remaining > 0) {
        pdf.addPage();
        yOff -= pageH;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, yOff, imgW, imgH);
        remaining -= pageH;
      }

      pdf.save(`${form?.invoiceNumber || "invoice"}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("PDF download failed. Use Print \u2192 Save as PDF instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; }
          .inv-page { box-shadow: none !important; }
        }
      `}</style>

      {/* Action bar */}
      <div className="no-print flex items-center justify-between gap-2 flex-wrap mb-4">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          Back to Editor
        </button>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
          <button className="btn btn-sm" onClick={handleDownloadPdf} disabled={pdfBusy}>
            {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
          {editId && (
            <button className="btn btn-sm"
              onClick={async () => {
                try {
                  const resp = await fetch(
                    `${API_BASE}/admin/invoices/${editId}/pdf`,
                    {
                      headers: { Authorization: `Bearer ${accessToken}` },
                      credentials: "include",
                    },
                  );
                  if (!resp.ok) throw new Error("PDF generation failed");
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${form?.invoiceNumber || "invoice"}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  alert(e.message || "Failed to download PDF");
                }
              }}
            >Server PDF</button>
          )}
          {form?.clientEmail && editId && (
            <button className="btn btn-sm text-white" style={{ backgroundColor: "#091E39" }}
              onClick={onSend} disabled={busy}
            >{busy ? "Sending…" : "Send to Client"}</button>
          )}
        </div>
      </div>

      {/* Shared invoice rendering */}
      <InvoicePreviewPage
        form={form}
        subtotal={subtotal}
        discountAmount={discountAmount}
        discPct={discPct}
        taxAmount={taxAmount}
        taxPct={taxPct}
        total={total}
        previewRef={previewRef}
      />
    </div>
  );
}
