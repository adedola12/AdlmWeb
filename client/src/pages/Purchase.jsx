import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useSearchParams, useNavigate } from "react-router-dom";

const fmt = (n, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    n || 0,
  );

function getProductKey(p) {
  return String(p?.key || p?.slug || p?._id || "").trim();
}

function readCartItems() {
  try {
    const arr = JSON.parse(localStorage.getItem("cartItems") || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function readCartMeta() {
  try {
    return JSON.parse(localStorage.getItem("cartMeta") || "{}") || {};
  } catch {
    return {};
  }
}

function writeCartMeta(meta) {
  localStorage.setItem("cartMeta", JSON.stringify(meta || {}));
}

function clearCartStorage() {
  localStorage.setItem("cartItems", "[]");
  localStorage.setItem("cartCount", "0");
  localStorage.setItem("cartMeta", "{}");
}

export default function Purchase() {
  const { accessToken } = useAuth();
  const [products, setProducts] = React.useState([]);

  const [cart, setCart] = React.useState({});
  const [currency, setCurrency] = React.useState("NGN");

  const [licenseType, setLicenseType] = React.useState("personal");
  const [org, setOrg] = React.useState({ name: "", email: "", phone: "" });

  const [couponCode, setCouponCode] = React.useState("");
  const [couponInfo, setCouponInfo] = React.useState(null);
  const [discount, setDiscount] = React.useState(0);

  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [qs] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = qs.get("return") || "/dashboard";

  const [showManualPayModal, setShowManualPayModal] = React.useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = React.useState(null);

  // ---------- money helpers ----------
  const round2 = (x) =>
    Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
  const money = (x) =>
    currency === "USD" ? round2(x) : Math.round(Number(x || 0));

  function pickBundleDiscount(p, periods) {
    const d = p?.discounts || null;
    if (!d) return null;

    if (p.billingInterval === "yearly") {
      return periods === 1 ? d.oneYear || null : null;
    }

    if (periods === 6) return d.sixMonths || null;
    if (periods === 12) return d.oneYear || null;
    return null;
  }

  function discountFixedValue(d, currencyNow) {
    if (!d || d.type !== "fixed") return 0;
    if (currencyNow === "USD") {
      // NOTE: only applies if valueUSD is set (no fx conversion client-side)
      return Number(d.valueUSD || 0);
    }
    return Number(d.valueNGN || 0);
  }

  // ---------- load products ----------
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products?page=1&pageSize=200`, {
          credentials: "include",
        });
        const json = await res.json();
        setProducts(Array.isArray(json.items) ? json.items : []);
      } catch (e) {
        console.error(e);
        setProducts([]);
      }
    })();
  }, []);

  // ---------- restore cart + meta ----------
  React.useEffect(() => {
    if (!products.length) return;

    const meta = readCartMeta();
    const lt =
      String(meta?.licenseType || "personal").toLowerCase() === "organization"
        ? "organization"
        : "personal";

    setLicenseType(lt);
    setOrg({
      name: String(meta?.org?.name || ""),
      email: String(meta?.org?.email || ""),
      phone: String(meta?.org?.phone || ""),
    });

    const arr = readCartItems();
    if (!arr.length) return;

    setCart(() => {
      const next = {};
      arr.forEach((it) => {
        const k = String(it.productKey || "").trim();
        if (!k) return;

        const periods = Math.max(parseInt(it.periods ?? it.qty ?? 1, 10), 1);
        const seats = Math.max(parseInt(it.seats ?? 1, 10), 1);

        next[k] = {
          periods,
          seats: lt === "organization" ? seats : 1,
          firstTime: !!it.firstTime,
        };
      });
      return next;
    });
  }, [products.length]);

  // Prefill from ?product=KEY&periods=N
  React.useEffect(() => {
    const k = (qs.get("product") || "").trim();
    const p = Math.max(
      parseInt(qs.get("periods") || qs.get("months") || "1", 10),
      1,
    );
    if (!k) return;

    setCart((c) =>
      c[k]
        ? c
        : {
            ...c,
            [k]: { periods: p, seats: 1, firstTime: false },
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  function updateItem(key, patch) {
    setCart((c) => {
      const cur = c[key] || { periods: 1, seats: 1, firstTime: false };
      const next = { ...cur, ...patch };

      next.periods = Math.max(parseInt(next.periods || 1, 10), 1);
      next.seats = Math.max(parseInt(next.seats || 1, 10), 1);

      if (licenseType !== "organization") next.seats = 1;

      return { ...c, [key]: next };
    });
  }

  function toggleInCart(key) {
    setCart((c) =>
      c[key]
        ? (() => {
            const { [key]: _, ...rest } = c;
            return rest;
          })()
        : { ...c, [key]: { periods: 1, seats: 1, firstTime: false } },
    );
  }

  function getPrices(p) {
    const monthly =
      currency === "USD" ? p.price?.monthlyUSD : p.price?.monthlyNGN;
    const yearly = currency === "USD" ? p.price?.yearlyUSD : p.price?.yearlyNGN;
    const install =
      currency === "USD" ? p.price?.installUSD : p.price?.installNGN;

    return {
      monthly: money(monthly || 0),
      yearly: money(yearly || 0),
      install: money(install || 0),
    };
  }

  function lineCalc(p, entry) {
    if (!entry) return { recurring: 0, install: 0, total: 0 };

    const { monthly, yearly, install } = getPrices(p);
    const unit = p.billingInterval === "yearly" ? yearly : monthly;

    const periods = Math.max(parseInt(entry.periods || 1, 10), 1);
    const seats =
      licenseType === "organization"
        ? Math.max(parseInt(entry.seats || 1, 10), 1)
        : 1;

    let recurring = money(unit * seats * periods);

    const disc = pickBundleDiscount(p, periods);

    if (disc?.type === "percent") {
      const pct = Number(disc.valueNGN || 0);
      const factor = Math.max(0, 1 - pct / 100);
      recurring = money(unit * seats * periods * factor);
    }

    if (disc?.type === "fixed") {
      const fixedPerSeat = discountFixedValue(disc, currency);
      if (fixedPerSeat > 0) recurring = money(fixedPerSeat * seats);
    }

    const installFee = entry.firstTime ? money(install) : 0;

    return {
      recurring,
      install: installFee,
      total: money(recurring + installFee),
      unit,
      seats,
      periods,
      discountApplied: !!disc,
      discountType: disc?.type || null,
    };
  }

  const chosen = products.filter((p) => !!cart[getProductKey(p)]);
  const total = money(
    chosen.reduce(
      (sum, p) => sum + lineCalc(p, cart[getProductKey(p)]).total,
      0,
    ),
  );

  const grandTotal = money(Math.max(total - Number(discount || 0), 0));
  const productKeys = chosen.map((p) => getProductKey(p));

  async function applyCoupon() {
    setMsg("");
    setCouponInfo(null);
    setDiscount(0);

    if (!couponCode.trim()) return;
    if (!chosen.length) {
      setMsg("Select at least one item before applying a coupon.");
      return;
    }

    try {
      const out = await apiAuthed(`/coupons/validate`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          currency,
          subtotal: total,
          productKeys,
        }),
      });

      setCouponInfo(out.coupon || null);
      setDiscount(money(out.discount || 0));
    } catch (e) {
      setCouponInfo(null);
      setDiscount(0);
      setMsg(e.message || "Invalid coupon");
    }
  }

  // Persist cart + meta
  React.useEffect(() => {
    const items = Object.entries(cart).map(([productKey, entry]) => ({
      productKey,
      periods: Math.max(parseInt(entry?.periods || 1, 10), 1),
      seats:
        licenseType === "organization"
          ? Math.max(parseInt(entry?.seats || 1, 10), 1)
          : 1,
      firstTime: !!entry?.firstTime,
    }));

    localStorage.setItem("cartItems", JSON.stringify(items));
    localStorage.setItem("cartCount", String(items.length));

    writeCartMeta({
      licenseType,
      org:
        licenseType === "organization"
          ? org
          : { name: "", email: "", phone: "" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, licenseType, org.name, org.email, org.phone]);

  React.useEffect(() => {
    if (licenseType === "organization") return;
    setCart((c) => {
      const next = {};
      Object.entries(c).forEach(([k, v]) => {
        next[k] = { ...v, seats: 1 };
      });
      return next;
    });
  }, [licenseType]);

  async function createPendingPurchaseAndShowModal() {
    if (!chosen.length) return;

    setSubmitting(true);
    setMsg("");

    try {
      if (licenseType === "organization") {
        const name = String(org.name || "").trim();
        if (!name) {
          setSubmitting(false);
          setMsg("Organization name is required for organization purchase.");
          return;
        }
      }

      const items = chosen.map((p) => {
        const k = getProductKey(p);
        const entry = cart[k];

        return {
          productKey: k,
          seats:
            licenseType === "organization"
              ? Math.max(parseInt(entry.seats || 1, 10), 1)
              : 1,
          periods: Math.max(parseInt(entry.periods || 1, 10), 1),
          firstTime: !!entry.firstTime,
        };
      });

      const out = await apiAuthed(`/purchase/cart`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          items,
          couponCode: couponCode.trim(),
          licenseType,
          organization: licenseType === "organization" ? org : null,
        }),
      });

      setPendingPurchaseId(out.purchaseId || null);
      setShowManualPayModal(true);
      setMsg(out.message || "Order created. Please pay manually and confirm.");
    } catch (e) {
      setMsg(e.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmManualPayment() {
    if (!pendingPurchaseId) {
      setMsg("No pending purchase found.");
      return;
    }

    setSubmitting(true);
    setMsg("");

    try {
      await apiAuthed(`/purchase/${pendingPurchaseId}/confirm-manual`, {
        token: accessToken,
        method: "POST",
      });

      setCart({});
      clearCartStorage();

      setShowManualPayModal(false);
      setPendingPurchaseId(null);

      navigate(`${returnTo}?notice=purchase_pending`);
    } catch (e) {
      setMsg(e.message || "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  }

  const anyInstall = chosen.some((p) => !!cart[getProductKey(p)]?.firstTime);
  const showOrgPanel = licenseType === "organization";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <style>{`
        .clamp-2{
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
      `}</style>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Subscribe</h1>
          <p className="text-sm text-slate-600">
            Select products, duration, seats (for organization), and
            installation.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <div className="mb-1">Currency</div>
            <select
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="NGN">NGN (₦)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1">Purchase for</div>
            <select
              className="input"
              value={licenseType}
              onChange={(e) =>
                setLicenseType(
                  e.target.value === "organization"
                    ? "organization"
                    : "personal",
                )
              }
            >
              <option value="personal">Personal</option>
              <option value="organization">Organization</option>
            </select>
          </label>
        </div>
      </div>

      {showOrgPanel && (
        <div className="card">
          <h2 className="font-semibold mb-2">Organization details</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">
              Organization name <span className="text-rose-600">*</span>
              <input
                className="input mt-1"
                value={org.name}
                onChange={(e) =>
                  setOrg((o) => ({ ...o, name: e.target.value }))
                }
                placeholder="e.g. ADLM Studio"
              />
            </label>

            <label className="text-sm">
              Organization email (optional)
              <input
                className="input mt-1"
                value={org.email}
                onChange={(e) =>
                  setOrg((o) => ({ ...o, email: e.target.value }))
                }
                placeholder="accounts@company.com"
              />
            </label>

            <label className="text-sm">
              Phone (optional)
              <input
                className="input mt-1"
                value={org.phone}
                onChange={(e) =>
                  setOrg((o) => ({ ...o, phone: e.target.value }))
                }
                placeholder="+234..."
              />
            </label>
          </div>

          <div className="text-xs text-slate-500 mt-2">
            Seats you choose on each product will be treated as number of
            users/devices your organization needs.
          </div>
        </div>
      )}

      {/* Catalog */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const k = getProductKey(p);
          const entry = cart[k];
          const inCart = !!entry;

          const qtyLabel = p.billingInterval === "yearly" ? "Years" : "Months";
          const { monthly, yearly, install } = getPrices(p);
          const unitShown = p.billingInterval === "yearly" ? yearly : monthly;

          const calc = inCart ? lineCalc(p, entry) : null;

          return (
            <div
              key={p._id || k}
              className={`border rounded p-3 ${inCart ? "ring-2 ring-blue-500" : ""}`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-slate-600 clamp-2">{p.blurb}</div>

              <div className="mt-2 text-sm">
                Billing:{" "}
                <span className="font-medium">{p.billingInterval}</span>
              </div>

              <div className="text-sm mt-2">
                Price:{" "}
                <span className="font-medium">
                  {fmt(unitShown, currency)} /{" "}
                  {p.billingInterval === "yearly" ? "year" : "month"}
                </span>
              </div>

              {!!install && (
                <div className="text-xs text-slate-500 mt-1">
                  Install fee (first time): {fmt(install, currency)}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button className="btn btn-sm" onClick={() => toggleInCart(k)}>
                  {inCart ? "Remove" : "Add"}
                </button>
              </div>

              {inCart && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm">
                    {qtyLabel} (periods)
                    <input
                      type="number"
                      min="1"
                      className="input mt-1"
                      value={entry.periods}
                      onChange={(e) =>
                        updateItem(k, { periods: e.target.value })
                      }
                    />
                  </label>

                  <label className="block text-sm">
                    Seats
                    <input
                      type="number"
                      min="1"
                      className="input mt-1"
                      value={licenseType === "organization" ? entry.seats : 1}
                      disabled={licenseType !== "organization"}
                      onChange={(e) => updateItem(k, { seats: e.target.value })}
                    />
                    {licenseType !== "organization" && (
                      <div className="text-xs text-slate-500 mt-1">
                        Seats is locked to 1 for personal purchases.
                      </div>
                    )}
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.firstTime}
                      onChange={(e) =>
                        updateItem(k, { firstTime: e.target.checked })
                      }
                    />
                    First-time user? (add install fee)
                  </label>

                  {calc && (
                    <div className="text-sm space-y-1">
                      <div className="text-xs text-slate-500">
                        {licenseType === "organization"
                          ? "Organization license"
                          : "Personal license"}
                        {showOrgPanel && org.name ? ` · ${org.name}` : ""}
                      </div>

                      <div className="text-xs text-slate-500">
                        {fmt(calc.unit, currency)} × {calc.seats} seat(s) ×{" "}
                        {calc.periods} period(s)
                      </div>

                      <div>
                        Subtotal:{" "}
                        <span className="font-semibold">
                          {fmt(calc.total, currency)}
                        </span>
                        {entry.firstTime ? (
                          <span className="text-xs text-slate-500">
                            {" "}
                            (incl. install)
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="card">
        <h2 className="font-semibold mb-2">Summary</h2>

        {chosen.length === 0 ? (
          <div className="text-sm text-slate-600">No items selected.</div>
        ) : (
          <>
            {anyInstall && (
              <div className="text-xs text-slate-500 mb-2">
                Some items include <b>installation fee</b>.
              </div>
            )}

            <div className="mt-3 space-y-2 text-sm">
              {chosen.map((p) => {
                const k = getProductKey(p);
                const entry = cart[k];
                const calc = lineCalc(p, entry);

                const periodLabel =
                  p.billingInterval === "yearly" ? "yr" : "mo";

                return (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate">
                        {p.name} · {calc.periods} {periodLabel} · {calc.seats}{" "}
                        seat(s)
                        {entry.firstTime ? " + install" : ""}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{k}</div>
                    </div>
                    <div className="font-medium">
                      {fmt(calc.total, currency)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon */}
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium mb-2">Discount coupon</div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                />
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={applyCoupon}
                >
                  Apply
                </button>
              </div>

              {couponInfo && (
                <div className="text-sm text-emerald-700 mt-2">
                  Applied: <b>{couponInfo.code}</b> · Discount:{" "}
                  <b>{fmt(discount, currency)}</b>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="mt-4 border-t pt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div>Subtotal</div>
                <div className="font-medium">{fmt(total, currency)}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>Discount</div>
                <div className="font-medium">- {fmt(discount, currency)}</div>
              </div>

              <div className="flex items-center justify-between text-lg">
                <div>Total</div>
                <div className="font-semibold">{fmt(grandTotal, currency)}</div>
              </div>
            </div>

            <button
              className="btn mt-4"
              onClick={createPendingPurchaseAndShowModal}
              disabled={!chosen.length || submitting}
            >
              {submitting ? "Processing…" : "Pay"}
            </button>

            {msg && <div className="text-sm mt-2">{msg}</div>}
          </>
        )}
      </div>

      {/* Manual payment modal */}
      {showManualPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowManualPayModal(false)}
          />
          <div className="relative bg-white rounded p-6 max-w-lg w-full z-10">
            <h3 className="text-lg font-semibold mb-2">Pay to account</h3>
            <p className="text-sm text-slate-700 mb-4">
              Use the following account details to make payment, then click "I
              have paid".
            </p>

            <div className="space-y-2 mb-4">
              <div className="font-medium">Account number</div>
              <div className="text-lg">1634998770</div>

              <div className="font-medium mt-2">Account name</div>
              <div className="text-lg">ADLM Studio</div>

              <div className="font-medium mt-2">Bank</div>
              <div className="text-lg">Access Bank</div>

              <div className="text-xs text-slate-500 mt-2">
                After you click "I have paid", we clear your cart locally and
                the admin will verify.
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost"
                onClick={() => setShowManualPayModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={confirmManualPayment}
                disabled={submitting}
              >
                {submitting ? "Confirming…" : "I have paid"}
              </button>
            </div>

            {msg && <div className="text-sm mt-3">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
