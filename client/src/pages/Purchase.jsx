import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useSearchParams, useNavigate } from "react-router-dom";
import LicenseScene from "../components/LicenseScene.jsx";

// Real 3D scene is lazy-loaded (it pulls in three.js) so it never blocks the
// initial checkout render; the SVG <LicenseScene> is the instant fallback.
const LicenseScene3D = React.lazy(() => import("../components/LicenseScene3D.jsx"));

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

  // Use the real 3D scene unless the user prefers reduced motion. Starts false
  // so the first paint uses the lightweight SVG, then upgrades to 3D.
  const [use3D, setUse3D] = React.useState(false);
  React.useEffect(() => {
    setUse3D(
      !(
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ),
    );
  }, []);

  // Product configuration drawer (which product's side panel is open)
  const [configKey, setConfigKey] = React.useState(null);

  const [showManualPayModal, setShowManualPayModal] = React.useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = React.useState(null);
  const [bankDetails, setBankDetails] = React.useState(null);

  // Physical training (org only)
  const [trainingLocations, setTrainingLocations] = React.useState([]);
  const [wantsTraining, setWantsTraining] = React.useState(false);
  const [selectedLocationId, setSelectedLocationId] = React.useState("");
  const [wantsBimInstall, setWantsBimInstall] = React.useState(false);

  // ── VAT (loaded from public settings) ──
  const [vatCfg, setVatCfg] = React.useState({
    enabled: false,
    percent: 0,
    label: "VAT",
  });
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings/vat`, { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        if (j?.applyToPurchases !== false) {
          setVatCfg({
            enabled: !!j?.enabled,
            percent: Number(j?.percent || 0),
            label: j?.label || "VAT",
          });
        }
      } catch { /* ignore — checkout still works without VAT preview */ }
    })();
  }, []);

  // ---------- money helpers ----------
  const round2 = (x) =>
    Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
  const money = (x) =>
    currency === "USD" ? round2(x) : Math.round(Number(x || 0));

  // Kept for backward compatibility — unused by new tier logic
  function pickBundleDiscount() { return null; }
  function discountFixedValue() { return 0; }

  // ---------- load products ----------
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products?page=1&pageSize=200`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
        const json = await res.json();
        setProducts(Array.isArray(json?.items) ? json.items : []);
      } catch (e) {
        console.error("Purchase products load error:", e);
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

  function ensureInCart(key) {
    setCart((c) =>
      c[key] ? c : { ...c, [key]: { periods: 1, seats: 1, firstTime: false } },
    );
  }

  function removeFromCart(key) {
    setCart((c) => {
      const { [key]: _omit, ...rest } = c;
      return rest;
    });
  }

  // Open the side configuration drawer for a product (adds it to the order
  // with sensible defaults so the right-hand summary updates immediately).
  function openConfig(key) {
    ensureInCart(key);
    setConfigKey(key);
  }

  /** Pick the best price: discounted if set, otherwise actual */
  function resolve(actual, discounted) {
    const d = Number(discounted || 0);
    const a = Number(actual || 0);
    return d > 0 && d < a ? d : a;
  }

  function getPrices(p) {
    const isUSD = currency === "USD";
    const pr = p?.price || {};

    const monthly = money(isUSD ? (pr.monthlyUSD || 0) : (pr.monthlyNGN || 0));
    const yearly = money(isUSD ? (pr.yearlyUSD || 0) : (pr.yearlyNGN || 0));
    const sixMonth = money(isUSD ? (pr.sixMonthUSD || 0) : (pr.sixMonthNGN || 0));
    const install = money(isUSD ? (pr.installUSD || 0) : (pr.installNGN || 0));

    const discountedMonthly = money(isUSD ? (pr.discountedMonthlyUSD || 0) : (pr.discountedMonthlyNGN || 0));
    const discountedYearly = money(isUSD ? (pr.discountedYearlyUSD || 0) : (pr.discountedYearlyNGN || 0));
    const discountedSixMonth = money(isUSD ? (pr.discountedSixMonthUSD || 0) : (pr.discountedSixMonthNGN || 0));

    return { monthly, yearly, sixMonth, install, discountedMonthly, discountedYearly, discountedSixMonth };
  }

  function lineCalc(p, entry) {
    if (!entry) return { recurring: 0, install: 0, total: 0 };

    const prices = getPrices(p);
    const periods = Math.max(parseInt(entry.periods || 1, 10), 1);
    const seats =
      licenseType === "organization"
        ? Math.max(parseInt(entry.seats || 1, 10), 1)
        : 1;

    let recurring = 0;
    const effMonthly = resolve(prices.monthly, prices.discountedMonthly);
    const effSixMonth = resolve(prices.sixMonth, prices.discountedSixMonth);
    const effYearly = resolve(prices.yearly, prices.discountedYearly);

    if (p.billingInterval === "yearly") {
      // Yearly-billed products: just yearly x periods x seats
      recurring = money(effYearly * periods * seats);
    } else {
      // Monthly-billed products: tier logic
      if (periods < 6) {
        // 1-5 months: monthly x months
        recurring = money(effMonthly * periods * seats);
      } else if (periods === 6) {
        // 6 months: use 6-month price if set, fallback to monthly x 6
        recurring = money((effSixMonth > 0 ? effSixMonth : effMonthly * 6) * seats);
      } else if (periods > 6 && periods < 12) {
        // 7-11 months: 6-month price + monthly x extra months
        const sixBase = effSixMonth > 0 ? effSixMonth : effMonthly * 6;
        const extra = effMonthly * (periods - 6);
        recurring = money((sixBase + extra) * seats);
      } else if (periods === 12) {
        // 12 months: use yearly price if set, fallback to monthly x 12
        recurring = money((effYearly > 0 ? effYearly : effMonthly * 12) * seats);
      } else {
        // 13+: yearly + monthly x (months - 12)
        const yearBase = effYearly > 0 ? effYearly : effMonthly * 12;
        const extra = effMonthly * (periods - 12);
        recurring = money((yearBase + extra) * seats);
      }
    }

    const installFee = entry.firstTime ? money(prices.install * seats) : 0;

    return {
      recurring,
      install: installFee,
      total: money(recurring + installFee),
      unit: p.billingInterval === "yearly" ? effYearly : effMonthly,
      seats,
      periods,
      discountApplied: false,
      discountType: null,
    };
  }

  const chosen = products.filter((p) => !!cart[getProductKey(p)]);

  // Physical training cost calculation
  const selectedLocation = trainingLocations.find(
    (l) => String(l._id) === selectedLocationId,
  );
  const trainingCost =
    wantsTraining && selectedLocation
      ? money(
          currency === "USD"
            ? selectedLocation.trainingCostUSD || 0
            : selectedLocation.trainingCostNGN || 0,
        )
      : 0;
  const bimInstallCost =
    wantsTraining && wantsBimInstall && selectedLocation
      ? money(
          currency === "USD"
            ? selectedLocation.bimInstallCostUSD || 0
            : selectedLocation.bimInstallCostNGN || 0,
        )
      : 0;

  const productsTotal = money(
    chosen.reduce(
      (sum, p) => sum + lineCalc(p, cart[getProductKey(p)]).total,
      0,
    ),
  );
  const total = money(productsTotal + trainingCost + bimInstallCost);

  const subtotalAfterDiscount = money(Math.max(total - Number(discount || 0), 0));
  const vatAmount =
    vatCfg.enabled && vatCfg.percent > 0
      ? money((subtotalAfterDiscount * vatCfg.percent) / 100)
      : 0;
  const grandTotal = money(subtotalAfterDiscount + vatAmount);
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

  }, [cart, licenseType, org]);

  React.useEffect(() => {
    if (licenseType === "organization") return;
    setCart((c) => {
      const next = {};
      Object.entries(c).forEach(([k, v]) => {
        next[k] = { ...v, seats: 1 };
      });
      return next;
    });
    // Reset training options when switching away from org
    setWantsTraining(false);
    setSelectedLocationId("");
    setWantsBimInstall(false);
  }, [licenseType]);

  // Load training locations when org is selected
  React.useEffect(() => {
    if (licenseType !== "organization") return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/training-locations`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        setTrainingLocations(Array.isArray(json?.locations) ? json.locations : []);
      } catch {
        setTrainingLocations([]);
      }
    })();
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
        if (wantsTraining && !selectedLocationId) {
          setSubmitting(false);
          setMsg("Please select a training location or uncheck the physical training option.");
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

      const payload = {
        currency,
        items,
        couponCode: couponCode.trim(),
        licenseType,
        organization: licenseType === "organization" ? org : null,
      };

      // Include physical training if org + selected
      if (
        licenseType === "organization" &&
        wantsTraining &&
        selectedLocationId
      ) {
        payload.physicalTraining = {
          requested: true,
          locationId: selectedLocationId,
          bimInstallRequested: wantsBimInstall,
        };
      }

      const out = await apiAuthed(`/purchase/cart`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setPendingPurchaseId(out.purchaseId || null);

      // Fetch bank details from server (not hardcoded in frontend)
      try {
        const bd = await apiAuthed("/purchase/bank-details", {
          token: accessToken,
        });
        setBankDetails(bd);
      } catch {
        setBankDetails(null);
      }

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

      <div className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white shadow-depth">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-10 w-64 h-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-20 left-1/4 w-64 h-64 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative p-5 md:p-7 grid lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-adlm-orange bg-adlm-orange/15 ring-1 ring-adlm-orange/30">
              Checkout
            </span>
            <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">Subscribe</h1>
            <p className="mt-1 text-sm text-blue-100/80 max-w-xl">
              Select products, duration, seats (for organization), and installation.
            </p>

            <div className="mt-5 flex items-end gap-3 flex-wrap">
              <label className="text-sm">
                <div className="mb-1 text-white/80 font-medium">Currency</div>
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
                <div className="mb-1 text-white/80 font-medium">Purchase for</div>
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

          {/* Animated persona scene — morphs with the selected license type.
              Real 3D when supported; SVG scene as instant / reduced-motion fallback. */}
          {use3D ? (
            <React.Suspense
              fallback={
                <LicenseScene
                  type={licenseType}
                  className="w-full max-w-[300px] mx-auto lg:max-w-none"
                />
              }
            >
              <LicenseScene3D
                type={licenseType}
                className="w-full max-w-[300px] mx-auto lg:max-w-none"
              />
            </React.Suspense>
          ) : (
            <LicenseScene
              type={licenseType}
              className="w-full max-w-[300px] mx-auto lg:max-w-none"
            />
          )}
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

          {/* Physical training option */}
          <div className="mt-4 pt-4 border-t">
            <label className="flex items-center gap-2 text-sm font-medium">
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
              Need physical training for your office?
            </label>
            <div className="text-xs text-slate-500 mt-1">
              An ADLM instructor will come to your office for hands-on training.
              Training date will be communicated after purchase approval.
            </div>

            {wantsTraining && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Training location <span className="text-rose-600">*</span>
                  <select
                    className="input mt-1"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                  >
                    <option value="">— Select location —</option>
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
                  <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-sm space-y-1">
                    <div>
                      <span className="text-slate-500">Location:</span>{" "}
                      {selectedLocation.name}
                      {selectedLocation.address
                        ? `, ${selectedLocation.address}`
                        : ""}
                    </div>
                    <div>
                      <span className="text-slate-500">Duration:</span>{" "}
                      {selectedLocation.durationDays || 1} day(s)
                    </div>
                    <div>
                      <span className="text-slate-500">Training cost:</span>{" "}
                      <b>{fmt(trainingCost, currency)}</b>
                    </div>
                  </div>
                )}

                {selectedLocation && (
                  <>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={wantsBimInstall}
                        onChange={(e) => setWantsBimInstall(e.target.checked)}
                      />
                      Also install BIM Softwares on office computers?
                    </label>
                    {wantsBimInstall && (
                      <div className="text-sm">
                        BIM software installation cost:{" "}
                        <b>{fmt(bimInstallCost, currency)}</b>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalog + live summary */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* LEFT — product catalog */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Choose your products
            </h2>
            <span className="text-xs text-slate-500">{chosen.length} in order</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {products.map((p) => {
              const k = getProductKey(p);
              const entry = cart[k];
              const inCart = !!entry;
              const { monthly, yearly, install } = getPrices(p);
              const unitShown = p.billingInterval === "yearly" ? yearly : monthly;
              const calc = inCart ? lineCalc(p, entry) : null;
              const periodLabel = p.billingInterval === "yearly" ? "yr" : "mo";

              return (
                <button
                  type="button"
                  key={p._id || k}
                  onClick={() => openConfig(k)}
                  className={`text-left group relative spotlight rounded-2xl border bg-white p-4 shadow-depth transition lift ${
                    inCart
                      ? "border-adlm-blue-700 ring-2 ring-adlm-blue-700"
                      : "border-slate-200 dark:border-adlm-dark-border hover:border-adlm-blue-400"
                  }`}
                >
                  {inCart && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      In order
                    </span>
                  )}
                  <div className="font-semibold text-slate-900 dark:text-white pr-16">
                    {p.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted clamp-2">
                    {p.blurb}
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {fmt(unitShown, currency)}
                    </span>
                    <span className="text-xs text-slate-500 mb-0.5">
                      / {p.billingInterval === "yearly" ? "year" : "month"}
                    </span>
                  </div>
                  {!!install && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      + {fmt(install, currency)} one-time install
                    </div>
                  )}
                  {inCart && calc ? (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-adlm-dark-border flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        {calc.periods} {periodLabel}
                        {calc.seats > 1 ? ` · ${calc.seats} seats` : ""}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {fmt(calc.total, currency)}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-adlm-blue-700 dark:text-adlm-blue-400">
                    {inCart ? "Edit configuration" : "Configure & add"}
                    <svg viewBox="0 0 24 24" className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — sticky live summary */}
        <aside className="lg:sticky lg:top-20">
          <div className="card">
            <h2 className="font-semibold mb-2">Summary</h2>

            {chosen.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">
                No items yet. Pick a product on the left to configure it.
              </div>
            ) : (
              <>
                {anyInstall && (
                  <div className="text-xs text-slate-500 mb-2">
                    Some items include <b>installation fee</b>.
                  </div>
                )}

                <div className="mt-3 space-y-1 text-sm">
                  {chosen.map((p) => {
                    const k = getProductKey(p);
                    const entry = cart[k];
                    const calc = lineCalc(p, entry);
                    const periodLabel =
                      p.billingInterval === "yearly" ? "yr" : "mo";

                    return (
                      <button
                        type="button"
                        key={k}
                        onClick={() => openConfig(k)}
                        className="w-full flex items-center justify-between gap-3 text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
                      >
                        <div className="min-w-0">
                          <div className="truncate">
                            {p.name} · {calc.periods} {periodLabel} · {calc.seats}{" "}
                            seat(s)
                            {entry.firstTime ? " + install" : ""}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{k}</div>
                        </div>
                        <div className="font-medium shrink-0">
                          {fmt(calc.total, currency)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Physical training line items in summary */}
                {wantsTraining && selectedLocation && (
                  <div className="mt-3 space-y-2 text-sm border-t pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate">
                          Physical Training — {selectedLocation.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {selectedLocation.durationDays || 1} day(s)
                        </div>
                      </div>
                      <div className="font-medium">
                        {fmt(trainingCost, currency)}
                      </div>
                    </div>
                    {wantsBimInstall && bimInstallCost > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">BIM Software Installation</div>
                          <div className="text-xs text-slate-500">
                            Office computers setup
                          </div>
                        </div>
                        <div className="font-medium">
                          {fmt(bimInstallCost, currency)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

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

                  {vatCfg.enabled && vatCfg.percent > 0 && (
                    <div className="flex items-center justify-between">
                      <div>
                        {vatCfg.label} ({vatCfg.percent}%)
                      </div>
                      <div className="font-medium">+ {fmt(vatAmount, currency)}</div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-lg">
                    <div>Total</div>
                    <div className="font-semibold">{fmt(grandTotal, currency)}</div>
                  </div>
                </div>

                <button
                  className="btn w-full mt-4"
                  onClick={createPendingPurchaseAndShowModal}
                  disabled={!chosen.length || submitting}
                >
                  {submitting ? "Processing…" : "Pay"}
                </button>

                {msg && <div className="text-sm mt-2">{msg}</div>}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Product configuration drawer */}
      {(() => {
        const p = configKey
          ? products.find((pp) => getProductKey(pp) === configKey)
          : null;
        const open = !!p;
        const key = p ? getProductKey(p) : "";
        const entry = p ? cart[key] : null;
        const prices = p ? getPrices(p) : null;
        const calc = p && entry ? lineCalc(p, entry) : null;
        const isYearly = p?.billingInterval === "yearly";
        const presets = isYearly ? [1, 2, 3] : [1, 6, 12];
        const unitWord = isYearly ? "year" : "month";
        const stepClass =
          "px-3 py-2 text-lg leading-none hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition select-none";
        return (
          <>
            <div
              className={`fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm transition-opacity ${
                open ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={() => setConfigKey(null)}
            />
            <aside
              className={`fixed top-0 right-0 bottom-0 z-[140] w-[420px] max-w-[92vw] bg-white dark:bg-adlm-dark-panel shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
                open ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {p && entry && (
                <>
                  <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-adlm-dark-border">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-adlm-blue-700 dark:text-adlm-blue-400">
                        Configure
                      </div>
                      <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                        {p.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfigKey(null)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-adlm-dark-hover"
                      aria-label="Close"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                        {fmt(isYearly ? prices.yearly : prices.monthly, currency)}
                      </span>
                      <span className="text-sm text-slate-500 mb-1">
                        / {unitWord}
                        {licenseType === "organization" ? " · per seat" : ""}
                      </span>
                    </div>

                    {/* Duration */}
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                        Duration ({isYearly ? "years" : "months"})
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2.5">
                        {presets.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => updateItem(key, { periods: n })}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ring-1 transition ${
                              Number(entry.periods) === n
                                ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                                : "ring-slate-200 dark:ring-adlm-dark-border hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                            }`}
                          >
                            {n} {isYearly ? (n > 1 ? "yrs" : "yr") : "mo"}
                          </button>
                        ))}
                      </div>
                      <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 dark:ring-adlm-dark-border overflow-hidden">
                        <button type="button" className={stepClass} onClick={() => updateItem(key, { periods: Math.max(1, Number(entry.periods || 1) - 1) })} aria-label="Decrease">−</button>
                        <input
                          type="number"
                          min="1"
                          value={entry.periods}
                          onChange={(e) => updateItem(key, { periods: e.target.value })}
                          className="w-14 text-center bg-transparent outline-none py-2"
                        />
                        <button type="button" className={stepClass} onClick={() => updateItem(key, { periods: Number(entry.periods || 1) + 1 })} aria-label="Increase">+</button>
                      </div>
                      {!isYearly && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Tip: 6 and 12 months unlock better pricing.
                        </p>
                      )}
                    </div>

                    {/* Seats */}
                    {licenseType === "organization" ? (
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                          Seats / users
                        </div>
                        <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 dark:ring-adlm-dark-border overflow-hidden">
                          <button type="button" className={stepClass} onClick={() => updateItem(key, { seats: Math.max(1, Number(entry.seats || 1) - 1) })} aria-label="Decrease seats">−</button>
                          <input
                            type="number"
                            min="1"
                            value={entry.seats}
                            onChange={(e) => updateItem(key, { seats: e.target.value })}
                            className="w-14 text-center bg-transparent outline-none py-2"
                          />
                          <button type="button" className={stepClass} onClick={() => updateItem(key, { seats: Number(entry.seats || 1) + 1 })} aria-label="Increase seats">+</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Personal license · 1 seat. Switch to <b>Organization</b> in
                        the header to buy multiple seats.
                      </div>
                    )}

                    {/* Install */}
                    {!!prices.install && (
                      <label className="flex items-start gap-3 rounded-xl ring-1 ring-slate-200 dark:ring-adlm-dark-border p-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.firstTime}
                          onChange={(e) => updateItem(key, { firstTime: e.target.checked })}
                          className="mt-0.5"
                        />
                        <span className="text-sm">
                          <span className="font-medium text-slate-800 dark:text-white">
                            First-time install
                          </span>
                          <span className="block text-xs text-slate-500">
                            One-time installation fee of {fmt(prices.install, currency)}
                            {licenseType === "organization" ? " per seat" : ""}.
                          </span>
                        </span>
                      </label>
                    )}

                    {/* Live item subtotal */}
                    {calc && (
                      <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4">
                        <div className="text-xs text-slate-500">
                          {fmt(calc.unit, currency)} × {calc.seats} seat(s) ×{" "}
                          {calc.periods} {unitWord}(s)
                          {entry.firstTime ? " + install" : ""}
                        </div>
                        <div className="mt-1 flex items-end justify-between">
                          <span className="text-sm text-slate-500">Item subtotal</span>
                          <span className="text-xl font-bold text-slate-900 dark:text-white">
                            {fmt(calc.total, currency)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-5 border-t border-slate-200 dark:border-adlm-dark-border flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        removeFromCart(key);
                        setConfigKey(null);
                      }}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigKey(null)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-adlm-blue-700 hover:bg-adlm-blue-600 shadow-glow-blue transition"
                    >
                      Done · {fmt(calc ? calc.total : 0, currency)}
                    </button>
                  </div>
                </>
              )}
            </aside>
          </>
        );
      })()}

      {/* Manual payment modal */}
      {showManualPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowManualPayModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-depth-lg p-6 max-w-lg w-full z-10">
            <h3 className="text-lg font-semibold mb-2">Pay to account</h3>
            <p className="text-sm text-slate-700 mb-4">
              Use the following account details to make payment, then click "I
              have paid".
            </p>

            <div className="space-y-2 mb-4">
              <div className="font-medium">Account number</div>
              <div className="text-lg">{bankDetails?.accountNumber || "Loading…"}</div>

              <div className="font-medium mt-2">Account name</div>
              <div className="text-lg">{bankDetails?.accountName || "Loading…"}</div>

              <div className="font-medium mt-2">Bank</div>
              <div className="text-lg">{bankDetails?.bankName || "Loading…"}</div>

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



