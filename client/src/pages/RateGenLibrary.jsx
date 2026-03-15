import React from "react";
import { useNavigate } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

const LAST_SEEN_KEY = "rategen_updates_last_seen_at";

const SOURCE_STYLES = {
  master: "bg-slate-100 text-slate-700",
  "user-override": "bg-blue-100 text-blue-700",
  "user-custom": "bg-emerald-100 text-emerald-700",
};

const TABS = [
  { key: "master-materials", label: "Master Materials" },
  { key: "master-labour", label: "Master Labour" },
  { key: "my-materials", label: "My Materials" },
  { key: "my-labour", label: "My Labour" },
  { key: "my-rate-overrides", label: "My Rate Overrides" },
  { key: "my-custom-rates", label: "My Custom Rates" },
  { key: "effective-rates", label: "Effective Rates" },
];

function formatMoney(value) {
  const n = Number(value || 0);
  return `NGN ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getLastSeenMs() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  const ms = raw ? Number(raw) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function SummaryCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="text-sm font-medium text-slate-800">{title}</div>
      <div className="mt-2 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

function LibraryTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No rows found"
        detail="This table will fill in automatically once the user library or master catalog has data."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">S/N</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Unit</th>
            <th className="px-4 py-3 font-medium">Price</th>
            <th className="px-4 py-3 font-medium">Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.sn ?? index}-${row.description ?? ""}`}
              className="border-b border-slate-100 align-top"
            >
              <td className="px-4 py-3 text-slate-700">{row.sn ?? "-"}</td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.description || "-"}
              </td>
              <td className="px-4 py-3 text-slate-700">{row.unit || "-"}</td>
              <td className="px-4 py-3 text-slate-700">
                {formatMoney(row.price)}
              </td>
              <td className="px-4 py-3 text-slate-500">{row.category || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RateTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No rate data yet"
        detail="Open the desktop app, edit a section rate or save a custom rate, then this page will reflect the synced data."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Section</th>
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Unit</th>
            <th className="px-4 py-3 font-medium">Net Cost</th>
            <th className="px-4 py-3 font-medium">OH</th>
            <th className="px-4 py-3 font-medium">Profit</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const source = row.source || "master";
            return (
              <tr
                key={
                  row.customRateId ||
                  row.rateId ||
                  `${row.sectionKey || ""}-${row.itemNo ?? index}-${row.description || ""}`
                }
                className="border-b border-slate-100 align-top"
              >
                <td className="px-4 py-3 text-slate-700">
                  {row.sectionLabel || row.sectionKey || "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.itemNo ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.description || "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.unit || "-"}</td>
                <td className="px-4 py-3 text-slate-700">
                  {formatMoney(row.netCost)}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {formatPercent(row.overheadPercent)}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {formatPercent(row.profitPercent)}
                </td>
                <td className="px-4 py-3 text-slate-900">
                  {formatMoney(row.totalCost)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      SOURCE_STYLES[source] || SOURCE_STYLES.master
                    }`}
                  >
                    {source}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomRatesTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No custom rates saved yet"
        detail="Saved built-up rates from the desktop app will appear here once they sync."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Materials</th>
            <th className="px-4 py-3 font-medium">Labour</th>
            <th className="px-4 py-3 font-medium">OH</th>
            <th className="px-4 py-3 font-medium">Profit</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.customRateId || `${row.title || ""}-${index}`}
              className="border-b border-slate-100 align-top"
            >
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.title || row.description || "Untitled rate"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {row.description || "-"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {Array.isArray(row.materials) ? row.materials.length : 0}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {Array.isArray(row.labour) ? row.labour.length : 0}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatPercent(row.overheadPercent)}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatPercent(row.profitPercent)}
              </td>
              <td className="px-4 py-3 text-slate-900">
                {formatMoney(row.totalCost)}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {formatDateTime(row.updatedAt || row.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function matchesSearch(row, fields, search) {
  if (!search) return true;
  return fields.some((field) =>
    String(row?.[field] ?? "")
      .toLowerCase()
      .includes(search)
  );
}

function buildFallbackMergedRates(mine) {
  const rateOverrides = Array.isArray(mine?.rateOverrides) ? mine.rateOverrides : [];
  const customRates = Array.isArray(mine?.customRates) ? mine.customRates : [];

  return [
    ...rateOverrides.map((row) => ({
      ...row,
      source: row?.source || "user-override",
    })),
    ...customRates.map((row) => ({
      ...row,
      source: row?.source || "user-custom",
    })),
  ];
}

export default function RateGenLibrary() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [tab, setTab] = React.useState("master-materials");
  const [search, setSearch] = React.useState("");
  const [master, setMaster] = React.useState(null);
  const [mine, setMine] = React.useState(null);
  const [mergedRates, setMergedRates] = React.useState([]);
  const [meta, setMeta] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [lastLoadedAt, setLastLoadedAt] = React.useState(null);
  const [updatesCount, setUpdatesCount] = React.useState(0);
  const latestMineRef = React.useRef(null);

  const zone = master?.zone || "";
  const trimmedSearch = search.trim().toLowerCase();

  React.useEffect(() => {
    latestMineRef.current = mine;
  }, [mine]);

  const loadUpdatesCount = React.useCallback(async () => {
    if (!accessToken) return;

    try {
      const res = await apiAuthed("/rategen-v2/library/rates/updates?limit=200", {
        token: accessToken,
      });

      const items = Array.isArray(res?.items) ? res.items : [];
      const lastSeenMs = getLastSeenMs();
      const count = items.filter((item) => {
        const stamp = item?.updatedAt || item?.createdAt;
        const ms = stamp ? new Date(stamp).getTime() : 0;
        return ms > lastSeenMs;
      }).length;

      setUpdatesCount(count);
    } catch {
      setUpdatesCount(0);
    }
  }, [accessToken]);

  const loadAll = React.useCallback(
    async ({ silent = false } = {}) => {
      if (!accessToken) {
        setErr("You are signed out. Please sign in again.");
        setLoading(false);
        return;
      }

      if (silent) setRefreshing(true);
      else setLoading(true);

      setErr("");

      try {
        const [masterRes, mineRes, mergedRes, metaRes] = await Promise.allSettled([
          apiAuthed("/rategen/master", { token: accessToken }),
          apiAuthed("/rategen/library", { token: accessToken }),
          apiAuthed("/rategen-v2/library/user-rates/merged", {
            token: accessToken,
          }),
          apiAuthed("/rategen-v2/library/meta", { token: accessToken }),
        ]);

        const partialErrors = [];
        let nextMine = latestMineRef.current;
        let hadAnySuccess = false;

        if (masterRes.status === "fulfilled") {
          setMaster(masterRes.value || null);
          hadAnySuccess = true;
        } else {
          partialErrors.push("master library");
        }

        if (mineRes.status === "fulfilled") {
          nextMine = mineRes.value || null;
          setMine(nextMine);
          hadAnySuccess = true;
        } else {
          partialErrors.push("your synced library");
        }

        if (mergedRes.status === "fulfilled") {
          setMergedRates(Array.isArray(mergedRes.value?.items) ? mergedRes.value.items : []);
          hadAnySuccess = true;
        } else {
          setMergedRates(buildFallbackMergedRates(nextMine));
          partialErrors.push("effective rates");
        }

        if (metaRes.status === "fulfilled") {
          setMeta(metaRes.value?.meta || null);
          hadAnySuccess = true;
        } else {
          partialErrors.push("library metadata");
        }

        if (hadAnySuccess) {
          setLastLoadedAt(new Date());
        }

        if (partialErrors.length > 0) {
          setErr(
            `Some RateGen data could not refresh (${partialErrors.join(", ")}). Showing the latest synced data that is available.`
          );
        }
      } catch (error) {
        setErr(error.message || "Failed to load RateGen dashboard.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  React.useEffect(() => {
    loadAll();
    loadUpdatesCount();
  }, [loadAll, loadUpdatesCount]);

  React.useEffect(() => {
    if (!accessToken || !autoRefresh) return undefined;

    const interval = window.setInterval(() => {
      loadAll({ silent: true });
      loadUpdatesCount();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [accessToken, autoRefresh, loadAll, loadUpdatesCount]);

  React.useEffect(() => {
    if (!accessToken) return undefined;

    const refreshOnFocus = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }

      loadAll({ silent: true });
      loadUpdatesCount();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [accessToken, loadAll, loadUpdatesCount]);

  const datasets = React.useMemo(() => {
    const rateOverrides = Array.isArray(mine?.rateOverrides) ? mine.rateOverrides : [];
    const customRates = Array.isArray(mine?.customRates) ? mine.customRates : [];
    const effective = Array.isArray(mergedRates) ? mergedRates : [];

    return {
      "master-materials": Array.isArray(master?.materials) ? master.materials : [],
      "master-labour": Array.isArray(master?.labour) ? master.labour : [],
      "my-materials": Array.isArray(mine?.materials) ? mine.materials : [],
      "my-labour": Array.isArray(mine?.labour) ? mine.labour : [],
      "my-rate-overrides": rateOverrides.map((row) => ({
        ...row,
        source: "user-override",
      })),
      "my-custom-rates": customRates,
      "effective-rates": effective,
    };
  }, [master, mine, mergedRates]);

  const filteredRows = React.useMemo(() => {
    const rows = datasets[tab] || [];

    if (!trimmedSearch) return rows;

    if (
      tab === "master-materials" ||
      tab === "master-labour" ||
      tab === "my-materials" ||
      tab === "my-labour"
    ) {
      return rows.filter((row) =>
        matchesSearch(row, ["description", "unit", "category", "sn"], trimmedSearch)
      );
    }

    if (tab === "my-custom-rates") {
      return rows.filter((row) =>
        matchesSearch(
          row,
          ["title", "description", "customRateId", "sectionLabel", "sectionKey"],
          trimmedSearch
        )
      );
    }

    return rows.filter((row) =>
      matchesSearch(
        row,
        ["sectionLabel", "sectionKey", "description", "source", "unit", "itemNo"],
        trimmedSearch
      )
    );
  }, [datasets, tab, trimmedSearch]);

  const counts = {
    masterMaterials: datasets["master-materials"].length,
    masterLabour: datasets["master-labour"].length,
    myMaterials: datasets["my-materials"].length,
    myLabour: datasets["my-labour"].length,
    overrides: datasets["my-rate-overrides"].length,
    customRates: datasets["my-custom-rates"].length,
    effective: datasets["effective-rates"].length,
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              RateGen Cloud Dashboard
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                My Rates, Materials, and Live Catalog Sync
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                This page combines the master RateGen catalog, your personal material
                and labour library, your custom built-up rates, and the merged rates
                other ADLM software can consume from the API.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                loadAll({ silent: true });
                loadUpdatesCount();
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
            <button
              onClick={() => navigate("/rategen/updates")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  updatesCount > 0 ? "bg-blue-600" : "bg-slate-300"
                }`}
              />
              <span>Updates</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {updatesCount}
              </span>
            </button>
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              Auto refresh
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Zone"
            value={zone ? zone.replace(/_/g, " ") : "-"}
            detail="Master prices follow the zone on your user profile."
          />
          <SummaryCard
            label="My Library"
            value={`${counts.myMaterials + counts.myLabour}`}
            detail={`${counts.myMaterials} materials and ${counts.myLabour} labour rows`}
          />
          <SummaryCard
            label="My Rates"
            value={`${counts.overrides + counts.customRates}`}
            detail={`${counts.overrides} overrides and ${counts.customRates} custom saved rates`}
          />
          <SummaryCard
            label="Effective API Rates"
            value={`${counts.effective}`}
            detail="Merged output that future connected software can read."
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Master Catalog"
            value={`${counts.masterMaterials + counts.masterLabour}`}
            detail={`${counts.masterMaterials} materials and ${counts.masterLabour} labour rows`}
          />
          <SummaryCard
            label="Versions"
            value={`${meta?.userRates?.version ?? 1}/${meta?.customRates?.version ?? 1}`}
            detail="User rates version / custom rates version"
          />
          <SummaryCard
            label="Last Loaded"
            value={lastLoadedAt ? formatDateTime(lastLoadedAt) : "-"}
            detail="This page refreshes on focus and every 30 seconds when enabled."
          />
          <SummaryCard
            label="Rates Feed"
            value={`${meta?.rates?.version ?? 1}`}
            detail="Current default-rate version from the shared catalog."
          />
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="overflow-x-auto">
            <nav className="flex min-w-max gap-2">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    tab === item.key
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="text-xs text-slate-500">
              Showing {filteredRows.length} of {(datasets[tab] || []).length} rows
            </div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this view..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:w-72"
            />
          </div>
        </div>

        {err && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            Loading your RateGen dashboard...
          </div>
        ) : null}

        {!loading && (
          <>
            {tab === "my-custom-rates" ? (
              <CustomRatesTable rows={filteredRows} />
            ) : tab === "effective-rates" || tab === "my-rate-overrides" ? (
              <RateTable rows={filteredRows} />
            ) : (
              <LibraryTable rows={filteredRows} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
