import React from "react";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { payWithPaystack, verifyPaystack } from "../lib/paystack.js";
import { useCountry, isForeignBuyer } from "../lib/geo.js";
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
  const { accessToken, user } = useAuth();
  const [products, setProducts] = React.useState([]);

  // Auto-detected buyer location (IP → country, timezone fallback). Used only
  // to nudge checkout: foreign buyers default to USD pricing and see bank
  // transfer instead of the NGN-only card wall (Paystack declines most
  // non-Nigerian cards on an NGN charge). Never hard-blocks a payment.
  const geo = useCountry();
  const foreignBuyer = React.useMemo(
    () => isForeignBuyer(geo, user?.whatsapp),
    [geo, user?.whatsapp],
  );

  const [cart, setCart] = React.useState({});
  // The persist effect must not run before the restore effect has read
  // localStorage — otherwise the initial empty cart state wipes the items
  // the Products page just added, and nothing shows preselected.
  const cartHydratedRef = React.useRef(false);
  const [currency, setCurrency] = React.useState("NGN");
  // Once the buyer picks a currency by hand we never auto-override it.
  const currencyTouchedRef = React.useRef(false);

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

  // Master-detail config: which product is open in the middle panel, plus a
  // local draft the user edits before clicking the 3D "Add to order" button.
  const [activeKey, setActiveKey] = React.useState(null);
  const [draft, setDraft] = React.useState({ periods: 1, seats: 1, firstTime: false, storageBlocks: 0 });
  const configRef = React.useRef(null);
  const summaryRef = React.useRef(null);

  // Auto-renew opt-in (NGN card payments only). Sent with the order; applied
  // to the granted entitlements once the card payment is confirmed. The server
  // recomputes the price at each renewal — this flag never fixes a price.
  const [autoRenew, setAutoRenew] = React.useState(false);

  const [showManualPayModal, setShowManualPayModal] = React.useState(false);
  // Foreign buyers see bank transfer first; this reveals the card button only
  // if they say they hold a Nigerian card.
  const [showForeignCard, setShowForeignCard] = React.useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = React.useState(null);
  // Card payments run in NGN only — the pay modal uses the order's actual
  // currency (storage in the cart forces NGN even when the picker says USD).
  const [pendingCurrency, setPendingCurrency] = React.useState("NGN");
  const [bankDetails, setBankDetails] = React.useState(null);

  // If Paystack redirected back here (hosted-page fallback, or the popup
  // ended in a redirect), confirm the charge server-side before treating it
  // as paid. Verify is idempotent, so a re-run or webhook race is harmless.
  const paystackReturnRef = qs.get("reference") || qs.get("trxref");
  React.useEffect(() => {
    if (!paystackReturnRef || !accessToken) return;
    (async () => {
      setMsg("Confirming your payment…");
      try {
        const out = await verifyPaystack(paystackReturnRef, accessToken);
        if (out?.ok) {
          setCart({});
          clearCartStorage();
          navigate(`/receipt/${out.purchaseId}`, { replace: true });
        } else {
          setMsg(
            "We couldn't confirm the payment yet. If you were debited, it will be confirmed automatically — check your dashboard shortly.",
          );
        }
      } catch (e) {
        setMsg(e.message || "Payment confirmation failed");
      }
    })();
    // eslint-disable-next-line
  }, [paystackReturnRef, accessToken]);

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
    cartHydratedRef.current = true;

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

  // Deep link ?addon=storage-slots&for=KEY (from ProductDetail/StorageBar):
  // add that product to the order with 1 storage block pre-selected, in NGN.
  React.useEffect(() => {
    if ((qs.get("addon") || "") !== "storage-slots") return;
    const forKey = (qs.get("for") || "").trim();
    if (!forKey) return;
    setCurrency("NGN"); // storage is billed in NGN only
    setCart((c) => {
      const cur = c[forKey] || { periods: 1, seats: 1, firstTime: false };
      if (cur.storageBlocks) return c; // already set — don't clobber
      return { ...c, [forKey]: { ...cur, storageBlocks: 1 } };
    });
  }, [qs]);

  // Storage is NGN-only: while any item carries storage blocks, keep the order
  // in NGN so the total can never mix currencies.
  const anyStorageInCart = Object.values(cart).some(
    (e) => (parseInt(e?.storageBlocks || 0, 10) || 0) > 0,
  );
  React.useEffect(() => {
    if (anyStorageInCart && currency !== "NGN") setCurrency("NGN");
  }, [anyStorageInCart, currency]);

  // Auto-detected foreign buyers see USD pricing by default — but only as a
  // one-time nudge: we never override a currency the buyer picked by hand, and
  // storage in the cart still forces NGN. USD orders route to bank transfer,
  // sidestepping the NGN-only card wall that fails most foreign cards.
  React.useEffect(() => {
    if (
      foreignBuyer &&
      !currencyTouchedRef.current &&
      !anyStorageInCart &&
      currency === "NGN"
    ) {
      setCurrency("USD");
    }
  }, [foreignBuyer, anyStorageInCart, currency]);

  const productByKey = (key) =>
    products.find((x) => getProductKey(x) === key);

  // Yearly-billed products (courses) are capped at one year — the duration a
  // buyer picks means months, so 12 = 1 year and any value collapses to a
  // single yearly period. The server enforces the same rule.
  function clampPeriodsFor(p, n) {
    const v = Math.max(parseInt(n || 1, 10) || 1, 1);
    return p?.billingInterval === "yearly" ? 1 : v;
  }

  function updateItem(key, patch) {
    setCart((c) => {
      const cur = c[key] || { periods: 1, seats: 1, firstTime: false };
      const next = { ...cur, ...patch };

      next.periods = clampPeriodsFor(productByKey(key), next.periods);
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

  function removeFromCart(key) {
    setCart((c) => {
      const { [key]: _omit, ...rest } = c;
      return rest;
    });
  }

  // On phones/tablets the columns stack, so bring the relevant section into
  // view after an action (no-op on desktop where everything is visible).
  function smoothScrollTo(ref) {
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      }),
    );
  }

  // Select a product into the middle config panel. Loads its existing cart
  // config into the draft if present, else defaults. Does NOT add to the
  // order — that happens when the user clicks the 3D Add button.
  function selectProduct(key) {
    setActiveKey(key);
    const e = cart[key];
    setDraft(
      e
        ? { periods: e.periods, seats: e.seats, firstTime: !!e.firstTime, storageBlocks: e.storageBlocks || 0 }
        : { periods: 1, seats: 1, firstTime: false, storageBlocks: 0 },
    );
    smoothScrollTo(configRef);
  }

  // Patch the draft (clamped; seats locked to 1 for personal licenses).
  function patchDraft(patch) {
    const next = { ...draft, ...patch };
    next.periods = Math.max(parseInt(next.periods || 1, 10), 1);
    next.seats = Math.max(parseInt(next.seats || 1, 10), 1);
    if (licenseType !== "organization") next.seats = 1;
    else if (next.seats < 2) next.seats = 2; // org licences: minimum 2 users
    setDraft(next);

    // Live-sync: when the product is already in the order, config edits apply
    // to the order immediately. Otherwise a buyer can tick "First-time
    // install", skip "Update order", and pay without the install fee.
    if (activeKey && cart[activeKey]) {
      setCart((c) => ({
        ...c,
        [activeKey]: {
          periods: clampPeriodsFor(productByKey(activeKey), next.periods),
          seats:
            licenseType === "organization"
              ? Math.max(parseInt(next.seats || 2, 10), 2)
              : 1,
          firstTime: !!next.firstTime,
          storageBlocks: Math.max(
            parseInt(next.storageBlocks || 0, 10) || 0,
            0,
          ),
        },
      }));
    }
  }

  // Auto-open the configurator when landing with a restored cart or a
  // ?product= deep link — otherwise the middle panel sits on its placeholder
  // even though the Summary already shows items. One-shot: never fights a
  // selection the user has made.
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!products.length) return;
    if (activeKey) {
      autoOpenedRef.current = true;
      return;
    }
    const preferred = (qs.get("product") || "").trim();
    const keys = Object.keys(cart);
    const k =
      preferred && (cart[preferred] || productByKey(preferred))
        ? preferred
        : keys[0];
    if (!k) return;
    autoOpenedRef.current = true;
    selectProduct(k);
    // eslint-disable-next-line
  }, [products.length, cart, activeKey]);

  // Commit the current draft to the cart (add or update the active product).
  function commitActive() {
    if (!activeKey) return;
    setCart((c) => ({
      ...c,
      [activeKey]: {
        periods: clampPeriodsFor(productByKey(activeKey), draft.periods),
        seats:
          licenseType === "organization"
            ? Math.max(parseInt(draft.seats || 2, 10), 2)
            : 1,
        firstTime: !!draft.firstTime,
        storageBlocks: Math.max(parseInt(draft.storageBlocks || 0, 10) || 0, 0),
      },
    }));
    smoothScrollTo(summaryRef);
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
    const periods = clampPeriodsFor(p, entry.periods);
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

  // ── Per-product project-storage slots (NGN only) ──
  // Per-block price: product's storageSlotPriceNGN, else 3% of the active NGN
  // price (mirrors the product page's fallback exactly).
  function deriveStorageUnitNGN(p) {
    if (!p) return 0;
    const configured = Number(p?.storageSlotPriceNGN);
    if (Number.isFinite(configured) && configured > 0) return Math.round(configured);
    const pr = p?.price || {};
    const yearly = Number(pr.discountedYearlyNGN || pr.yearlyNGN || 0);
    const monthly = Number(pr.discountedMonthlyNGN || pr.monthlyNGN || 0);
    const activeNGN = p.billingInterval === "yearly" ? yearly : monthly;
    return Math.max(Math.round(activeNGN * 0.03), 0);
  }
  // Storage cost for a cart entry (NGN only — hidden/ignored for USD orders).
  function storageBlocksOf(entry) {
    return Math.max(parseInt(entry?.storageBlocks || 0, 10) || 0, 0);
  }
  function storageCostForEntry(p, entry) {
    const blocks = storageBlocksOf(entry);
    if (blocks <= 0 || currency !== "NGN") return 0;
    return money(blocks * deriveStorageUnitNGN(p));
  }
  const storageTotal = money(
    chosen.reduce(
      (sum, p) => sum + storageCostForEntry(p, cart[getProductKey(p)]),
      0,
    ),
  );

  const total = money(
    productsTotal + trainingCost + bimInstallCost + storageTotal,
  );

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
    if (!cartHydratedRef.current) return;
    const items = Object.entries(cart).map(([productKey, entry]) => ({
      productKey,
      periods: clampPeriodsFor(productByKey(productKey), entry?.periods),
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

  // Organization licences require a minimum of 2 users — bump any 1-seat items
  // when the buyer switches to an organization licence.
  React.useEffect(() => {
    if (licenseType !== "organization") return;
    setCart((c) => {
      const next = {};
      Object.entries(c).forEach(([k, v]) => {
        next[k] = { ...v, seats: Math.max(parseInt(v.seats || 2, 10), 2) };
      });
      return next;
    });
  }, [licenseType]);

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

  // currencyOverride lets the pay modal re-create a USD order in NGN so the
  // customer can pay by card (cards charge NGN only). Guarded because the Pay
  // button passes the click event as the first argument.
  async function createPendingPurchaseAndShowModal(currencyOverride) {
    const override =
      typeof currencyOverride === "string" ? currencyOverride : null;
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
          periods: clampPeriodsFor(p, entry.periods),
          firstTime: !!entry.firstTime,
          // Per-product project-storage blocks (server prices; NGN only).
          storageBlocks: storageBlocksOf(entry),
        };
      });

      const payload = {
        // Storage is NGN-only, so an order carrying storage is forced to NGN.
        currency: override || (anyStorageInCart ? "NGN" : currency),
        items,
        couponCode: couponCode.trim(),
        licenseType,
        organization: licenseType === "organization" ? org : null,
        autoRenew,
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
      setPendingCurrency(out.currency || payload.currency);

      // Fetch bank details from server (not hardcoded in frontend)
      try {
        const bd = await apiAuthed("/purchase/bank-details", {
          token: accessToken,
        });
        setBankDetails(bd);
      } catch {
        setBankDetails(null);
      }

      setShowForeignCard(false);
      setShowManualPayModal(true);
      setMsg(out.message || "Order created. Please pay manually and confirm.");
    } catch (e) {
      setMsg(e.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  async function payWithCard() {
    if (!pendingPurchaseId) {
      setMsg("No pending purchase found.");
      return;
    }

    setSubmitting(true);
    setMsg("");

    try {
      await payWithPaystack({
        purchaseId: pendingPurchaseId,
        accessToken,
        onSuccess: async (reference) => {
          // Never trust the popup alone — the server confirms the charge
          // with Paystack before the order is marked paid.
          try {
            setMsg("Confirming your payment…");
            const out = await verifyPaystack(reference, accessToken);
            if (out?.ok) {
              setCart({});
              clearCartStorage();
              setShowManualPayModal(false);
              setPendingPurchaseId(null);
              navigate(`/receipt/${out.purchaseId || pendingPurchaseId}`);
            } else {
              setMsg(
                "We couldn't confirm the payment yet. If you were debited, it will be confirmed automatically — check your dashboard shortly.",
              );
            }
          } catch (e) {
            setMsg(e.message || "Payment confirmation failed");
          }
        },
        onCancel: () => setMsg("Payment cancelled — you have not been charged."),
      });
    } catch (e) {
      setMsg(e.message || "Could not start card payment");
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
                  onChange={(e) => {
                    currencyTouchedRef.current = true;
                    setCurrency(e.target.value);
                  }}
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

      {/* Products (vertical list) · Configurator (middle) · Summary (right) */}
      <div className="grid lg:grid-cols-[260px_1fr_340px] gap-5 items-start">
        {/* LEFT — vertical product list */}
        <aside className="lg:sticky lg:top-20">
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
            Products
          </div>
          <div className="space-y-2">
            {products.map((p) => {
              const k = getProductKey(p);
              const inCart = !!cart[k];
              const active = activeKey === k;
              const { monthly, yearly } = getPrices(p);
              const unitShown = p.billingInterval === "yearly" ? yearly : monthly;
              return (
                <button
                  type="button"
                  key={p._id || k}
                  onClick={() => selectProduct(k)}
                  className={`w-full text-left rounded-xl border p-3 shadow-depth transition flex items-center gap-2.5 ${
                    active
                      ? "border-adlm-blue-700 ring-2 ring-adlm-blue-700 bg-blue-50/60 dark:bg-adlm-blue-700/10"
                      : "border-slate-200 dark:border-adlm-dark-border bg-white hover:border-adlm-blue-400"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      inCart ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                    title={inCart ? "In your order" : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900 dark:text-white truncate">
                      {p.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {fmt(unitShown, currency)} / {p.billingInterval === "yearly" ? "yr" : "mo"}
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`w-4 h-4 flex-shrink-0 transition ${
                      active ? "text-adlm-blue-700 dark:text-adlm-blue-400 translate-x-0.5" : "text-slate-300 dark:text-slate-600"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </aside>

        {/* MIDDLE — configurator for the active product */}
        <section ref={configRef} className="scroll-mt-24">
          {(() => {
            const p = activeKey
              ? products.find((pp) => getProductKey(pp) === activeKey)
              : null;
            if (!p) {
              return (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border p-10 text-center">
                  <div className="mx-auto w-12 h-12 rounded-xl grid place-items-center bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400 mb-3">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Pick a product to configure
                  </div>
                  <div className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                    Choose one from the list to set duration, seats and install —
                    then add it to your order.
                  </div>
                </div>
              );
            }
            const key = getProductKey(p);
            const prices = getPrices(p);
            const isYearly = p.billingInterval === "yearly";
            const presets = [1, 6, 12];
            const unitWord = isYearly ? "year" : "month";
            const calc = lineCalc(p, draft);
            const inCart = !!cart[key];
            const stepClass =
              "px-3.5 py-2 text-lg leading-none hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition select-none";
            const storageUnitP = deriveStorageUnitNGN(p);
            const draftBlocks = Math.max(parseInt(draft.storageBlocks || 0, 10) || 0, 0);
            const draftStorageCost =
              currency === "NGN" ? money(draftBlocks * storageUnitP) : 0;
            return (
              <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth-lg overflow-hidden">
                {/* header */}
                <div className="relative overflow-hidden bg-adlm-navy text-white p-5 md:p-6">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid-overlay opacity-40 mask-radial" />
                  <div aria-hidden="true" className="pointer-events-none absolute -top-12 right-6 w-44 h-44 rounded-full bg-adlm-blue-600/25 blur-3xl" />
                  <div className="relative">
                    {p.category && (
                      <div className="text-xs font-semibold uppercase tracking-wider text-blue-200/90">
                        {p.category}
                      </div>
                    )}
                    <h2 className="mt-1 text-xl md:text-2xl font-bold tracking-tight">{p.name}</h2>
                    {p.blurb && <p className="mt-1 text-sm text-blue-100/80 max-w-xl">{p.blurb}</p>}
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-2xl font-extrabold">
                        {fmt(isYearly ? prices.yearly : prices.monthly, currency)}
                      </span>
                      <span className="text-sm text-blue-100/80 mb-0.5">
                        / {unitWord}{licenseType === "organization" ? " · per seat" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* body */}
                <div className="p-5 md:p-6 space-y-6">
                  {/* Duration */}
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Duration{isYearly ? "" : " (months)"}
                    </div>
                    {isYearly ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-3.5 py-1.5 rounded-lg text-sm font-medium ring-1 bg-adlm-blue-700 text-white ring-adlm-blue-700">
                            1 year
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Course access runs for one year (12 months).
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {presets.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => patchDraft({ periods: n })}
                              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ring-1 transition ${
                                Number(draft.periods) === n
                                  ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                                  : "ring-slate-200 dark:ring-adlm-dark-border hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                              }`}
                            >
                              {n} mo
                            </button>
                          ))}
                          <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 dark:ring-adlm-dark-border overflow-hidden">
                            <button type="button" className={stepClass} onClick={() => patchDraft({ periods: Number(draft.periods || 1) - 1 })} aria-label="Decrease">−</button>
                            <input
                              type="number"
                              min="1"
                              value={draft.periods}
                              onChange={(e) => patchDraft({ periods: e.target.value })}
                              className="w-12 text-center bg-transparent outline-none py-2"
                            />
                            <button type="button" className={stepClass} onClick={() => patchDraft({ periods: Number(draft.periods || 1) + 1 })} aria-label="Increase">+</button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">Tip: 6 and 12 months unlock better pricing.</p>
                      </>
                    )}
                  </div>

                  {/* Seats */}
                  {licenseType === "organization" ? (
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Seats / users</div>
                      <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 dark:ring-adlm-dark-border overflow-hidden">
                        <button type="button" className={stepClass} onClick={() => patchDraft({ seats: Number(draft.seats || 1) - 1 })} aria-label="Decrease seats">−</button>
                        <input
                          type="number"
                          min="2"
                          value={draft.seats}
                          onChange={(e) => patchDraft({ seats: e.target.value })}
                          className="w-12 text-center bg-transparent outline-none py-2"
                        />
                        <button type="button" className={stepClass} onClick={() => patchDraft({ seats: Number(draft.seats || 1) + 1 })} aria-label="Increase seats">+</button>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Minimum 2 users for organization licences.</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Personal license · 1 seat. Switch to <b>Organization</b> in the header for multiple seats.
                    </div>
                  )}

                  {/* Install */}
                  {!!prices.install && (
                    <label className="flex items-start gap-3 rounded-xl ring-1 ring-slate-200 dark:ring-adlm-dark-border p-3 cursor-pointer">
                      <input type="checkbox" checked={draft.firstTime} onChange={(e) => patchDraft({ firstTime: e.target.checked })} className="mt-0.5" />
                      <span className="text-sm">
                        <span className="font-medium text-slate-800 dark:text-white">First-time install</span>
                        <span className="block text-xs text-slate-500">
                          One-time fee of {fmt(prices.install, currency)}
                          {licenseType === "organization" ? " per seat" : ""}.
                        </span>
                      </span>
                    </label>
                  )}

                  {/* Project storage (NGN only) */}
                  {currency === "NGN" && storageUnitP > 0 && (
                    <div className="rounded-xl ring-1 ring-slate-200 dark:ring-adlm-dark-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                          <span className="font-medium text-slate-800 dark:text-white">
                            Extra project storage
                          </span>
                          <span className="block text-xs text-slate-500">
                            {fmt(storageUnitP, "NGN")} per block of 10 slots
                          </span>
                        </div>
                        <div className="inline-flex items-center rounded-lg ring-1 ring-slate-200 dark:ring-adlm-dark-border overflow-hidden">
                          <button
                            type="button"
                            className={stepClass}
                            aria-label="Decrease storage"
                            onClick={() => patchDraft({ storageBlocks: Math.max(draftBlocks - 1, 0) })}
                          >
                            −
                          </button>
                          <input
                            className="w-14 text-center border-x border-slate-200 dark:border-adlm-dark-border py-2 bg-transparent"
                            inputMode="numeric"
                            value={draftBlocks}
                            onChange={(e) =>
                              patchDraft({ storageBlocks: Math.max(parseInt(e.target.value || "0", 10) || 0, 0) })
                            }
                          />
                          <button
                            type="button"
                            className={stepClass}
                            aria-label="Increase storage"
                            onClick={() => patchDraft({ storageBlocks: draftBlocks + 1 })}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {draftBlocks > 0 && (
                        <div className="mt-2 text-xs text-slate-500">
                          {draftBlocks * 10} extra slots · <b>{fmt(draftStorageCost, "NGN")}</b>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Live total + 3D Add button */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                    <div className="sm:flex-1">
                      <div className="text-xs text-slate-500">
                        {fmt(calc.unit, currency)} × {calc.seats} seat(s) × {calc.periods} {unitWord}(s)
                        {draft.firstTime ? " + install" : ""}
                        {draftStorageCost > 0 ? " + storage" : ""}
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                        {fmt(money(calc.total + draftStorageCost), currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inCart && (
                        <button
                          type="button"
                          onClick={() => removeFromCart(key)}
                          className="px-4 py-3 rounded-xl text-sm font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={commitActive}
                        className="btn-3d inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold text-white"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                        {inCart ? "Update order" : "Add to order"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* RIGHT — sticky live summary */}
        <aside ref={summaryRef} className="lg:sticky lg:top-20 scroll-mt-24">
          <div className="card">
            <h2 className="font-semibold mb-2">Summary</h2>

            {chosen.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">
                No items yet. Pick a product and tap <b>Add to order</b>.
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
                    const periodLabel = p.billingInterval === "yearly" ? "yr" : "mo";
                    const blocks = storageBlocksOf(entry);
                    const stgCost = storageCostForEntry(p, entry);

                    return (
                      <React.Fragment key={k}>
                        <button
                          type="button"
                          onClick={() => selectProduct(k)}
                          className="w-full flex items-center justify-between gap-3 text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              {p.name} · {calc.periods} {periodLabel} · {calc.seats} seat(s)
                              {entry.firstTime ? " + install" : ""}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{k}</div>
                          </div>
                          <div className="font-medium shrink-0">{fmt(calc.total, currency)}</div>
                        </button>
                        {blocks > 0 && stgCost > 0 && (
                          <div className="flex items-center justify-between gap-3 px-2 -mx-2 text-xs text-slate-500">
                            <div className="truncate">
                              ↳ Project storage · {blocks * 10} slots
                            </div>
                            <div className="font-medium shrink-0">{fmt(stgCost, "NGN")}</div>
                          </div>
                        )}
                      </React.Fragment>
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
                      <div className="font-medium">{fmt(trainingCost, currency)}</div>
                    </div>
                    {wantsBimInstall && bimInstallCost > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">BIM Software Installation</div>
                          <div className="text-xs text-slate-500">Office computers setup</div>
                        </div>
                        <div className="font-medium">{fmt(bimInstallCost, currency)}</div>
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
                    <button className="btn btn-sm" type="button" onClick={applyCoupon}>
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
                      <div>{vatCfg.label} ({vatCfg.percent}%)</div>
                      <div className="font-medium">+ {fmt(vatAmount, currency)}</div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-lg">
                    <div>Total</div>
                    <div className="font-semibold">{fmt(grandTotal, currency)}</div>
                  </div>
                </div>

                {/* Auto-renew opt-in — card payments only, so NGN orders only */}
                {(anyStorageInCart ? "NGN" : currency) === "NGN" && (
                  <label className="mt-4 flex items-start gap-2 cursor-pointer rounded-xl border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-adlm-blue-700"
                      checked={autoRenew}
                      onChange={(e) => setAutoRenew(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">Auto-renew my subscription</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Only applies when you pay by card. We'll charge the same
                        card at the then-current price shortly before expiry.
                        Turn it off anytime from your profile.
                      </span>
                    </span>
                  </label>
                )}

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

      {/* Manual payment modal */}
      {showManualPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowManualPayModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-depth-lg p-6 max-w-lg w-full z-10">
            <h3 className="text-lg font-semibold mb-2">Complete your payment</h3>

            {pendingCurrency === "NGN" ? (
              <div className="mb-4">
                {foreignBuyer && !showForeignCard ? (
                  // Detected foreign buyer on an NGN order: lead with bank
                  // transfer. Card charges here only clear reliably on
                  // Nigerian-issued cards, so we keep the card path behind an
                  // explicit opt-in rather than letting them hit a failed charge.
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-slate-700">
                    <div className="font-medium mb-1">
                      Paying from outside Nigeria?
                    </div>
                    Card payments here clear reliably only with{" "}
                    <b>Nigerian-issued cards</b>, so we recommend paying by bank
                    transfer (details below) to avoid a declined charge.
                    <button
                      type="button"
                      className="block underline text-xs text-slate-500 mt-2"
                      onClick={() => setShowForeignCard(true)}
                    >
                      I have a Nigerian card — let me pay by card anyway
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="btn w-full"
                      onClick={payWithCard}
                      disabled={submitting}
                    >
                      {submitting ? "Starting…" : "Pay with Card (Paystack)"}
                    </button>
                    <div className="text-xs text-slate-500 text-center mt-2">
                      {foreignBuyer
                        ? "Only Nigerian-issued cards clear reliably here. If yours is declined, use bank transfer below."
                        : "Foreign cards are charged in Naira — your bank converts the amount. You may be asked for an OTP by your bank."}
                    </div>
                    {autoRenew && (
                      <div className="text-xs text-emerald-700 text-center mt-1">
                        Auto-renew is on — this card will be saved for future
                        renewals (you can remove it from your profile).
                      </div>
                    )}
                  </>
                )}
                <div className="text-center text-xs text-slate-400 my-3">
                  — or pay by bank transfer —
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-slate-700">
                {foreignBuyer ? (
                  // USD order + detected foreign buyer: bank transfer is the
                  // reliable path. Card-in-NGN is offered only as a labelled
                  // fallback (works just for Nigerian-issued cards).
                  <>
                    <div className="font-medium mb-1">
                      Recommended: pay by bank transfer
                    </div>
                    Card payments here are processed in Nigerian Naira and clear
                    reliably only with a Nigerian-issued card. Please use the
                    bank transfer details below.
                    <button
                      type="button"
                      className="block underline text-xs text-slate-500 mt-3"
                      onClick={() => {
                        setCurrency("NGN");
                        createPendingPurchaseAndShowModal("NGN");
                      }}
                      disabled={submitting}
                    >
                      {submitting
                        ? "Switching…"
                        : "I have a Nigerian card — switch to NGN & pay by card"}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="font-medium mb-1">
                      Paying by card from outside Nigeria?
                    </div>
                    Card payments are charged in Nigerian Naira (NGN) — your bank
                    converts to your local currency automatically. Switch your
                    order to NGN to pay by card.
                    <button
                      className="btn w-full mt-3"
                      onClick={() => {
                        setCurrency("NGN");
                        createPendingPurchaseAndShowModal("NGN");
                      }}
                      disabled={submitting}
                    >
                      {submitting ? "Switching…" : "Switch to NGN & pay by card"}
                    </button>
                  </>
                )}
                <div className="text-center text-xs text-slate-400 my-3">
                  — or pay by bank transfer below —
                </div>
              </div>
            )}

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



