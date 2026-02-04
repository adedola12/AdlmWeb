// src/pages/AdminUsersLite.jsx
import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

const STATUS_LABEL = {
  active: "Active",
  expired: "Expired",
  inactive: "Inactive",
  disabled: "Disabled",
};

const UNPAID_TAB_ID = "__unpaid_attempts__";

function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, header, rows, rowToCells) {
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...(rows || []).map((r) => rowToCells(r).map(escapeCsvCell).join(",")),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function statusRank(s) {
  const key = String(s || "").toLowerCase();
  const order = { active: 1, expired: 2, inactive: 3, disabled: 4 };
  return order[key] || 99;
}

function normalizePurchases(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function buildAttemptedItem(p) {
  // If cart purchase
  if (Array.isArray(p?.lines) && p.lines.length > 0) {
    const names = p.lines
      .map((ln) => ln?.name || ln?.productName || ln?.productKey || "")
      .filter(Boolean);
    if (names.length) return names.join(" · ");
  }

  // Single product purchase
  return (
    p?.name ||
    p?.productName ||
    p?.productTitle ||
    p?.productKey ||
    p?.sku ||
    "—"
  );
}

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function purchaseToLiteRow(p) {
  const email = pickFirstNonEmpty(p?.email, p?.user?.email, p?.customer?.email);

  const firstName = pickFirstNonEmpty(
    p?.firstName,
    p?.user?.firstName,
    p?.customer?.firstName,
  );

  const lastName = pickFirstNonEmpty(
    p?.lastName,
    p?.user?.lastName,
    p?.customer?.lastName,
  );

  const attemptedItem = buildAttemptedItem(p);

  return {
    firstName,
    lastName,
    email,
    attemptedItem,
    createdAt: p?.createdAt || null,
  };
}

export default function AdminUsersLite() {
  const { accessToken } = useAuth();

  const [tabs, setTabs] = React.useState([]);
  const [tab, setTab] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("name_asc"); // name_asc | name_desc | status_asc | status_desc

  const isUnpaidTab = tab === UNPAID_TAB_ID;

  async function loadTabs() {
    setMsg("");
    try {
      const [tabsData, pendingData] = await Promise.all([
        apiAuthed("/admin/users-lite/tabs", { token: accessToken }),
        apiAuthed("/admin/purchases?status=pending", { token: accessToken }),
      ]);

      const list = Array.isArray(tabsData?.tabs) ? tabsData.tabs : [];
      const pending = normalizePurchases(pendingData);

      const unpaidTab = {
        id: UNPAID_TAB_ID,
        title: "Unpaid Attempts",
        count: pending.length,
      };

      const merged = [...list, unpaidTab];
      setTabs(merged);

      if (!tab && merged.length) setTab(merged[0].id);
    } catch (e) {
      setMsg(e.message || "Failed to load tabs");
    }
  }

  async function loadUsersLite(nextTab) {
    const t = nextTab || tab;
    if (!t) return;

    setLoading(true);
    setMsg("");
    try {
      const data = await apiAuthed(
        `/admin/users-lite/list?tab=${encodeURIComponent(t)}`,
        { token: accessToken },
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setMsg(e.message || "Failed to load users");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnpaidAttempts() {
    setLoading(true);
    setMsg("");
    try {
      const data = await apiAuthed(`/admin/purchases?status=pending`, {
        token: accessToken,
      });

      const purchases = normalizePurchases(data);

      // Sort newest first (if createdAt exists)
      purchases.sort((a, b) => {
        const ax = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bx = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bx - ax;
      });

      // Aggregate by email (one row per user), combine attempted items uniquely
      const map = new Map(); // emailLower -> {firstName,lastName,email, items:Set, createdAt}
      for (const p of purchases) {
        const r = purchaseToLiteRow(p);
        if (!r.email) continue;

        const key = String(r.email).toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            firstName: r.firstName || "",
            lastName: r.lastName || "",
            email: r.email,
            _items: new Set(),
            createdAt: r.createdAt || null,
          });
        }

        const agg = map.get(key);

        // prefer first non-empty first/last name seen
        if (!agg.firstName && r.firstName) agg.firstName = r.firstName;
        if (!agg.lastName && r.lastName) agg.lastName = r.lastName;

        if (r.attemptedItem && r.attemptedItem !== "—") {
          // if attemptedItem contains " · " already, split to avoid duplicate bundles
          const parts = String(r.attemptedItem)
            .split("·")
            .map((s) => s.trim())
            .filter(Boolean);
          if (parts.length) parts.forEach((x) => agg._items.add(x));
          else agg._items.add(String(r.attemptedItem).trim());
        }
      }

      const result = Array.from(map.values()).map((x) => ({
        firstName: x.firstName,
        lastName: x.lastName,
        email: x.email,
        attemptedItem: x._items.size ? Array.from(x._items).join(" · ") : "—",
        createdAt: x.createdAt,
      }));

      setRows(result);

      // update tab count live
      setTabs((prev) =>
        prev.map((t) =>
          t.id === UNPAID_TAB_ID ? { ...t, count: result.length } : t,
        ),
      );
    } catch (e) {
      setMsg(e.message || "Failed to load unpaid attempts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadList(nextTab) {
    const t = nextTab || tab;
    if (!t) return;
    if (t === UNPAID_TAB_ID) return loadUnpaidAttempts();
    return loadUsersLite(t);
  }

  React.useEffect(() => {
    loadTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!tab) return;
    loadList(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = Array.isArray(rows) ? rows : [];

    if (needle) {
      list = list.filter((r) => {
        const hay = isUnpaidTab
          ? `${r.firstName || ""} ${r.lastName || ""} ${r.email || ""} ${r.attemptedItem || ""}`.toLowerCase()
          : `${r.firstName || ""} ${r.lastName || ""} ${r.email || ""}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      const an =
        `${a.lastName || ""} ${a.firstName || ""} ${a.email || ""}`.toLowerCase();
      const bn =
        `${b.lastName || ""} ${b.firstName || ""} ${b.email || ""}`.toLowerCase();

      if (sort === "name_asc") return an.localeCompare(bn);
      if (sort === "name_desc") return bn.localeCompare(an);

      // status sorting only applies to normal user tabs
      if (!isUnpaidTab) {
        const ar = statusRank(a.subscriptionStatus);
        const br = statusRank(b.subscriptionStatus);
        if (sort === "status_asc") {
          if (ar !== br) return ar - br;
          return an.localeCompare(bn);
        }
        if (sort === "status_desc") {
          if (ar !== br) return br - ar;
          return an.localeCompare(bn);
        }
      }

      return 0;
    });

    return sorted;
  }, [rows, q, sort, isUnpaidTab]);

  const activeTabTitle = tabs.find((t) => t.id === tab)?.title || "Users";

  function onExport() {
    const safeName = (activeTabTitle || "users").replace(/[^\w-]+/g, "_");

    if (isUnpaidTab) {
      downloadCsv(
        `${safeName}.csv`,
        ["First Name", "Last Name", "Email", "Attempted Purchase"],
        filtered,
        (r) => [r.firstName, r.lastName, r.email, r.attemptedItem],
      );
      return;
    }

    downloadCsv(
      `${safeName}.csv`,
      ["First Name", "Last Name", "Email"],
      filtered,
      (r) => [r.firstName, r.lastName, r.email],
    );
  }

  return (
    <div className="px-3 md:px-6 lg:px-10 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            Users (Mini Admin View)
          </h1>
          <p className="text-sm text-slate-600">
            {isUnpaidTab
              ? "Read-only: First name, Last name, Email, and what they tried to purchase but didn’t pay for."
              : "Read-only: First name, Last name, Email, Subscription status."}
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <button
            className="rounded-lg px-3 py-2 ring-1 ring-black/10 hover:bg-slate-50"
            onClick={() => loadTabs().then(() => loadList(tab))}
            type="button"
          >
            Refresh
          </button>

          <button
            className="rounded-lg px-3 py-2 bg-blue-600 text-white hover:bg-blue-700"
            onClick={onExport}
            type="button"
            disabled={loading || filtered.length === 0}
            title={
              isUnpaidTab
                ? "Export Name, Email, Attempted Purchase"
                : "Export First Name, Last Name, Email"
            }
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl bg-white p-2 ring-1 ring-black/5 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap ring-1 transition
                  ${
                    active
                      ? "bg-blue-600 text-white ring-blue-600"
                      : "bg-white text-slate-700 ring-black/10 hover:bg-slate-50"
                  }`}
                title={t.title}
              >
                {t.title}{" "}
                <span
                  className={`${active ? "text-white/90" : "text-slate-500"}`}
                >
                  ({t.count ?? 0})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl bg-white p-3 md:p-4 ring-1 ring-black/5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isUnpaidTab
                ? "Search by name, email, or attempted purchase…"
                : "Search by name or email…"
            }
            className="w-full rounded-lg px-3 py-2 ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg px-3 py-2 ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>

            {!isUnpaidTab && (
              <>
                <option value="status_asc">Status (Active first)</option>
                <option value="status_desc">Status (Inactive first)</option>
              </>
            )}
          </select>

          <span className="text-xs text-slate-600">
            Showing {filtered.length}
          </span>
        </div>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      {/* Table */}
      <div className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">
                  First Name
                </th>
                <th className="text-left px-4 py-3 font-semibold">Last Name</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>

                {isUnpaidTab ? (
                  <th className="text-left px-4 py-3 font-semibold">
                    Attempted Purchase
                  </th>
                ) : (
                  <th className="text-left px-4 py-3 font-semibold">
                    Subscription Status
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={4}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={4}>
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  if (isUnpaidTab) {
                    return (
                      <tr key={`${r.email}-${i}`} className="border-t">
                        <td className="px-4 py-3">{r.firstName || "-"}</td>
                        <td className="px-4 py-3">{r.lastName || "-"}</td>
                        <td className="px-4 py-3">{r.email || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-[520px] break-words">
                            {r.attemptedItem || "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const s = String(
                    r.subscriptionStatus || "inactive",
                  ).toLowerCase();
                  const label = STATUS_LABEL[s] || "Inactive";

                  return (
                    <tr key={`${r.email}-${i}`} className="border-t">
                      <td className="px-4 py-3">{r.firstName || "-"}</td>
                      <td className="px-4 py-3">{r.lastName || "-"}</td>
                      <td className="px-4 py-3">{r.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs ring-1
                            ${
                              s === "active"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : s === "expired"
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : s === "disabled"
                                    ? "bg-red-50 text-red-700 ring-red-200"
                                    : "bg-slate-100 text-slate-700 ring-black/10"
                            }`}
                        >
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
