import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

const KIND = { materials: "material", labour: "labour" };
const PAGE_SIZE = 30;

export default function AdminRateGen() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("materials"); // 'materials' | 'labour'
  const [zones, setZones] = React.useState([]);
  const [rows, setRows] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [page, setPage] = React.useState(1);

  // sticky widths
  const SN_WIDTH = 56;
  const [nameWidth, setNameWidth] = React.useState(200); // user-resizable
  const headerRef = React.useRef(null);
  const resizingRef = React.useRef(false);

  // fetch zones + rows on tab change
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
        { token: accessToken }
      );
      setRows(res.rows || []);
      setPage(1); // reset to first page
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(start, start + PAGE_SIZE);

  function prevPage() {
    setPage((p) => Math.max(1, p - 1));
  }
  function nextPage() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  // Resizer for Name column
  React.useEffect(() => {
    function onMove(e) {
      if (!resizingRef.current || !headerRef.current) return;
      const rect = headerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const min = 120;
      const max = 420; // keep it reasonable
      setNameWidth(Math.max(min, Math.min(max, x)));
    }
    function onUp() {
      resizingRef.current = false;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* ---------- Responsive toolbar ---------- */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs: compact segmented control on mobile */}
          <div
            className="tabbar w-full sm:w-auto"
            role="tablist"
            aria-label="Price type"
          >
            <button
              role="tab"
              aria-selected={tab === "materials"}
              className={`tab ${tab === "materials" ? "tab-active" : ""}`}
              onClick={() => setTab("materials")}
            >
              Materials
            </button>

            <button
              role="tab"
              aria-selected={tab === "labour"}
              className={`tab ${tab === "labour" ? "tab-active" : ""}`}
              onClick={() => setTab("labour")}
            >
              Labour
            </button>
          </div>

          {/* Search (full width on mobile) */}
          <div className="flex-1 min-w-[200px] order-3 xs:order-none w-full xs:w-auto">
            <input
              className="input w-full"
              placeholder={`Search ${tab}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reload()}
            />
          </div>

          {/* Buttons: stack nicely on mobile */}
          <div className="flex gap-2 w-full xs:w-auto ml-auto">
            <button
              className="btn flex-1 xs:flex-none"
              onClick={reload}
              disabled={busy}
            >
              Search
            </button>
            <button
              className="btn flex-1 xs:flex-none"
              onClick={saveAll}
              disabled={busy}
            >
              Save all
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Table ---------- */}
      <div
        className="card overflow-auto relative table-sticky mobile-scroll touch-auto sm:touch-pan-x overscroll-x-contain"
        style={{ ["--sn"]: `${SN_WIDTH}px`, ["--name"]: `${nameWidth}px` }}
      >
        <table className="min-w-full border-separate border-spacing-0 table-auto text-sm sm:text-base">
          <colgroup>
            <col style={{ width: `${SN_WIDTH}px` }} />
            <col style={{ width: `${nameWidth}px` }} />
            <col /> {/* Unit */}
            <col /> {/* Category */}
            {zones.map((_z, i) => (
              <col key={i} style={{ minWidth: 110 }} />
            ))}
          </colgroup>

          <thead>
            <tr className="sticky top-0 bg-white z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <th
                className="th text-center sticky left-0 z-50 bg-white freeze"
                style={{
                  left: "var(--sn, 56px)",
                  transform: "translateX(calc(-1 * var(--sn, 56px)))",
                }}
              >
                S/N
              </th>

              {/* Resizable name (resizer hidden on mobile via CSS) */}
              <th
                className="th text-left sticky z-40 bg-white select-none freeze"
                style={{ left: "var(--sn, 56px)" }}
                ref={headerRef}
              >
                {tab === "materials" ? "Material name" : "Labour name"}
                <span
                  title="Drag to resize"
                  onMouseDown={() => {
                    resizingRef.current = true;
                    document.body.style.userSelect = "none";
                  }}
                  className="name-resizer inline-block align-middle ml-2 w-1 h-5 bg-slate-300 rounded cursor-col-resize hover:bg-slate-400"
                />
              </th>

              <th className="th text-left whitespace-nowrap">Unit</th>
              <th className="th text-left whitespace-nowrap">Category</th>
              {zones.map((z) => (
                <th key={z.key} className="th text-right whitespace-nowrap">
                  {z.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pagedRows.map((r, i) => {
              const idx = start + i;
              return (
                <tr
                  key={`${r.name}-${idx}`}
                  className="hover:bg-slate-50 hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)] cursor-pointer transition-colors"
                >
                  <td
                    className="td text-center sticky left-0 z-30 bg-white freeze"
                    style={{
                      left: "var(--sn, 56px)",
                      transform: "translateX(calc(-1 * var(--sn, 56px)))",
                    }}
                  >
                    {r.sn}
                  </td>

                  <td
                    className="td font-medium sticky z-20 bg-white freeze"
                    style={{ left: "var(--sn, 56px)" }}
                    title={r.name}
                  >
                    <div className="name-cell">{r.name}</div>
                  </td>

                  <td className="td whitespace-nowrap">
                    <input
                      className="input !py-1 !px-2 text-sm"
                      value={r.unit || ""}
                      onChange={(e) =>
                        setRows((old) => {
                          const next = [...old];
                          next[idx] = { ...next[idx], unit: e.target.value };
                          return next;
                        })
                      }
                    />
                  </td>

                  <td className="td whitespace-nowrap">
                    <input
                      className="input !py-1 !px-2 text-sm"
                      value={r.category || ""}
                      onChange={(e) =>
                        setRows((old) => {
                          const next = [...old];
                          next[idx] = {
                            ...next[idx],
                            category: e.target.value,
                          };
                          return next;
                        })
                      }
                    />
                  </td>

                  {zones.map((z) => (
                    <td key={z.key} className="td">
                      <input
                        className="input text-right !py-1 !px-2 text-sm"
                        inputMode="numeric"
                        value={String(r.prices?.[z.key] ?? 0)}
                        onChange={(e) =>
                          setCell(
                            idx,
                            z.key,
                            e.target.value.replace(/[^\d.]/g, "")
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              );
            })}

            {!pagedRows.length && !busy && (
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

        {/* subtle horizontal scroll hint */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/90 to-transparent" />
        {busy && (
          <div className="py-6 text-center text-sm text-slate-600">
            Working…
          </div>
        )}
      </div>

      {/* ---------- Pagination ---------- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="opacity-70">
          Showing <b>{pagedRows.length}</b> of <b>{rows.length}</b> items — page{" "}
          <b>{page}</b> / <b>{totalPages}</b>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            className="btn btn-sm flex-1 sm:flex-none"
            disabled={page <= 1}
            onClick={prevPage}
          >
            Prev
          </button>
          <button
            className="btn btn-sm flex-1 sm:flex-none"
            disabled={page >= totalPages}
            onClick={nextPage}
          >
            Next
          </button>
        </div>
      </div>

      {!!msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
