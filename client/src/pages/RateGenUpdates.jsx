// src/pages/RateGenUpdates.jsx
import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

dayjs.extend(relativeTime);

const LAST_SEEN_KEY = "rategen_updates_last_seen_at";

const SECTIONS = [
  { key: "", label: "All sections" },
  { key: "ground", label: "Groundwork" },
  { key: "concrete", label: "Concrete Works" },
  { key: "blockwork", label: "Blockwork" },
  { key: "finishes", label: "Finishes" },
  { key: "roofing", label: "Roofing" },
  { key: "doors_windows", label: "Windows & Doors" },
  { key: "paint", label: "Painting" },
  { key: "steelwork", label: "Steelwork" },
];

function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function getSectionLabel(k) {
  return SECTIONS.find((s) => s.key === k)?.label || k || "—";
}

function money(n, currency = "NGN") {
  const value = toNum(n, 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)}`;
  }
}

function safeStr(v) {
  return v == null ? "" : String(v);
}

function getLastSeenMs() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  const ms = raw ? Number(raw) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function setLastSeenNow() {
  localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
}

function guessAmount(r) {
  // Prefer TotalCost if present, otherwise NetCost
  if (r.totalCost != null) return r.totalCost;
  if (r.netCost != null) return r.netCost;
  if (r.amount != null) return r.amount;
  return 0;
}

function guessCurrency(r) {
  return r.currency || "NGN";
}

export default function RateGenUpdates() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [search, setSearch] = React.useState("");
  const [sectionKey, setSectionKey] = React.useState("");
  const [sort, setSort] = React.useState("newest"); // newest | amount_desc | amount_asc
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const [lastCheckedAt, setLastCheckedAt] = React.useState(null);
  const [lastSeenMs, setLastSeenMs] = React.useState(() => getLastSeenMs());

  const [open, setOpen] = React.useState(null); // selected item for modal
  const [toast, setToast] = React.useState("");

  const showToast = (m) => {
    setToast(m);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(""), 2500);
  };

  async function load() {
    if (!accessToken) {
      setErr("You’re signed out. Please sign in again.");
      return;
    }

    setErr("");
    setLoading(true);

    try {
      // ✅ Try multiple endpoints so you can wire backend any way you want
      const tryUrls = [
        "/rategen-v2/library/rates/updates?limit=60", // ✅ best (new endpoint)
        "/rategen-v2/library/rates/sync?limit=500", // fallback (sync endpoint)
      ];

      let res = null;
      let lastE = null;

      for (const url of tryUrls) {
        try {
          // eslint-disable-next-line no-await-in-loop
          res = await apiAuthed(url, { token: accessToken });
          if (res) break;
        } catch (e) {
          lastE = e;
        }
      }

      if (!res) throw lastE || new Error("Failed to load updates");

      // Accept many shapes:
      // { items: [...] } or { data: [...] } or just [...]
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : [];

      // Normalize each item so UI is stable
      const normalized = list
        .map((r) => {
          const createdAt =
            r.createdAt ||
            r.addedAt ||
            r.updatedAt ||
            r.publishedAt ||
            r.ts ||
            null;

          const createdMs = createdAt ? dayjs(createdAt).valueOf() : 0;

          return {
            _id:
              r._id ||
              r.id ||
              `${r.sectionKey || "rate"}-${r.itemNo || ""}-${
                r.description || ""
              }`,
            description: r.description || r.name || "Untitled rate",
            sectionKey: r.sectionKey || r.section || "",
            sectionLabel: r.sectionLabel || "",
            unit: r.unit || r.outputUnit || "",
            netCost: r.netCost ?? r.net ?? null,
            totalCost: r.totalCost ?? r.total ?? null,
            currency: r.currency || "NGN",
            createdAt: createdAt || null,
            createdMs,
            itemNo: r.itemNo ?? null,
          };
        })
        .filter((x) => x.description);

      // Sort newest by default
      normalized.sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));

      setItems(normalized);
      setLastCheckedAt(new Date());
    } catch (e) {
      setErr(e?.message || "Failed to load updates");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(); // initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Auto refresh
  React.useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      load();
    }, 45000); // every 45s
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, accessToken]);

  // Derived: filter + sort
  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    let arr = items;

    if (sectionKey) {
      arr = arr.filter(
        (x) => (x.sectionKey || "").toLowerCase() === sectionKey
      );
    }

    if (q) {
      arr = arr.filter((x) => {
        const blob = [
          x.description,
          x.sectionKey,
          x.sectionLabel,
          x.unit,
          x.itemNo != null ? String(x.itemNo) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    const withAmount = (r) => toNum(guessAmount(r), 0);

    if (sort === "amount_desc") {
      arr = [...arr].sort((a, b) => withAmount(b) - withAmount(a));
    } else if (sort === "amount_asc") {
      arr = [...arr].sort((a, b) => withAmount(a) - withAmount(b));
    } else {
      // newest
      arr = [...arr].sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
    }

    return arr;
  }, [items, search, sectionKey, sort]);

  const newCount = React.useMemo(() => {
    return visible.filter((x) => (x.createdMs || 0) > lastSeenMs).length;
  }, [visible, lastSeenMs]);

  function markAllAsRead() {
    setLastSeenNow();
    const ms = getLastSeenMs();
    setLastSeenMs(ms);
    showToast("Marked all updates as read ✅");
  }

  function openItem(r) {
    setOpen(r);
  }

  function copyText(v) {
    const text = safeStr(v);
    if (!text) return;
    navigator.clipboard?.writeText(text);
    showToast("Copied ✅");
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <style>{`
        .fade-up { opacity:0; transform: translateY(8px); animation: fadeUp .45s ease forwards; }
        @keyframes fadeUp { to { opacity:1; transform: translateY(0); } }
        .card-hover { transition: transform .18s ease, box-shadow .18s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(15,23,42,0.10); }
      `}</style>

      {/* Header */}
      <div className="rounded-xl overflow-hidden bg-blue-800 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold">
                RateGen Updates
              </h1>
              <p className="text-sm text-blue-100/90 mt-1">
                See newly added rates and open them inside the RateGen software.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate("/rategen")}
                className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-sm"
              >
                ← Back to RateGen
              </button>

              <button
                onClick={load}
                className="px-3 py-2 rounded-md bg-white text-blue-900 text-sm hover:bg-blue-50"
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
              <span className="text-blue-100">New:</span>
              <span className="font-semibold">{newCount}</span>
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
              <span className="text-blue-100">Total:</span>
              <span className="font-semibold">{visible.length}</span>
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
              <span className="text-blue-100">Last checked:</span>
              <span className="font-semibold">
                {lastCheckedAt ? dayjs(lastCheckedAt).fromNow() : "—"}
              </span>
            </span>

            <button
              onClick={markAllAsRead}
              className="ml-auto px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-100 border border-emerald-300/20"
            >
              Mark all as read
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto mt-6 space-y-4">
        {/* Controls */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <label className="text-xs text-slate-500">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rate name, unit, section…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-500">Section</label>
              <select
                value={sectionKey}
                onChange={(e) => setSectionKey(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Sort</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="newest">Newest</option>
                <option value="amount_desc">Amount (High → Low)</option>
                <option value="amount_asc">Amount (Low → High)</option>
              </select>
            </div>

            <div className="md:col-span-2 flex items-end justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
            </div>
          </div>

          {err && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              ❌ {err}
            </div>
          )}
        </div>

        {/* List */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4">
          {loading && visible.length === 0 ? (
            <div className="text-sm text-slate-600">Loading updates…</div>
          ) : visible.length === 0 ? (
            <div className="text-sm text-slate-600">
              No updates found. (Try removing filters or hit refresh.)
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visible.map((r, idx) => {
                const isNew = (r.createdMs || 0) > lastSeenMs;
                const amount = guessAmount(r);
                const currency = guessCurrency(r);

                const sectionText =
                  r.sectionLabel || getSectionLabel(r.sectionKey);

                return (
                  <button
                    key={r._id || idx}
                    onClick={() => openItem(r)}
                    className="text-left rounded-xl border border-slate-200 p-4 card-hover fade-up bg-white"
                    style={{ animationDelay: `${Math.min(320, idx * 25)}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isNew && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                              NEW
                            </span>
                          )}
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-100">
                            {sectionText}
                          </span>
                          {r.unit ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-100">
                              {r.unit}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 font-semibold text-slate-900 truncate">
                          {r.itemNo != null ? `${r.itemNo}. ` : ""}
                          {r.description}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {r.createdAt
                            ? `Added ${dayjs(r.createdAt).fromNow()}`
                            : "Recently added"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500">Amount</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {money(amount, currency)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Click to view
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}

      {/* Modal */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 p-4 flex items-center justify-center"
          onMouseDown={() => setOpen(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 md:p-5 border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    {open.sectionLabel || getSectionLabel(open.sectionKey)}{" "}
                    {open.unit ? `• ${open.unit}` : ""}{" "}
                    {open.createdAt
                      ? `• ${dayjs(open.createdAt).format("YYYY-MM-DD HH:mm")}`
                      : ""}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {open.itemNo != null ? `${open.itemNo}. ` : ""}
                    {open.description}
                  </div>
                </div>

                <button
                  className="px-3 py-1.5 rounded-md border hover:bg-slate-50 text-sm"
                  onClick={() => setOpen(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 md:p-5 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Amount</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1">
                  {money(guessAmount(open), guessCurrency(open))}
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Net Cost</div>
                    <div className="font-semibold">
                      {money(open.netCost ?? 0, guessCurrency(open))}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Total Cost</div>
                    <div className="font-semibold">
                      {money(
                        open.totalCost ?? guessAmount(open),
                        guessCurrency(open)
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-900">
                  View full rate in RateGen software
                </div>
                <p className="text-sm text-slate-600 mt-1 leading-6">
                  Open the <b>RateGen</b> desktop app → go to{" "}
                  <b>Rate Library</b> → click <b>Sync/Refresh</b> → then search
                  using the rate name below.
                </p>

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                    onClick={() => {
                      copyText(open.description);
                    }}
                  >
                    Copy rate name
                  </button>

                  <button
                    className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50"
                    onClick={() => {
                      // Mark read when user actually opens a detail
                      setLastSeenNow();
                      setLastSeenMs(getLastSeenMs());
                      showToast("Opened update ✅");
                    }}
                  >
                    Mark as read
                  </button>

                  <button className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50">
                    Go to RateGen (Software)
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Reference ID:{" "}
                  <span className="font-mono text-slate-700">{open._id}</span>{" "}
                  <button
                    className="ml-2 underline"
                    onClick={() => copyText(open._id)}
                  >
                    copy
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-5 border-t flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border hover:bg-slate-50 text-sm"
                onClick={() => setOpen(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
