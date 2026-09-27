// RateGen: the rates, the materials, the labour and the plant behind them.
//
// Kept alongside /rategen rather than over it. That screen is 900 lines and
// does things this one does not — master and user tabs, the per-row price
// editing — and replacing working software with a redesign is a decision worth
// making deliberately. What this adds is what /rategen has never had: one rate
// opened and shown as what it is made of (see DsWorkRate), the customer's own
// rates sitting in the same list as the published ones, and a way to build one.
//
// His markup: .wk-head / .wk-bar / .wk-find / .wk-tabs / .wk-dd / .wk-count,
// .wk-tbl.wk-tbl-rates.rg for the seven-column rates table, .wk-tbl-mat for
// materials, labour and plant, and .rg-op for the bar above them.
//
// WHAT IS CUSTOMER-LEVEL, AND WHY THAT IS THE WHOLE POINT
//
// Everything this screen writes is the customer's own data: their own prices
// (priceOverrides), their own copy of a published rate (rateOverrides) and
// their own rates (customRates). Master material, labour and rate prices are
// corrected in Rate Gen desktop and published from there; the website's master
// write routes answer 405 MASTER_READ_ONLY. So the copy here never claims a
// change reaches anybody else's library.
//
// THE LOCATION SWITCH IS STILL NOT REPRODUCED
//
// Re-pricing every rate against another geopolitical zone is a server job, not
// a client toggle. Rates arrive scoped to the caller's location and the screen
// says which.

import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useFeedback } from "./feedback/feedbackContext.js";
import WkDropdown from "./WkDropdown.jsx";
import CustomRateBuilder from "./rategen/CustomRateBuilder.jsx";
import TradeMarginsEditor from "./rategen/TradeMarginsEditor.jsx";
import PlantEditor from "./rategen/PlantEditor.jsx";
import { marginRowsPayload } from "./rategen/tradeMargins.js";
import { plantDraftProblem } from "./rategen/plantMath.js";
import {
  blankDefaults,
  draftProblem,
  draftToPayload,
  draftTotals,
  emptyDraft,
  newCustomRateId,
} from "./rategen/customRateDraft.js";
import { componentsOf, toNum, unexplainedNet } from "./rategen/rateMath.js";
import { mergeRateRows } from "./rategen/mergeRateRows.js";
import { fetchAllRates } from "./rategen/fetchRates.js";

const DASH = "–"; // an empty value, never an em dash

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const pc = (n) =>
  `${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(Number(n) || 0)}%`;

const qty = (n) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 4 }).format(Number(n) || 0);

const TABS = [
  { id: "rates", label: "Item of works" },
  { id: "materials", label: "Materials" },
  { id: "labour", label: "Labour" },
  { id: "plant", label: "Plant" },
];

const RATE_SORTS = [
  { value: "name", label: "Name, A to Z" },
  { value: "rate-hi", label: "Price, high to low" },
  { value: "rate-lo", label: "Price, low to high" },
  { value: "recent", label: "Recently changed" },
  { value: "trade", label: "Trade" },
];

