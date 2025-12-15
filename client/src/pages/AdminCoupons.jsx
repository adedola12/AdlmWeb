import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function normalizeCode(v) {
  return String(v || "")
    .trim()
    .toUpperCase();
}

function fmt(n, currency = "NGN") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(n || 0);
  } catch {
    return `${currency} ${Number(n || 0).toLocaleString()}`;
  }
}

function BannerPreview({
  code,
  type,
  value,
  currency,
  bannerText,
  startsAt,
  endsAt,
}) {
  const text =
    String(bannerText || "").trim() ||
    `Use code ${code} to get ${
      type === "percent" ? `${value}% off` : `${currency} ${value} off`
    }`;

  const duration =
    startsAt || endsAt
      ? ` (${startsAt ? dayjs(startsAt).format("MMM D") : "Now"} → ${
          endsAt ? dayjs(endsAt).format("MMM D") : "No expiry"
        })`
      : "";

  return (
    <div className="border rounded bg-blue-600 text-white px-3 py-2 text-sm">
      <b className="mr-2">{code || "CODE"}</b>
      {text}
      <span className="opacity-90">{duration}</span>
    </div>
  );
}

export default function AdminCoupons() {
  const { accessToken } = useAuth();

  const [items, setItems] = React.useState([]);
  const [products, setProducts] = React.useState([]); // for product-specific coupons
  const [statsById, setStatsById] = React.useState({});
  const [msg, setMsg] = React.useState("");

  // edit modal
  const [editing, setEditing] = React.useState(null); // coupon object or null

  async function loadAll() {
    setMsg("");
    try {
      const [list, stats] = await Promise.all([
        apiAuthed("/admin/coupons", { token: accessToken }),
        apiAuthed("/admin/coupons/stats", { token: accessToken }),
      ]);

      setItems(Array.isArray(list) ? list : []);
      setStatsById(stats?.statsById || {});
    } catch (e) {
      setMsg(e.message || "Failed to load coupons");
    }
  }

  // Load products for product-specific selection (using PUBLIC products endpoint is safest)
  // Load products for product-specific selection (ADMIN endpoint = all products in DB)
  async function loadProducts() {
    try {
      // admin/products already returns ALL (based on your Products.jsx logic)
      const res = await apiAuthed("/admin/products", { token: accessToken });
      const list = Array.isArray(res) ? res : [];
      setProducts(list);
    } catch (e) {
      console.error(e);
      setProducts([]);
    }
  }

  React.useEffect(() => {
    loadAll();
    loadProducts();
  }, []);

  async function create(e) {
    e.preventDefault();
    setMsg("");

    const fd = new FormData(e.target);

    const code = normalizeCode(fd.get("code"));
    const type = fd.get("type");
    const value = Number(fd.get("value"));
    const currency = fd.get("currency") || "NGN";

    const appliesToMode = fd.get("appliesToMode") || "all";
    const appliesToProductKeys = fd.getAll("appliesToProductKeys");

    const payload = {
      code,
      description: fd.get("description") || "",
      type,
      value,
      currency,
      minSubtotal: Number(fd.get("minSubtotal") || 0),
      maxRedemptions: fd.get("maxRedemptions")
        ? Number(fd.get("maxRedemptions"))
        : undefined,
      isActive: fd.get("isActive") === "on",

      isBanner: fd.get("isBanner") === "on",
      bannerText: fd.get("bannerText") || "",
      startsAt: fd.get("startsAt") || null,
      endsAt: fd.get("endsAt") || null,

      appliesTo: {
        mode: appliesToMode,
        productKeys: appliesToMode === "include" ? appliesToProductKeys : [],
      },
    };

    try {
      await apiAuthed("/admin/coupons", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      e.target.reset();
      await loadAll();
      setMsg("Coupon created.");
    } catch (e2) {
      setMsg(e2.message || "Create failed");
    }
  }

  async function toggleActive(c) {
    const path = c.isActive
      ? `/admin/coupons/${c._id}/disable`
      : `/admin/coupons/${c._id}/enable`;

    try {
      await apiAuthed(path, { token: accessToken, method: "POST" });
      loadAll();
    } catch (e) {
      setMsg(e.message || "Failed");
    }
  }

  async function toggleBanner(c) {
    try {
      await apiAuthed(`/admin/coupons/${c._id}/banner`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanner: !c.isBanner }),
      });
      loadAll();
    } catch (e) {
      setMsg(e.message || "Failed to toggle banner");
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing?._id) return;

    const fd = new FormData(e.target);

    const appliesToMode = fd.get("appliesToMode") || "all";
    const appliesToProductKeys = fd.getAll("appliesToProductKeys");

    const payload = {
      code: normalizeCode(fd.get("code")),
      description: fd.get("description") || "",
      type: fd.get("type"),
      value: Number(fd.get("value")),
      currency: fd.get("currency") || "NGN",
      minSubtotal: Number(fd.get("minSubtotal") || 0),
      maxRedemptions: fd.get("maxRedemptions")
        ? Number(fd.get("maxRedemptions"))
        : null,
      isActive: fd.get("isActive") === "on",

      isBanner: fd.get("isBanner") === "on",
      bannerText: fd.get("bannerText") || "",
      startsAt: fd.get("startsAt") || null,
      endsAt: fd.get("endsAt") || null,

      appliesTo: {
        mode: appliesToMode,
        productKeys: appliesToMode === "include" ? appliesToProductKeys : [],
      },
    };

    try {
      await apiAuthed(`/admin/coupons/${editing._id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setEditing(null);
      await loadAll();
      setMsg("Coupon updated.");
    } catch (err) {
      setMsg(err.message || "Update failed");
    }
  }

  // --- Create form live preview state
  const [preview, setPreview] = React.useState({
    code: "",
    type: "percent",
    value: 50,
    currency: "NGN",
    bannerText: "",
    startsAt: "",
    endsAt: "",
  });

  return (
    <div className="space-y-6 px-8 md:px-25 py-4">
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Admin · Coupons</h1>
          <button className="btn btn-sm" onClick={loadAll}>
            Refresh
          </button>
        </div>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Create coupon */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Create coupon</h2>

        {/* Preview */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Banner preview</div>
          <BannerPreview {...preview} />
          <div className="text-xs text-slate-500">
            Preview updates as you type. Banner only shows site-wide when coupon
            is active + set as banner.
          </div>
        </div>

        <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            name="code"
            placeholder="CODE e.g. ADLM50"
            required
            onChange={(e) =>
              setPreview((p) => ({ ...p, code: normalizeCode(e.target.value) }))
            }
          />

          <input
            className="input"
            name="description"
            placeholder="Internal description"
          />

          <label className="text-sm">
            <div className="mb-1">Type</div>
            <select
              className="input"
              name="type"
              defaultValue="percent"
              onChange={(e) =>
                setPreview((p) => ({ ...p, type: e.target.value }))
              }
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1">Value</div>
            <input
              className="input"
              name="value"
              type="number"
              min="1"
              step="0.01"
              required
              defaultValue={50}
              onChange={(e) =>
                setPreview((p) => ({
                  ...p,
                  value: Number(e.target.value || 0),
                }))
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Currency (fixed only)</div>
            <select
              className="input"
              name="currency"
              defaultValue="NGN"
              onChange={(e) =>
                setPreview((p) => ({ ...p, currency: e.target.value }))
              }
            >
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1">Min subtotal</div>
            <input
              className="input"
              name="minSubtotal"
              type="number"
              min="0"
              step="0.01"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Max redemptions (optional)</div>
            <input
              className="input"
              name="maxRedemptions"
              type="number"
              min="1"
              step="1"
            />
          </label>

          {/* Product-specific */}
          <label className="text-sm">
            <div className="mb-1">Applies to</div>
            <select className="input" name="appliesToMode" defaultValue="all">
              <option value="all">All products</option>
              <option value="include">Only selected products</option>
            </select>
          </label>

          <label className="text-sm sm:col-span-2">
            <div className="mb-1">
              Select products (only if "Only selected products")
            </div>
            <select
              className="input"
              name="appliesToProductKeys"
              multiple
              size={5}
            >
              {products.map((p) => {
                const k = p.key || p.slug || p._id; // fallback
                return (
                  <option key={k} value={k}>
                    {p.name} ({k})
                  </option>
                );
              })}
            </select>
          </label>

          {/* Banner */}
          <label className="text-sm sm:col-span-2">
            <div className="mb-1">Banner text (site-wide)</div>
            <input
              className="input"
              name="bannerText"
              placeholder="Use code ADLM50 to get 50% off"
              onChange={(e) =>
                setPreview((p) => ({ ...p, bannerText: e.target.value }))
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Starts at</div>
            <input
              className="input"
              name="startsAt"
              type="date"
              onChange={(e) =>
                setPreview((p) => ({ ...p, startsAt: e.target.value }))
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Ends at</div>
            <input
              className="input"
              name="endsAt"
              type="date"
              onChange={(e) =>
                setPreview((p) => ({ ...p, endsAt: e.target.value }))
              }
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked /> Active
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isBanner" /> Set as Banner
          </label>

          <button className="btn sm:col-span-2">Create</button>
        </form>
      </div>

      {/* Coupons list + analytics */}
      <div className="card">
        <h2 className="font-semibold mb-3">Coupons</h2>

        <div className="space-y-2">
          {items.map((c) => {
            const stats = statsById?.[String(c._id)] || {};
            const isExpired = c.endsAt && dayjs().isAfter(dayjs(c.endsAt));
            const appliesMode = c.appliesTo?.mode || "all";
            const allowedKeys = c.appliesTo?.productKeys || [];

            return (
              <div
                key={c._id}
                className="border rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="text-sm">
                  <div className="font-semibold flex items-center gap-2">
                    <span>{c.code}</span>
                    {c.isBanner && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        Banner
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                        Expired
                      </span>
                    )}
                  </div>

                  <div className="text-slate-600">
                    {c.type === "percent"
                      ? `${c.value}% off`
                      : `${c.currency} ${Number(c.value).toLocaleString()} off`}
                    {" · "}
                    Redeemed {c.redeemedCount}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                    {" · "}
                    {c.isActive ? "Active" : "Disabled"}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {c.startsAt
                      ? `From ${dayjs(c.startsAt).format("MMM D, YYYY")}`
                      : "No start date"}
                    {" · "}
                    {c.endsAt
                      ? `To ${dayjs(c.endsAt).format("MMM D, YYYY")}`
                      : "No end date"}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    Applies to:{" "}
                    {appliesMode === "all"
                      ? "All products"
                      : `Selected (${allowedKeys.length})`}
                  </div>

                  {/* ✅ analytics */}
                  <div className="text-xs text-slate-600 mt-2">
                    <b>Analytics:</b> Purchases: {stats.purchases || 0}
                    {" · "}
                    Total discount given:{" "}
                    {fmt(stats.totalDiscountGiven || 0, c.currency || "NGN")}
                    {" · "}
                    Last used:{" "}
                    {stats.lastUsedAt
                      ? dayjs(stats.lastUsedAt).format("MMM D, YYYY HH:mm")
                      : "-"}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-sm" onClick={() => setEditing(c)}>
                    Edit
                  </button>

                  <button
                    className="btn btn-sm"
                    onClick={() => toggleActive(c)}
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>

                  <button
                    className="btn btn-sm"
                    onClick={() => toggleBanner(c)}
                    disabled={!c.isActive}
                    title={
                      !c.isActive
                        ? "Coupon must be active to be a banner"
                        : "Toggle banner"
                    }
                  >
                    {c.isBanner ? "Remove Banner" : "Set Banner"}
                  </button>
                </div>
              </div>
            );
          })}

          {!items.length && (
            <div className="text-sm text-slate-600">No coupons yet.</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditing(null)}
          />
          <div className="relative bg-white rounded p-5 max-w-2xl w-full z-10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit coupon</h3>
              <button className="btn btn-sm" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            <BannerPreview
              code={editing.code}
              type={editing.type}
              value={editing.value}
              currency={editing.currency}
              bannerText={editing.bannerText}
              startsAt={editing.startsAt}
              endsAt={editing.endsAt}
            />

            <form onSubmit={saveEdit} className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1">Code</div>
                <input
                  className="input"
                  name="code"
                  defaultValue={editing.code}
                  required
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Description</div>
                <input
                  className="input"
                  name="description"
                  defaultValue={editing.description || ""}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Type</div>
                <select
                  className="input"
                  name="type"
                  defaultValue={editing.type}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1">Value</div>
                <input
                  className="input"
                  name="value"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={editing.value}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Currency (fixed only)</div>
                <select
                  className="input"
                  name="currency"
                  defaultValue={editing.currency || "NGN"}
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1">Min subtotal</div>
                <input
                  className="input"
                  name="minSubtotal"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing.minSubtotal || 0}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Max redemptions (optional)</div>
                <input
                  className="input"
                  name="maxRedemptions"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={editing.maxRedemptions ?? ""}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Applies to</div>
                <select
                  className="input"
                  name="appliesToMode"
                  defaultValue={editing.appliesTo?.mode || "all"}
                >
                  <option value="all">All products</option>
                  <option value="include">Only selected products</option>
                </select>
              </label>

              <label className="text-sm sm:col-span-2">
                <div className="mb-1">
                  Select products (only if "Only selected products")
                </div>
                <select
                  className="input"
                  name="appliesToProductKeys"
                  multiple
                  size={5}
                  defaultValue={editing.appliesTo?.productKeys || []}
                >
                  {products.map((p) => (
                    <option key={p.key || p._id} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm sm:col-span-2">
                <div className="mb-1">Banner text</div>
                <input
                  className="input"
                  name="bannerText"
                  defaultValue={editing.bannerText || ""}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Starts at</div>
                <input
                  className="input"
                  name="startsAt"
                  type="date"
                  defaultValue={
                    editing.startsAt
                      ? dayjs(editing.startsAt).format("YYYY-MM-DD")
                      : ""
                  }
                />
              </label>

              <label className="text-sm">
                <div className="mb-1">Ends at</div>
                <input
                  className="input"
                  name="endsAt"
                  type="date"
                  defaultValue={
                    editing.endsAt
                      ? dayjs(editing.endsAt).format("YYYY-MM-DD")
                      : ""
                  }
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={!!editing.isActive}
                />{" "}
                Active
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isBanner"
                  defaultChecked={!!editing.isBanner}
                />{" "}
                Set as Banner
              </label>

              <button className="btn sm:col-span-2">Save changes</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
