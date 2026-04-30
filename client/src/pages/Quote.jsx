import React from "react";
import { API_BASE } from "../config";
import { Link } from "react-router-dom";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    n || 0,
  );

export default function Quote() {
  const [products, setProducts] = React.useState([]);
  const [trainingLocations, setTrainingLocations] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [currency, setCurrency] = React.useState("NGN");

  // Selected items: { [productKey]: { selected, qty } }
  const [selected, setSelected] = React.useState({});
  const [wantsTraining, setWantsTraining] = React.useState(false);
  const [selectedLocationId, setSelectedLocationId] = React.useState("");
  const [wantsBimInstall, setWantsBimInstall] = React.useState(false);
  const [billingMode, setBillingMode] = React.useState("yearly"); // yearly | monthly

  // Email quote
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [emailTo, setEmailTo] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sentMsg, setSentMsg] = React.useState("");

  // VAT (loaded from public settings; only shown if applyToQuotes enabled)
  const [vatCfg, setVatCfg] = React.useState({ enabled: false, percent: 0, label: "VAT" });
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings/vat`, { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        if (j?.applyToQuotes !== false) {
          setVatCfg({
            enabled: !!j?.enabled,
            percent: Number(j?.percent || 0),
            label: j?.label || "VAT",
          });
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Load products + training locations
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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleProduct(key) {
    setSelected((s) => {
      if (s[key]) {
        const { [key]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [key]: { qty: 1 } };
    });
  }

  function setQty(key, qty) {
    setSelected((s) => ({
      ...s,
      [key]: { ...s[key], qty: Math.max(1, Number(qty) || 1) },
    }));
  }

  // Price helpers
  function getProductPrice(p) {
    const pr = p?.price || {};
    const isUSD = currency === "USD";
    if (billingMode === "yearly") {
      const yr = Number(isUSD ? pr.yearlyUSD : pr.yearlyNGN) || 0;
      const mo = Number(isUSD ? pr.monthlyUSD : pr.monthlyNGN) || 0;
      return yr > 0 ? yr : mo * 12;
    }
    return Number(isUSD ? pr.monthlyUSD : pr.monthlyNGN) || 0;
  }

  const selectedLocation = trainingLocations.find(
    (l) => String(l._id) === selectedLocationId,
  );

  const trainingCost =
    wantsTraining && selectedLocation
      ? Number(
          currency === "USD"
            ? selectedLocation.trainingCostUSD
            : selectedLocation.trainingCostNGN,
        ) || 0
      : 0;

  const bimCost =
    wantsTraining && wantsBimInstall && selectedLocation
      ? Number(
          currency === "USD"
            ? selectedLocation.bimInstallCostUSD
            : selectedLocation.bimInstallCostNGN,
        ) || 0
      : 0;

  // Build line items
  const lineItems = [];
  const selectedProducts = products.filter(
    (p) => selected[p.key || p._id],
  );

  for (const p of selectedProducts) {
    const key = p.key || p._id;
    const entry = selected[key];
    const unitPrice = getProductPrice(p);
    const qty = entry.qty || 1;
    lineItems.push({
      description: `${p.name} (${billingMode === "yearly" ? "Yearly" : "Monthly"}) per PC/User`,
      qty,
      unitPrice,
      total: unitPrice * qty,
    });
  }

  if (wantsTraining && trainingCost > 0) {
    lineItems.push({
      description: `Physical Training — ${selectedLocation?.name || ""}`,
      qty: 1,
      unitPrice: trainingCost,
      total: trainingCost,
    });
  }

  if (wantsTraining && wantsBimInstall && bimCost > 0) {
    lineItems.push({
      description: `BIM Software Installation — ${selectedLocation?.name || ""}`,
      qty: 1,
      unitPrice: bimCost,
      total: bimCost,
    });
  }

  const subtotal = lineItems.reduce((s, it) => s + it.total, 0);
  const curr = currency === "USD" ? "$" : "N";

  const vatAmount =
    vatCfg.enabled && vatCfg.percent > 0
      ? currency === "USD"
        ? Math.round((subtotal * vatCfg.percent) / 100 * 100) / 100
        : Math.round((subtotal * vatCfg.percent) / 100)
      : 0;
  const grandTotal = subtotal + vatAmount;

  // Print
  function handlePrint() {
    window.print();
  }

  // Email quote
  async function handleSendEmail() {
    if (!emailTo.trim()) return;
    setSending(true);
    setSentMsg("");
    try {
      const res = await fetch(`${API_BASE}/quote/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: emailTo.trim(),
          clientName: clientName.trim(),
          currency,
          lineItems,
          subtotal,
          billingMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send");
      setSentMsg("Quote sent to " + emailTo);
      setShowEmailForm(false);
    } catch (e) {
      setSentMsg(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-slate-500">Loading products...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          Quick Quotation
        </h1>
        <p className="text-slate-600 mt-1">
          Select the software products you need, number of PCs/users, and
          whether you need physical training. Get an instant price estimate.
        </p>
      </div>

      {/* Controls */}
      <div className="no-print mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 font-medium">Currency</div>
          <select
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="NGN">NGN (N)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1 font-medium">Billing</div>
          <select
            className="input"
            value={billingMode}
            onChange={(e) => setBillingMode(e.target.value)}
          >
            <option value="yearly">Yearly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>

      {/* Product selection */}
      <div className="mt-6">
        <h2 className="font-semibold text-lg mb-3 no-print">
          Select Software Products
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 no-print">
          {products
            .filter((p) => !p.isCourse)
            .map((p) => {
              const key = p.key || p._id;
              const isSelected = !!selected[key];
              const unitPrice = getProductPrice(p);
              return (
                <div
                  key={key}
                  onClick={() => toggleProduct(key)}
                  className={`cursor-pointer rounded-xl p-4 border-2 transition ${
                    isSelected
                      ? "border-[#091E39] bg-blue-50 ring-1 ring-[#091E39]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {p.blurb || ""}
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected
                          ? "bg-[#091E39] border-[#091E39]"
                          : "border-slate-300"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium" style={{ color: "#091E39" }}>
                    {fmt(unitPrice, currency)}{" "}
                    <span className="text-xs text-slate-500 font-normal">
                      / {billingMode === "yearly" ? "year" : "month"} per PC
                    </span>
                  </div>
                  {isSelected && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <label className="text-xs text-slate-600">
                        Number of PCs / Users
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input mt-1 w-full"
                        value={selected[key]?.qty || 1}
                        onChange={(e) => setQty(key, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Physical training */}
      <div className="mt-8 no-print">
        <h2 className="font-semibold text-lg mb-3">Physical Training</h2>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={wantsTraining}
              onChange={(e) => {
                setWantsTraining(e.target.checked);
                if (!e.target.checked) {
                  setSelectedLocationId("");
                  setWantsBimInstall(false);
                }
              }}
            />
            I need physical training at my office
          </label>
          <div className="text-xs text-slate-500 mt-1 ml-6">
            An ADLM instructor comes to your office for hands-on software training.
          </div>

          {wantsTraining && (
            <div className="mt-4 space-y-3 ml-6">
              <label className="block text-sm">
                Select location
                <select
                  className="input mt-1"
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {trainingLocations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name}
                      {loc.city ? ` — ${loc.city}` : ""}
                      {loc.state ? `, ${loc.state}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedLocation && (
                <>
                  <div className="text-sm">
                    <span className="text-slate-500">Training cost:</span>{" "}
                    <b>{fmt(trainingCost, currency)}</b>
                    <span className="text-xs text-slate-500 ml-2">
                      ({selectedLocation.durationDays || 1} day(s))
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantsBimInstall}
                      onChange={(e) => setWantsBimInstall(e.target.checked)}
                    />
                    Also install BIM software on office computers
                  </label>
                  {wantsBimInstall && bimCost > 0 && (
                    <div className="text-sm">
                      <span className="text-slate-500">
                        BIM install cost:
                      </span>{" "}
                      <b>{fmt(bimCost, currency)}</b>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ Quote Summary ═══════════ */}
      {lineItems.length > 0 && (
        <div className="mt-8">
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "2px solid #091E39" }}
          >
            {/* Summary header */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ backgroundColor: "#091E39", color: "#fff" }}
            >
              <h2 className="font-bold text-lg">Your Quotation</h2>
              <div className="text-sm opacity-80">
                {lineItems.length} item(s)
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{ backgroundColor: "#091E39", color: "#fff" }}
                  >
                    <th className="py-2 px-4 text-left font-semibold w-8">
                      #
                    </th>
                    <th className="py-2 px-4 text-left font-semibold">
                      Description
                    </th>
                    <th className="py-2 px-4 text-center font-semibold w-14">
                      Qty
                    </th>
                    <th className="py-2 px-4 text-right font-semibold w-24">
                      Rate
                    </th>
                    <th className="py-2 px-4 text-right font-semibold w-28">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        backgroundColor:
                          idx % 2 === 1 ? "#e5e5e5" : "#fff",
                      }}
                    >
                      <td className="py-2.5 px-4">{idx + 1}.</td>
                      <td className="py-2.5 px-4">{item.description}</td>
                      <td className="py-2.5 px-4 text-center">
                        {item.qty}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {curr}
                        {Number(item.unitPrice).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold">
                        {curr}
                        {Number(item.total).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total bar */}
              <div className="flex flex-col items-end gap-1 px-4 py-3">
                {vatCfg.enabled && vatCfg.percent > 0 && (
                  <div className="text-xs text-slate-600 space-y-0.5 text-right">
                    <div>
                      Subtotal: {curr}
                      {subtotal.toLocaleString()}
                    </div>
                    <div>
                      {vatCfg.label} ({vatCfg.percent}%): +{curr}
                      {vatAmount.toLocaleString()}
                    </div>
                  </div>
                )}
                <div
                  className="inline-flex items-center gap-6 px-5 py-2 rounded"
                  style={{
                    backgroundColor: "#091E39",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  <span>Estimated Total:</span>
                  <span>
                    {curr}
                    {grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="px-5 py-3 bg-slate-50 text-xs text-slate-500 border-t">
              This is an estimate only. Final pricing may vary. Contact us or
              proceed to{" "}
              <Link
                to="/purchase"
                className="text-[#091E39] font-medium underline"
              >
                Purchase
              </Link>{" "}
              to place an order.
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-3 no-print">
            <button
              className="btn"
              style={{ backgroundColor: "#091E39", color: "#fff" }}
              onClick={handlePrint}
            >
              Print Quote
            </button>
            <button
              className="btn"
              style={{ backgroundColor: "#E86A27", color: "#fff" }}
              onClick={() => setShowEmailForm(true)}
            >
              Email Quote
            </button>
            <Link
              to="/purchase"
              className="btn border border-[#091E39] text-[#091E39] bg-white hover:bg-slate-50"
            >
              Proceed to Purchase
            </Link>
          </div>

          {/* Email form */}
          {showEmailForm && (
            <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4 no-print max-w-md">
              <h3 className="font-semibold text-sm mb-3">
                Send quote to email
              </h3>
              <div className="space-y-2 text-sm">
                <label>
                  Your name
                  <input
                    className="input mt-1"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="John Doe"
                  />
                </label>
                <label>
                  Email address
                  <input
                    type="email"
                    className="input mt-1"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="you@company.com"
                  />
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn btn-sm"
                  style={{ backgroundColor: "#091E39", color: "#fff" }}
                  onClick={handleSendEmail}
                  disabled={sending || !emailTo.trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowEmailForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {sentMsg && (
            <div className="mt-3 text-sm text-emerald-700 no-print">
              {sentMsg}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {lineItems.length === 0 && (
        <div className="mt-8 text-center py-12 text-slate-400">
          <div className="text-4xl mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="font-medium text-slate-600">
            Select products above to see your quote
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Pick the software you need and set the number of PCs/users
          </div>
        </div>
      )}
    </div>
  );
}