export default function DsWorkLibrary() {
  const { accessToken } = useAuth();
  const fb = useFeedback();
  const navigate = useNavigate();

  const [rates, setRates] = React.useState(null);
  const [ratesTruncated, setRatesTruncated] = React.useState(false);
  const [mine, setMine] = React.useState(null);
  const [master, setMaster] = React.useState(null); // materials + labour
  const [masterFailed, setMasterFailed] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // The plant library (machines per day from their parts, used by the hour)
  // and the customer's default overhead / profit per trade. Both are read
  // when something first needs them.
  const [plantLib, setPlantLib] = React.useState(null); // { items, version }
  const [plantFailed, setPlantFailed] = React.useState(false);
  const [trades, setTrades] = React.useState(null); // { trades, version }

  const [tab, setTab] = React.useState("rates");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("name");
  const [cat, setCat] = React.useState("all");

  const loadRates = React.useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return Promise.all([
      // The whole library, page by page. Asking for one page and dropping the
      // cursor showed a big practice part of its own catalogue and said
      // nothing about the rest.
      fetchAllRates(({ limit, cursor }) =>
        apiAuthed("/rategen-v2/library/rates/sync", {
          token: accessToken,
          params: cursor ? { limit, cursor } : { limit },
        }),
      ),
      apiAuthed("/rategen-v2/library/user-rates", { token: accessToken })
        .then((d) => ({
          overrides: Array.isArray(d.rateOverrides) ? d.rateOverrides : [],
          customs: Array.isArray(d.customRates) ? d.customRates : [],
          ratesVersion: d?.meta?.ratesVersion ?? 1,
          customRatesVersion: d?.meta?.customRatesVersion ?? 1,
        }))
        // Having no library of your own is the normal state on day one.
        .catch(() => ({
          overrides: [],
          customs: [],
          ratesVersion: 1,
          customRatesVersion: 1,
        })),
    ]).then(([paged, own]) => {
      setRates(paged.items);
      setRatesTruncated(paged.truncated);
      setMine(own);
    });
  }, [accessToken]);

  const loadMaster = React.useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiAuthed("/rategen/master", { token: accessToken })
      .then((d) =>
        setMaster({
          materials: Array.isArray(d.materials) ? d.materials : [],
          labour: Array.isArray(d.labour) ? d.labour : [],
          state: d.state || d.accountState || null,
          zone: d.zone || null,
        }),
      )
      .catch(() => setMasterFailed(true));
  }, [accessToken]);

  const loadPlant = React.useCallback(() => {
    if (!accessToken) return Promise.resolve(null);
    return apiAuthed("/rategen-v2/library/plant", { token: accessToken })
      .then((d) => {
        const v = { items: Array.isArray(d.items) ? d.items : [], version: d.version ?? 1 };
        setPlantLib(v);
        setPlantFailed(false);
        return v;
      })
      .catch(() => {
        setPlantFailed(true);
        return null;
      });
  }, [accessToken]);

  const loadTrades = React.useCallback(() => {
    if (!accessToken) return Promise.resolve(null);
    return apiAuthed("/rategen-v2/library/trade-margins", { token: accessToken })
      .then((d) => {
        const v = { trades: Array.isArray(d.trades) ? d.trades : [], version: d.version ?? 1 };
        setTrades(v);
        return v;
      })
      // No table is the normal state: a blank box is then 10 / 10, as before.
      .catch(() => null);
  }, [accessToken]);

  React.useEffect(() => {
    if (!accessToken || tab !== "plant" || plantLib || plantFailed) return;
    loadPlant();
  }, [accessToken, tab, plantLib, plantFailed, loadPlant]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    loadRates().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, loadRates]);

  // The catalogue is hundreds of rows and most visits never leave the rates
  // tab, so it is fetched when something first needs it — a tab, or the
  // builder's line pickers.
  const needMaster = tab === "materials" || tab === "labour";
  React.useEffect(() => {
    if (!accessToken || !needMaster || master || masterFailed) return;
    loadMaster();
  }, [accessToken, needMaster, master, masterFailed, loadMaster]);

  const rows = React.useMemo(
    () => (rates && mine ? mergeRateRows(rates, mine.overrides, mine.customs) : null),
    [rates, mine],
  );

  const sections = React.useMemo(() => {
    if (!rows) return [];
    const seen = new Map();
    for (const r of rows) {
      const k = r.sectionKey || "";
      if (!k) continue;
      const cur = seen.get(k) || { key: k, label: r.sectionLabel || k, count: 0 };
      cur.count += 1;
      seen.set(k, cur);
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  /* ── plant: the library (R2) ─────────────────────────────────────────────
     Each machine is costed per day from its parts (hire or ownership, fuel,
     operator, maintenance, transport) and priced per hour at its stated
     working day. "Used in" counts the rates whose build-up names it. A machine
     that cannot be priced says so and is never shown at ₦0. */
  const plantRows = React.useMemo(() => {
    const used = new Map();
    for (const r of rows || []) {
      const names = new Set(
        componentsOf(r)
          .filter((c) => c.kind === "plant" || c.kind === "equipment")
          .map((c) => (c.name || "").trim().toLowerCase())
          .filter(Boolean),
      );
      for (const n of names) used.set(n, (used.get(n) || 0) + 1);
    }
    return (plantLib?.items || []).map((p) => ({
      ...p,
      rowKey: p.sn != null ? `sn-${p.sn}` : `own-${p.key}`,
      used: used.get(String(p.name || "").trim().toLowerCase()) || 0,
    }));
  }, [rows, plantLib]);

  const itemRows = React.useMemo(() => {
    if (tab !== "materials" && tab !== "labour") return [];
    const src = (tab === "materials" ? master?.materials : master?.labour) || [];
    // How many rates carry a component of this name: a real figure, read off
    // the build-ups we already hold.
    const used = new Map();
    for (const r of rows || []) {
      const names = new Set(
        componentsOf(r)
          .map((c) => (c.name || "").trim().toLowerCase())
          .filter(Boolean),
      );
      for (const n of names) used.set(n, (used.get(n) || 0) + 1);
    }
    return src.map((m) => ({
      ...m,
      used: used.get(String(m.description || "").trim().toLowerCase()) || 0,
    }));
  }, [tab, master, rows]);

  const categories = React.useMemo(() => {
    if (tab === "rates") {
      return [
        { value: "all", label: "All trades", note: `${rows?.length || 0}` },
        ...sections.map((s) => ({ value: s.key, label: s.label, note: `${s.count}` })),
      ];
    }
    if (tab === "plant") {
      const counts = new Map();
      for (const p of plantRows) {
        const c = (p.category || "").trim();
        if (c) counts.set(c, (counts.get(c) || 0) + 1);
      }
      return [
        { value: "all", label: "All plant", note: `${plantRows.length}` },
        ...[...counts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([c, n]) => ({ value: c, label: c, note: `${n}` })),
      ];
    }
    const counts = new Map();
    for (const m of itemRows) {
      const k = (m.category || "").trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [
      { value: "all", label: "All categories", note: `${itemRows.length}` },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, n]) => ({ value: k, label: k, note: `${n}` })),
    ];
  }, [tab, rows, sections, itemRows, plantRows]);

  const term = q.trim().toLowerCase();

  const shownRates = React.useMemo(() => {
    if (!rows) return null;
    let list = rows;
    if (cat !== "all") list = list.filter((r) => (r.sectionKey || "") === cat);
    if (term) {
      list = list.filter((r) =>
        `${r.description || ""} ${r.title || ""} ${r.itemNo || ""} ${r.sectionLabel || ""}`
          .toLowerCase()
          .includes(term),
      );
    }
    list = [...list];
    const name = (r) => String(r.description || r.title || "");
    if (sort === "rate-hi") list.sort((a, b) => toNum(b.totalCost) - toNum(a.totalCost));
    else if (sort === "rate-lo") list.sort((a, b) => toNum(a.totalCost) - toNum(b.totalCost));
    else if (sort === "recent")
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    else if (sort === "trade")
      list.sort(
        (a, b) =>
          String(a.sectionLabel || "").localeCompare(String(b.sectionLabel || "")) ||
          name(a).localeCompare(name(b)),
      );
    else list.sort((a, b) => name(a).localeCompare(name(b)));
    return list;
  }, [rows, cat, term, sort]);

  const shownItems = React.useMemo(() => {
    let list = itemRows;
    if (cat !== "all") list = list.filter((m) => (m.category || "") === cat);
    if (term)
      list = list.filter((m) =>
        `${m.description || ""} ${m.category || ""}`.toLowerCase().includes(term),
      );
    list = [...list];
    if (sort === "rate-hi") list.sort((a, b) => toNum(b.price) - toNum(a.price));
    else if (sort === "rate-lo") list.sort((a, b) => toNum(a.price) - toNum(b.price));
    else
      list.sort((a, b) =>
        String(a.description || "").localeCompare(String(b.description || "")),
      );
    return list;
  }, [itemRows, cat, term, sort]);

  const shownPlant = React.useMemo(
    () =>
      plantRows.filter(
        (p) =>
          (cat === "all" || (p.category || "") === cat) &&
          (!term || p.name.toLowerCase().includes(term)),
      ),
    [plantRows, term, cat],
  );

  const pickTab = (id) => {
    setTab(id);
    setCat("all");
    setSort("name");
  };

  /* ── the composition card (RG-03) ──────────────────────────────────────── */

  function openRate(e, r) {
    const comps = componentsOf(r);
    if (!comps.length) return; // nothing to show: let the link navigate
    e.preventDefault();

    // The part of the net cost no component accounts for. Without it the card
    // lists lines that come to less than the Net cost printed under them, and
    // a rate that adds up reads as a broken one. Same figure and same words as
    // the build-up (DsWorkRate), which explains there that your copy keeps it.
    const unexplained = unexplainedNet(toNum(r.netCost), comps);

    const rows2 = [
      ...comps.map((c) => [
        `${c.name} · ${qty(c.quantity)} ${c.unit || ""} × ${money(c.unitPrice)}`.replace(
          /\s+/g,
          " ",
        ),
        money(c.amount),
      ]),
      ...(unexplained !== 0 ? [["Not itemised", money(unexplained)]] : []),
      ["Net cost", money(r.netCost)],
      [`Overhead · ${pc(r.overheadPercent)}`, money(r.overheadValue)],
      [`Profit · ${pc(r.profitPercent)}`, money(r.profitValue)],
      [`Rate per ${r.unit || "unit"}`, money(r.totalCost)],
    ];

    fb.card({
      tone: "info",
      noIcon: true,
      title: "Rate composition",
      msg: r.description || r.title || "",
      rows: rows2,
      secondary: "Close",
      primary: "Open the build-up",
    }).then((v) => {
      if (v === "primary") navigate(r.href);
    });
  }

  /* ── update prices by category (RG-08) ─────────────────────────────────── */

  async function updatePrices() {
    const cats = [...new Set(itemRows.map((m) => (m.category || "").trim()).filter(Boolean))].sort();
    const form = { category: "all", percent: "5" };

    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: "Update your prices",
      msg: "Change every material in a category by a percentage. This changes YOUR prices, not the published ones.",
      body: (
        <div className="rg-edit">
          <label>
            <span>Category</span>
            <select
              defaultValue="all"
              onChange={(e) => {
                form.category = e.target.value;
              }}
            >
              <option value="all">All materials</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Change by</span>
            <input
              type="number"
              step="0.5"
              defaultValue="5"
              onChange={(e) => {
                form.percent = e.target.value;
              }}
            />
            <em>% — negative to reduce</em>
          </label>
        </div>
      ),
      secondary: "Cancel",
      primary: "Apply",
    });
    if (answer !== "primary") return;

    const percent = Number(form.percent);
    if (!Number.isFinite(percent) || percent === 0) {
      fb.toast({ tone: "error", title: "Give a percentage to change by" });
      return;
    }

    try {
      const res = await apiAuthed("/rategen/price-overrides/bulk", {
        method: "PUT",
        token: accessToken,
        body: {
          kind: "material",
          category: form.category === "all" ? null : form.category,
          percent,
        },
      });
      // What ACTUALLY changed, not what was asked for. The server caps a single
      // change (MAX_BULK_ROWS) and skips a row whose price does not move once
      // it is rounded, so "N prices raised" on its own could be a report of a
      // change that half happened.
      const changed = Number(res?.changed) || 0;
      const matched = Number(res?.matched) || 0;
      const cap = Number(res?.limit) || 0;
      const capped = Boolean(res?.capped);
      const notLookedAt = capped && cap ? Math.max(0, matched - cap) : 0;
      const unmoved = Math.max(0, matched - changed - notLookedAt);
      const rest = [
        notLookedAt
          ? `${matched} rows matched and one change covers at most ${cap}, so ${notLookedAt} were not looked at — change them by category to reach the rest.`
          : "",
        unmoved
          ? `${unmoved} came to the same figure once rounded, so nothing was written for them.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (!changed) {
        fb.toast({
          title: "Nothing changed",
          msg: rest || "No price in that category moved at this percentage.",
          ms: rest ? 7000 : undefined,
        });
        return;
      }
      setMaster(null);
      setMasterFailed(false);
      await loadMaster();
      fb.toast({
        title: `${changed}${matched && changed !== matched ? ` of ${matched}` : ""} price${
          changed === 1 ? "" : "s"
        } ${percent > 0 ? "raised" : "reduced"} by ${Math.abs(percent)}%`,
        // His copy said every rate using them follows. Ours must not: a rate
        // stores the cost it was built at, so a price change reaches a rate
        // only when that rate is priced again.
        msg: `These are your own prices. Rates already built keep the cost they were built at until they are priced again.${
          rest ? ` ${rest}` : ""
        }`,
        ms: rest ? 9000 : 6000,
        action: Array.isArray(res?.previous)
          ? {
              label: "Undo",
              run: async () => {
                try {
                  await apiAuthed("/rategen/price-overrides/restore", {
                    method: "PUT",
                    token: accessToken,
                    body: { items: res.previous },
                  });
                  setMaster(null);
                  setMasterFailed(false);
                  await loadMaster();
                  fb.toast({ title: "Put back" });
                } catch {
                  fb.toast({ tone: "error", title: "That could not be undone" });
                }
              },
            }
          : undefined,
      });
    } catch (e) {
      fb.toast({
        tone: "error",
        title: "Prices were not changed",
        msg: String(e?.message || "Please try again."),
      });
    }
  }

  /* ── default overhead and profit by trade (R2) ─────────────────────────── */

  async function openTradeMargins() {
    const t = trades || (await loadTrades());
    if (!t) {
      fb.toast({ tone: "error", title: "Your trade margins could not be read", msg: "Please try again." });
      return;
    }
    const draftRef = { current: null };
    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: "Default margins by trade",
      msg: "The overhead and profit a new rate of yours gets when you leave its boxes blank. Rates already in your library keep their own figures: nothing here re-prices them.",
      body: <TradeMarginsEditor draftRef={draftRef} trades={t.trades} scope="custom" />,
      secondary: "Cancel",
      primary: "Save margins",
      validate: () => {
        const { problem } = marginRowsPayload(draftRef.current || []);
        if (problem) {
          fb.toast({ tone: "error", title: problem });
          return false;
        }
        return true;
      },
    });
    if (answer !== "primary") return;
    try {
      const d = await apiAuthed("/rategen-v2/library/trade-margins", {
        method: "PUT",
        token: accessToken,
        body: { rows: marginRowsPayload(draftRef.current).rows, baseVersion: t.version },
      });
      setTrades({ trades: d.trades || [], version: d.version ?? t.version + 1 });
      fb.toast({
        title: "Margins saved",
        msg: "New rates of yours in these trades start from them. No rate you already have was changed.",
      });
    } catch (e) {
      fb.toast({ tone: "error", title: "Margins were not saved", msg: String(e?.message || "Nothing was written.") });
    }
  }

  /* ── a machine: what its day costs, and your own version (R2) ──────────── */

  async function openPlant(p) {
    const rowsCard = [
      ...(p.parts || []).map((x) => [
        `${x.description || x.kind} · ${qty(x.quantity)} ${x.unit || ""} × ${money(x.unitPrice)}`.replace(/\s+/g, " "),
        money(x.amount),
      ]),
      ["Day cost", money(p.dayCost)],
      ["Working day", p.hoursPerDay ? `${qty(p.hoursPerDay)} hours` : DASH],
      ["Per hour", p.hourlyRate === null ? `Not priced · ${p.problems?.[0] || ""}` : money(p.hourlyRate)],
      ...(p.source === "your-copy" && p.adlm?.hourlyRate != null
        ? [["ADLM's figure", `${money(p.adlm.hourlyRate)} per hr`]]
        : []),
    ];
    const mine = p.source === "yours" || p.source === "your-copy";
    const v = await fb.card({
      tone: "info",
      noIcon: true,
      title: p.name,
      msg:
        p.source === "adlm"
          ? "ADLM's machine. Make your own version to use your own hire, diesel or operator prices; ADLM's stays as it is."
          : p.source === "your-copy"
            ? "Your version of ADLM's machine. Rates you build from now on use it."
            : "A machine of your own.",
      rows: rowsCard,
      secondary: p.source === "your-copy" ? "Go back to ADLM's" : "Close",
      primary: mine ? "Edit" : "Make my own version",
    });
    if (v === "primary") return editPlant(p);
    if (v === "secondary" && p.source === "your-copy") {
      const sure = await fb.card({
        tone: "warn",
        title: "Go back to ADLM's figures?",
        msg: "Your version of this machine is removed. Rates already built keep the price they were built at.",
        secondary: "Keep mine",
        primary: "Go back",
      });
      if (sure !== "primary") return undefined;
      try {
        const d = await apiAuthed(`/rategen-v2/library/plant/${encodeURIComponent(p.key)}`, {
          method: "DELETE",
          token: accessToken,
        });
        setPlantLib({ items: d.items || [], version: d.version ?? 1 });
        fb.toast({ title: "Back to ADLM's figures" });
      } catch (e) {
        fb.toast({ tone: "error", title: "That did not change", msg: String(e?.message || "") });
      }
    }
    return undefined;
  }

  async function editPlant(p = null) {
    const draftRef = { current: null };
    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: p ? `Your ${p.name}` : "A machine of your own",
      msg: "Cost a working day from its parts. The hourly rate is the day cost over the working hours, and a rate uses it by the hour.",
      body: <PlantEditor draftRef={draftRef} initial={p} />,
      secondary: "Cancel",
      primary: "Save machine",
      validate: () => {
        const problem = plantDraftProblem(draftRef.current || {});
        if (problem) {
          fb.toast({ tone: "error", title: problem });
          return false;
        }
        return true;
      },
    });
    if (answer !== "primary") return;
    const d = draftRef.current;
    // An ADLM machine's version is filed under its serial, so there is only
    // ever one of it; a machine of the customer's own keeps the key it has.
    const key = p?.source === "adlm" || p?.source === "your-copy" ? p.key || `copy-${p.sn}` : p?.key || newCustomRateId(d.name);
    try {
      const res = await apiAuthed(`/rategen-v2/library/plant/${encodeURIComponent(key)}`, {
        method: "PUT",
        token: accessToken,
        body: {
          ...d,
          baseSn: p && p.sn != null ? p.sn : null,
          plantBaseVersion: plantLib?.version ?? 1,
        },
      });
      setPlantLib({ items: res.items || [], version: res.version ?? 1 });
      fb.toast({
        title: "Machine saved",
        msg: "Rates you build from now on use it. Rates already built keep the price they were built at.",
      });
    } catch (e) {
      fb.toast({ tone: "error", title: "That did not save", msg: String(e?.message || "Nothing was written.") });
    }
  }

  /* ── build a custom rate (RG-09) ───────────────────────────────────────── */

  async function buildRate() {
    const [, plantNow, tradesNow] = await Promise.all([
      !master && !masterFailed ? loadMaster() : null,
      plantLib || (plantFailed ? null : loadPlant()),
      trades || loadTrades(),
    ]);
    const plantItems = (plantNow || plantLib)?.items || [];
    const tradeRows = (tradesNow || trades)?.trades || [];
    const draftRef = { current: null };

    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: "Build a custom rate",
      msg: "Name it, set overhead and profit, and add what goes into it. It is saved to your own library.",
      body: (
        <CustomRateBuilder
          draftRef={draftRef}
          materials={master?.materials || []}
          labour={master?.labour || []}
          plant={plantItems}
          trades={tradeRows}
          sections={sections}
          initial={emptyDraft(
            cat !== "all"
              ? { sectionKey: cat, sectionLabel: sections.find((s) => s.key === cat)?.label || "" }
              : {},
          )}
        />
      ),
      secondary: "Cancel",
      primary: "Save rate",
      validate: () => {
        const problem = draftProblem(draftRef.current || {});
        if (problem) {
          fb.toast({ tone: "error", title: problem });
          return false;
        }
        return true;
      },
    });
    if (answer !== "primary") return;

    const draft = draftRef.current;
    const id = newCustomRateId(draft.name);
    try {
      await apiAuthed(`/rategen-v2/library/custom-rates/${encodeURIComponent(id)}`, {
        method: "PUT",
        token: accessToken,
        // A blank box is saved at the figure the card showed for it: the
        // customer's trade default, else 10 / 10.
        body: draftToPayload(
          draft,
          id,
          mine?.customRatesVersion ?? 1,
          blankDefaults(tradeRows, draft.sectionKey),
        ),
      });
      await loadRates();
      const t = draftTotals(draft, blankDefaults(tradeRows, draft.sectionKey));
      const opened = await fb.card({
        tone: "success",
        title: "New rate saved",
        msg: `${draft.name.trim()} · ${money(t.totalCost)} per ${draft.unit}`,
        secondary: "Back to the library",
        primary: "Open the build-up",
      });
      if (opened === "primary") navigate(`/work/rate/custom:${id}`);
    } catch (e) {
      const conflict = String(e?.message || "").toLowerCase().includes("conflict");
      fb.toast({
        tone: "error",
        title: conflict ? "Your library moved underneath this" : "That did not save",
        msg: conflict
          ? "Refresh the page and build it again — nothing was written."
          : String(e?.message || "Nothing was written."),
      });
    }
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Your rate library could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!shownRates) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading your rate library…</p>
      </div>
    );
  }

  const zone = rows.find((r) => r.zone)?.zone || rows.find((r) => r.state)?.state || "";
  const ownCount = rows.filter((r) => r.own).length;

  const count =
    tab === "rates"
      ? `${shownRates.length} of ${rows.length} rate${rows.length === 1 ? "" : "s"}${
          cat === "all" ? "" : ` in ${categories.find((c) => c.value === cat)?.label || ""}`
        }${zone ? ` · priced for ${zone}` : ""}${ownCount ? ` · ${ownCount} of them yours` : ""}${
          // Said out loud rather than left as a short list that looks complete.
          ratesTruncated
            ? " · more rates exist than this screen could load — open Rate Gen for the rest"
            : ""
        }`
      : tab === "plant"
        ? plantLib
          ? `${shownPlant.length} machine${shownPlant.length === 1 ? "" : "s"} · priced per day from their parts, used by the hour`
          : plantFailed
            ? "The plant library could not be read."
            : "Reading the plant library…"
        : master
          ? `${shownItems.length} ${tab === "materials" ? "material" : "labour"} row${
              shownItems.length === 1 ? "" : "s"
            }${master.state ? ` · priced for ${master.state}` : ""}`
          : masterFailed
            ? "The catalogue could not be read."
            : "Reading the catalogue…";

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>RateGen</h1>
          <p>
            One library for the practice. Published rates, your own corrections to them and the
            rates you build yourself, in the same place — and Rate Gen, QUIV and HERON read the
            same library through this account.
          </p>
        </div>
        <div className="wk-acts">
          {tab === "rates" ? (
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={buildRate}>
              Build a custom rate
            </button>
          ) : null}
          <Link className="ds-btn btn-o ds-btn-sm" to="/rategen">
            Edit the library
          </Link>
        </div>
      </div>

      <div className="wk-bar">
        <label className="wk-find">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-search" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rates, materials, gangs — or a description"
            aria-label="Search the library"
            autoComplete="off"
          />
        </label>

        <div className="wk-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "on" : ""}
              onClick={() => pickTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {categories.length > 1 ? (
          <WkDropdown
            label={tab === "rates" ? "Trade" : "Category"}
            value={cat}
            options={categories}
            onPick={setCat}
          />
        ) : null}

        <WkDropdown
          label="Sort by"
          value={sort}
          options={tab === "rates" ? RATE_SORTS : RATE_SORTS.slice(0, 3)}
          onPick={setSort}
        />
      </div>

      <p className="wk-count">{count}</p>

      {tab === "rates" ? (
        <div className="rg-op">
          <b>Margins</b>
          <em>
            Set your own overhead and profit per trade. A new rate you build starts from them;
            rates already in your library keep their own figures.
          </em>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={openTradeMargins}>
            Default margins by trade
          </button>
        </div>
      ) : null}

      {tab === "plant" ? (
        <div className="rg-op">
          <b>Plant</b>
          <em>
            Each machine is costed for a working day from its hire, fuel, operator, maintenance
            and transport, then priced per hour. Rates use it by the hour.
          </em>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => editPlant(null)}
            disabled={!plantLib}
          >
            Add a machine of your own
          </button>
        </div>
      ) : null}

      {tab === "materials" ? (
        <div className="rg-op">
          <b>Prices</b>
          <em>
            Market prices move. Change a category by a percentage and your own prices follow.
            Rates already built keep the cost they were built at until they are priced again.
          </em>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={updatePrices}
            disabled={!master || !itemRows.length}
          >
            Update prices
          </button>
        </div>
      ) : null}

      {tab === "rates" ? (
        !rows.length ? (
          <div className="wk-empty">
            Nothing in the library yet. Rate Gen fills this as rates are published to your
            account, and every product on the account prices against it. You can also build a
            rate of your own here and it behaves exactly like a published one.
          </div>
        ) : !shownRates.length ? (
          <p className="wk-empty">
            Nothing here matches{term ? ` “${q.trim()}”` : ""}.
          </p>
        ) : (
          <div className="wk-tbl wk-tbl-rates rg" role="table">
            <div className="wk-hd" role="row">
              <span>Item of work</span>
              <span>Unit</span>
              <span>Net cost</span>
              <span>Overhead</span>
              <span>Profit</span>
              <span>Total</span>
              <span />
            </div>
            {shownRates.map((r) => (
              <Link
                className="wk-row"
                role="row"
                to={r.href}
                key={r.id}
                onClick={(e) => openRate(e, r)}
              >
                <span className="wk-nm">
                  <b>{r.description || r.title || r.itemNo || "Untitled rate"}</b>
                  <span>
                    {[r.itemNo, r.sectionLabel].filter(Boolean).join(" · ")}
                    {r.own ? (
                      <>
                        {" · "}
                        <em className="wk-own">
                          {r.own === "custom" ? "yours" : "yours · edited"}
                        </em>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="wk-u">{r.unit || DASH}</span>
                <span className="wk-n">{money(r.netCost)}</span>
                <span className="wk-n m">
                  {money(r.overheadValue)}
                  <i>{pc(r.overheadPercent)}</i>
                </span>
                <span className="wk-n m">
                  {money(r.profitValue)}
                  <i>{pc(r.profitPercent)}</i>
                </span>
                <span className="wk-r">
                  {money(r.totalCost)}
                  <i>per {r.unit || "unit"}</i>
                </span>
                <span className="wk-go">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <use href="#hi-right" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        )
      ) : tab === "plant" ? (
        plantFailed ? (
          <div className="wk-empty">
            The plant library could not be read just now. Your rates are unaffected; please
            refresh.
          </div>
        ) : !plantLib ? (
          <p className="ds-sub">Reading the plant library…</p>
        ) : shownPlant.length ? (
          <div className="wk-tbl wk-tbl-mat" role="table">
            <div className="wk-hd" role="row">
              <span>Machine</span>
              <span>Unit</span>
              <span>Per hour</span>
              <span>Used in</span>
            </div>
            {shownPlant.map((p) => (
              <a
                className="wk-row"
                role="row"
                key={p.rowKey}
                href={`#plant-${p.rowKey}`}
                onClick={(e) => {
                  e.preventDefault();
                  openPlant(p);
                }}
              >
                <span className="wk-nm">
                  <b>{p.name}</b>
                  <span>
                    {money(p.dayCost)} a day
                    {p.hoursPerDay ? ` · ${qty(p.hoursPerDay)}-hour day` : ""}
                    {p.category ? ` · ${p.category}` : ""}
                    {p.source !== "adlm" ? (
                      <>
                        {" · "}
                        <em className="wk-own">{p.source === "yours" ? "yours" : "your version"}</em>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="wk-u">hr</span>
                <span className="wk-r">
                  {p.hourlyRate === null ? DASH : money(p.hourlyRate)}
                  <i>{p.hourlyRate === null ? p.problems?.[0] || "not priced" : "per hr"}</i>
                </span>
                <span className="wk-w">
                  {p.used ? `${p.used} rate${p.used === 1 ? "" : "s"}` : <em>not used yet</em>}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="wk-empty">
            {term || cat !== "all"
              ? "Nothing here matches."
              : "No machines in the plant library yet. Add one of your own: cost a working day from its parts and it is priced per hour for your rates."}
          </div>
        )
      ) : masterFailed ? (
        <div className="wk-empty">
          The material and labour catalogue could not be read. It is served separately from the
          rates, so this can fail on its own while everything else is fine.
        </div>
      ) : !master ? (
        <p className="ds-sub">Reading the catalogue…</p>
      ) : !shownItems.length ? (
        <p className="wk-empty">
          Nothing here matches{term ? ` “${q.trim()}”` : ""}.
        </p>
      ) : (
        <div className="wk-tbl wk-tbl-mat" role="table">
          <div className="wk-hd" role="row">
            <span>{tab === "materials" ? "Material" : "Gang"}</span>
            <span>Unit</span>
            <span>{tab === "materials" ? "Price" : "Day rate"}</span>
            <span>Used in</span>
          </div>
          {shownItems.map((m) => (
            <div className="wk-row" role="row" key={`${m.sn}-${m.description}`}>
              <span className="wk-nm">
                <b>{m.description}</b>
                <span>
                  {m.category || DASH}
                  {m.isUserPrice ? (
                    <>
                      {" · "}
                      <em className="wk-own">your price</em>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="wk-u">{m.unit || DASH}</span>
              <span className="wk-r">
                {money(m.price)}
                <i>per {m.unit || "unit"}</i>
              </span>
              <span className="wk-w">
                {m.used ? (
                  `${m.used} rate${m.used === 1 ? "" : "s"}`
                ) : (
                  <em>not used yet</em>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
