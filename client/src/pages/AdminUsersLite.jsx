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

function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  const header = ["First Name", "Last Name", "Email"];
  const lines = [
    header.join(","),
    ...(rows || []).map((r) =>
      [r.firstName, r.lastName, r.email].map(escapeCsvCell).join(","),
    ),
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
  // for sorting
  const key = String(s || "").toLowerCase();
  // active first
  const order = { active: 1, expired: 2, inactive: 3, disabled: 4 };
  return order[key] || 99;
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

  async function loadTabs() {
    setMsg("");
    try {
      const data = await apiAuthed("/admin/users-lite/tabs", {
        token: accessToken,
      });
      const list = Array.isArray(data?.tabs) ? data.tabs : [];
      setTabs(list);
      if (!tab && list.length) setTab(list[0].id);
    } catch (e) {
      setMsg(e.message || "Failed to load tabs");
    }
  }

  async function loadList(nextTab) {
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

  React.useEffect(() => {
    loadTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    loadList(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = Array.isArray(rows) ? rows : [];

    if (needle) {
      list = list.filter((r) => {
        const hay =
          `${r.firstName || ""} ${r.lastName || ""} ${r.email || ""}`.toLowerCase();
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
      return 0;
    });

    return sorted;
  }, [rows, q, sort]);

  const activeTabTitle = tabs.find((t) => t.id === tab)?.title || "Users";

  return (
    <div className="px-3 md:px-6 lg:px-10 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            Users (Mini Admin View)
          </h1>
          <p className="text-sm text-slate-600">
            Read-only: First name, Last name, Email, Subscription status.
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
            onClick={() =>
              downloadCsv(
                `${(activeTabTitle || "users").replace(/[^\w-]+/g, "_")}.csv`,
                filtered,
              )
            }
            type="button"
            disabled={loading || filtered.length === 0}
            title="Export First Name, Last Name, Email"
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
            placeholder="Search by name or email…"
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
            <option value="status_asc">Status (Active first)</option>
            <option value="status_desc">Status (Inactive first)</option>
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
                <th className="text-left px-4 py-3 font-semibold">
                  Subscription Status
                </th>
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
