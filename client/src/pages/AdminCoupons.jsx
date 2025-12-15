import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminCoupons() {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  async function load() {
    setMsg("");
    try {
      const data = await apiAuthed("/admin/coupons", { token: accessToken });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg(e.message || "Failed to load coupons");
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setMsg("");

    const fd = new FormData(e.target);

    try {
      const payload = {
        code: fd.get("code"),
        description: fd.get("description") || "",
        type: fd.get("type"),
        value: Number(fd.get("value")),
        currency: fd.get("currency") || "NGN",
        minSubtotal: Number(fd.get("minSubtotal") || 0),
        maxRedemptions: fd.get("maxRedemptions")
          ? Number(fd.get("maxRedemptions"))
          : undefined,
        isActive: fd.get("isActive") === "on",

        // 🔥 Banner-related
        isBanner: fd.get("isBanner") === "on",
        bannerText: fd.get("bannerText") || "",
        startsAt: fd.get("startsAt") || null,
        endsAt: fd.get("endsAt") || null,
      };

      await apiAuthed("/admin/coupons", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      e.target.reset();
      await load();
      setMsg("Coupon created successfully.");
    } catch (e) {
      setMsg(e.message || "Create failed");
    }
  }

  async function toggleActive(c) {
    const path = c.isActive
      ? `/admin/coupons/${c._id}/disable`
      : `/admin/coupons/${c._id}/enable`;

    await apiAuthed(path, { token: accessToken, method: "POST" });
    load();
  }

  async function toggleBanner(c) {
    await apiAuthed(`/admin/coupons/${c._id}/banner`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isBanner: !c.isBanner }),
    });

    load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Coupons</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Create Coupon */}
      <div className="card">
        <h2 className="font-semibold mb-3">Create Coupon</h2>

        <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            name="code"
            placeholder="CODE e.g. ADLM50"
            required
          />

          <input
            className="input"
            name="description"
            placeholder="Internal description"
          />

          <label className="text-sm">
            <div className="mb-1">Type</div>
            <select className="input" name="type" defaultValue="percent">
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
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Currency (fixed only)</div>
            <select className="input" name="currency" defaultValue="NGN">
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1">Minimum Subtotal</div>
            <input className="input" name="minSubtotal" type="number" min="0" />
          </label>

          <label className="text-sm">
            <div className="mb-1">Max Redemptions</div>
            <input
              className="input"
              name="maxRedemptions"
              type="number"
              min="1"
            />
          </label>

          {/* 🔥 Banner controls */}
          <label className="sm:col-span-2 text-sm">
            <div className="mb-1">Banner Text (shown site-wide)</div>
            <input
              className="input"
              name="bannerText"
              placeholder="Use code ADLM50 to get 50% off"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Starts At</div>
            <input className="input" type="date" name="startsAt" />
          </label>

          <label className="text-sm">
            <div className="mb-1">Ends At</div>
            <input className="input" type="date" name="endsAt" />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked /> Active
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isBanner" /> Set as Banner
          </label>

          <button className="btn sm:col-span-2">Create Coupon</button>
        </form>
      </div>

      {/* Coupons List */}
      <div className="card">
        <h2 className="font-semibold mb-3">Coupons</h2>

        <div className="space-y-2">
          {items.map((c) => (
            <div
              key={c._id}
              className="border rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="text-sm">
                <div className="font-semibold">
                  {c.code}{" "}
                  {c.isBanner && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      Banner
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

                {(c.startsAt || c.endsAt) && (
                  <div className="text-xs text-slate-500 mt-1">
                    {c.startsAt
                      ? `From ${dayjs(c.startsAt).format("MMM D, YYYY")}`
                      : ""}
                    {c.endsAt
                      ? ` → ${dayjs(c.endsAt).format("MMM D, YYYY")}`
                      : ""}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={() => toggleActive(c)}>
                  {c.isActive ? "Disable" : "Enable"}
                </button>

                {c.isActive && (
                  <button
                    className="btn btn-sm"
                    onClick={() => toggleBanner(c)}
                  >
                    {c.isBanner ? "Remove Banner" : "Set Banner"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {!items.length && (
            <div className="text-sm text-slate-600">No coupons yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
