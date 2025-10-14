// src/pages/AdminRateGen.jsx
import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

const KIND = { materials: "material", labour: "labour" };

export default function AdminRateGen() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("materials"); // 'materials' | 'labour'
  const [zones, setZones] = React.useState([]);
  const [rows, setRows] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    (async () => {
      const z = await apiAuthed("/admin/rategen/zones", { token: accessToken });
      setZones(z || []);
      await reload();
    })().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function reload() {
    setBusy(true);
    setMsg("");
    try {
      const res = await apiAuthed(
        `/admin/rategen/grid?kind=${KIND[tab]}&search=${encodeURIComponent(
          search
        )}`,
        {
          token: accessToken,
        }
      );
      setRows(res.rows || []);
    } catch (e) {
      setMsg(e.message || "Load error");
    } finally {
      setBusy(false);
    }
  }

  function setCell(idx, zoneKey, value) {
    setRows((old) => {
      const next = [...old];
      const r = { ...next[idx] };
      const p = { ...(r.prices || {}) };
      p[zoneKey] = value === "" ? 0 : Number(value);
      r.prices = p;
      next[idx] = r;
      return next;
    });
  }

  async function saveAll() {
    setBusy(true);
    setMsg("");
    try {
      const payload = {
        kind: KIND[tab],
        rows: rows.map((r) => ({
          name: r.name,
          unit: r.unit,
          category: r.category,
          prices: r.prices,
        })),
      };
      await apiAuthed("/admin/rategen/grid", {
        token: accessToken,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMsg("✅ Saved.");
      await reload();
    } catch (e) {
      setMsg(`❌ ${e.message || "Save error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div className="card">
        <div className="flex items-center gap-2">
          <button
            className={`tab ${tab === "materials" ? "tab-active" : ""}`}
            onClick={() => setTab("materials")}
          >
            Materials
          </button>
          <button
            className={`tab ${tab === "labour" ? "tab-active" : ""}`}
            onClick={() => setTab("labour")}
          >
            Labour
          </button>

          <div className="flex-1" />
          <input
            className="input max-w-[320px]"
            placeholder={`Search ${tab}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload()}
          />
          <button className="btn" onClick={reload} disabled={busy}>
            Search
          </button>
          <button className="btn" onClick={saveAll} disabled={busy}>
            Save all
          </button>
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="sticky top-0 bg-white">
              <th className="th w-14">S/N</th>
              <th className="th min-w-[260px] text-left">
                {tab === "materials" ? "Material name" : "Labour name"}
              </th>
              <th className="th w-32 text-left">Unit</th>
              <th className="th w-44 text-left">Category</th>
              {zones.map((z) => (
                <th key={z.key} className="th min-w-[140px] text-right">
                  {z.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name}>
                <td className="td text-center">{r.sn}</td>
                <td className="td font-medium">{r.name}</td>
                <td className="td">
                  <input
                    className="input"
                    value={r.unit || ""}
                    onChange={(e) =>
                      setRows((old) => {
                        const next = [...old];
                        next[i] = { ...next[i], unit: e.target.value };
                        return next;
                      })
                    }
                  />
                </td>
                <td className="td">
                  <input
                    className="input"
                    value={r.category || ""}
                    onChange={(e) =>
                      setRows((old) => {
                        const next = [...old];
                        next[i] = { ...next[i], category: e.target.value };
                        return next;
                      })
                    }
                  />
                </td>
                {zones.map((z) => (
                  <td key={z.key} className="td">
                    <input
                      className="input text-right"
                      inputMode="numeric"
                      value={String(r.prices?.[z.key] ?? 0)}
                      onChange={(e) =>
                        setCell(i, z.key, e.target.value.replace(/[^\d.]/g, ""))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}

            {!rows.length && !busy && (
              <tr>
                <td
                  className="td text-center text-slate-500"
                  colSpan={4 + zones.length}
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {busy && (
          <div className="py-6 text-center text-sm text-slate-600">
            Working…
          </div>
        )}
      </div>

      {!!msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
