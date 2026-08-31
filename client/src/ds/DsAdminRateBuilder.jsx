// Build a rate — the only place on the website where a rate is created.
//
// THE DIVISION OF LABOUR, AND WHY IT IS THIS WAY ROUND
//
//   view a rate            website
//   build a NEW rate       website, here, and nowhere else
//   edit an existing rate  Rate Gen
//   master component prices Rate Gen, pulled down by every install
//
// A rate is not a number, it is an argument: this much cement, this many
// blocklayer days, this much waste, and here is the overhead and profit on
// top. Anyone can dispute a total; only a build-up can be checked. So this
// screen composes the argument and lets the arithmetic follow, rather than
// asking for a figure and taking it on trust.
//
// PRICES ARE NOT TYPED HERE
//
// Every unit price comes from the master library and is shown, not edited.
// That library lives in the RateGen cluster, is priced by zone, and is
// maintained in Rate Gen. If a price is wrong it is wrong for everybody and it
// gets fixed once, there — not silently overridden inside one rate where
// nobody would ever find it again.
//
// WASTE IS PER LINE, NOT PER RATE
//
// Because it is a property of the material, not of the work: sand loses more
// than cement, and a single rate-wide percentage would quietly overstate one
// and understate the other.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useAdmToast } from "./adminKit.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const ZONES = [
  ["south_west", "South West"],
  ["south_east", "South East"],
  ["south_south", "South South"],
  ["north_central", "North Central"],
  ["north_east", "North East"],
  ["north_west", "North West"],
];

/** net contribution of one line: quantity × price, plus its own waste. */
const lineNet = (l) => {
  const q = Number(l.quantity) || 0;
  const p = Number(l.unitPrice) || 0;
  const w = Number(l.waste) || 0;
  return q * p * (1 + w / 100);
};

export default function DsAdminRateBuilder() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [zone, setZone] = React.useState("south_west");
  const [lib, setLib] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("material");

  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [sectionKey, setSectionKey] = React.useState("blockwork");
  const [overheadPercent, setOverheadPercent] = React.useState(10);
  const [profitPercent, setProfitPercent] = React.useState(25);
  const [lines, setLines] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(null);

  // ── dragging ──────────────────────────────────────────────────────────────
  //
  // What is being dragged lives in a ref, not in state. The obvious place is
  // dataTransfer, but a browser will not let you READ dataTransfer during
  // dragover — only on drop — and dragover is exactly where the insertion
  // marker has to be decided. So the payload is kept here and dataTransfer
  // carries only a text label, which is what Firefox needs to begin a drag at
  // all.
  const dragRef = React.useRef(null);
  const [dragKind, setDragKind] = React.useState(null); // "lib" | "line" | null
  const [overIndex, setOverIndex] = React.useState(null);
  const [gripKey, setGripKey] = React.useState(null);

  // A row is only draggable once the pointer goes down on its grip. Making the
  // whole row draggable is less code and worse: a draggable ancestor stops you
  // selecting the digits inside its number inputs, so quantities become
  // fiddly to correct. The grip keeps editing and reordering apart.
  const endDrag = () => {
    dragRef.current = null;
    setDragKind(null);
    setOverIndex(null);
    setGripKey(null);
  };

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      apiAuthed("/admin/catalogue/library", { token: accessToken, params: { zone, q } })
        .then((r) => alive && setLib(r))
        .catch(() => alive && say("The component library could not be loaded."));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, zone, q, say]);

  // Keys were built from the list length, which repeats: add a component twice,
  // remove the first, add it again, and the new row collides with the surviving
  // one. React then reuses the wrong row and the quantity you typed jumps to a
  // different line. A counter cannot collide.
  const seq = React.useRef(0);

  const lineFor = (item) => ({
    key: `${item.kind}-${item.sn}-${(seq.current += 1)}`,
    componentName: item.name,
    unit: item.unit,
    unitPrice: item.price,
    quantity: 1,
    waste: item.kind === "material" ? 5 : 0,
    refKind: item.kind,
    refSn: item.sn,
    refName: item.name,
  });

  const add = (item) => setLines((ls) => [...ls, lineFor(item)]);

  const addAt = (item, at) =>
    setLines((ls) => {
      const next = ls.slice();
      next.splice(Math.max(0, Math.min(at, ls.length)), 0, lineFor(item));
      return next;
    });

  const moveLine = (key, at) =>
    setLines((ls) => {
      const from = ls.findIndex((l) => l.key === key);
      if (from < 0) return ls;
      const next = ls.slice();
      const [row] = next.splice(from, 1);
      // Pulling the row out first shifts every later position down by one, so a
      // drop below its old home has to be corrected or the row lands one place
      // short of where the marker promised.
      next.splice(from < at ? at - 1 : at, 0, row);
      return next;
    });

  const patch = (key, field, value) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const drop = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  /* ── drag handlers ──────────────────────────────────────────────────────── */

  function startDragItem(e, item) {
    dragRef.current = { type: "lib", item };
    setDragKind("lib");
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", item.name);
  }

  function startDragLine(e, key) {
    dragRef.current = { type: "line", key };
    setDragKind("line");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  }

  // Which side of the row the pointer is on decides whether the component lands
  // above or below it. Halfway is the boundary, which is the behaviour every
  // list that reorders has trained people to expect.
  function overLine(e, i) {
    if (!dragRef.current) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setOverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
  }

  function overZone(e) {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragRef.current.type === "line" ? "move" : "copy";
  }

  function dropOnZone(e) {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();

    // Dropped on the summary or the empty state rather than between two rows:
    // no marker was showing, so the honest reading is "put it at the end".
    const at = overIndex == null ? lines.length : overIndex;
    if (d.type === "lib") addAt(d.item, at);
    else moveLine(d.key, at);
    endDrag();
  }

  const net = lines.reduce((t, l) => t + lineNet(l), 0);
  const overhead = (net * (Number(overheadPercent) || 0)) / 100;
  const profit = (net * (Number(profitPercent) || 0)) / 100;
  const total = net + overhead + profit;

  const matNet = lines.filter((l) => l.refKind === "material").reduce((t, l) => t + lineNet(l), 0);
  const labNet = lines.filter((l) => l.refKind === "labour").reduce((t, l) => t + lineNet(l), 0);

  const ready = description.trim() && unit.trim() && lines.length > 0 && net > 0;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const body = {
        sectionKey,
        description: description.trim(),
        unit: unit.trim(),
        overheadPercent: Number(overheadPercent) || 0,
        profitPercent: Number(profitPercent) || 0,
        // Each line carries its own computed total INCLUDING waste, so the
        // stored breakdown sums exactly to netCost and every line reconciles.
        // Sending quantity and price alone would leave the waste nowhere.
        breakdown: lines.map((l) => ({
          componentName: l.componentName,
          quantity: Number(l.quantity) || 0,
          unit: l.unit,
          unitPrice: Number(l.unitPrice) || 0,
          lineTotal: lineNet(l),
          refKind: l.refKind,
          refSn: l.refSn,
          refName: l.refName,
        })),
      };
      const r = await apiAuthed("/admin/rategen-v2/rates", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(r?.rate || r);
      say(`Built. ${description.trim()} is in the library at ${money(total)}.`);
      setDescription("");
      setUnit("");
      setLines([]);
    } catch (e) {
      say(e?.message || "The server refused that rate. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const items = lib ? (tab === "material" ? lib.materials : lib.labour) : [];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Build a rate</h1>
          <p className="adm-lede">
            The only place a new rate is created. Prices come from the master library and are shown
            rather than typed — if one is wrong it is wrong for everybody, and it gets corrected
            once in Rate Gen rather than quietly inside a single rate.
          </p>
        </div>
      </div>

      <div className="rb-head">
        <label>
          What the rate is for
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="150mm blockwall in cement and sand mortar (1:6)"
          />
        </label>
        <label>
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m2" />
        </label>
        <label>
          Section
          <select value={sectionKey} onChange={(e) => setSectionKey(e.target.value)}>
            {(lib?.sections || []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rb-split">
        {/* ── the library ─────────────────────────────────────────────── */}
        <section className="adm-panel">
          <div className="adm-panel-h">
            <h2>The library</h2>
            <span className="note">
              {lib ? `${lib.counts.allMaterials} materials · ${lib.counts.allLabour} labour` : "…"}
            </span>
          </div>
          <div className="adm-panel-b">
            <div className="adm-tabs" role="tablist">
              {[
                ["material", "Materials", lib?.counts.materials],
                ["labour", "Labour and plant", lib?.counts.labour],
              ].map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  className={`adm-tab${tab === k ? " on" : ""}`}
                  onClick={() => setTab(k)}
                >
                  <span>{label}</span>
                  {n == null ? null : <em className="adm-tab-n">{n}</em>}
                </button>
              ))}
            </div>

            <label className="adm-find adm-find-wide">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-search" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the library"
                aria-label="Search the component library"
              />
            </label>

            <div className="rb-lib">
              {!lib ? (
                <p className="adm-note">Reading the library…</p>
              ) : !items.length ? (
                <div className="adm-none">
                  <b>Nothing matches</b>
                  <span>Try part of a material name, or a category.</span>
                </div>
              ) : (
                items.map((it) => (
                  <button
                    key={`${it.kind}-${it.sn}`}
                    type="button"
                    className="rb-item"
                    // Still a button, still adds on click. Dragging is the
                    // faster way to say where a component goes; clicking is the
                    // one that works with a keyboard, and losing it to gain a
                    // gesture would be a poor trade.
                    draggable
                    onDragStart={(e) => startDragItem(e, it)}
                    onDragEnd={endDrag}
                    onClick={() => add(it)}
                  >
                    <span className="n">{it.name}</span>
                    <span className="c">{it.category}</span>
                    <span className="p">
                      {money(it.price)}
                      <i>/{it.unit || "?"}</i>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ── the build-up ────────────────────────────────────────────── */}
        <section className="adm-panel">
          <div className="adm-panel-h">
            <h2>The build-up</h2>
            <span className="note">
              {lines.length ? `${lines.length} line${lines.length === 1 ? "" : "s"}` : "nothing yet"}
            </span>
          </div>
          <div
            className={`adm-panel-b rb-zone${dragKind ? " is-live" : ""}`}
            onDragOver={overZone}
            onDrop={dropOnZone}
            // Guarded against the child transitions that also raise dragleave:
            // without the containment check the marker flickers out every time
            // the pointer crosses from one row to the next.
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setOverIndex(null);
            }}
          >
            {!lines.length ? (
              <div
                className="adm-none rb-empty"
                // The empty state is the largest target on the panel, so it
                // takes the drop itself rather than making someone aim at a
                // list that is not there yet.
                onDragOver={overZone}
              >
                <b>{dragKind === "lib" ? "Drop it here" : "Pick from the library"}</b>
                <span>
                  Every line is a real component at a real price. A rate with no build-up behind it
                  is a number nobody can check. Drag a component across, or click it.
                </span>
              </div>
            ) : (
              <div className="rb-lines">
                <div className="rb-lhd">
                  <span />
                  <span>Component</span>
                  <span>Qty per {unit || "unit"}</span>
                  <span>Waste %</span>
                  <span>Price</span>
                  <span>Line</span>
                  <span />
                </div>
                {lines.map((l, i) => (
                  <React.Fragment key={l.key}>
                    {overIndex === i ? <div className="rb-mark" /> : null}
                    <div
                      className={`rb-line${dragKind === "line" && gripKey === l.key ? " is-lift" : ""}`}
                      draggable={gripKey === l.key}
                      onDragStart={(e) => startDragLine(e, l.key)}
                      onDragEnd={endDrag}
                      onDragOver={(e) => overLine(e, i)}
                    >
                    <span
                      className="rb-grip"
                      // Arming the row on mousedown is what confines dragging to
                      // the grip: everywhere else on the row stays ordinary,
                      // selectable, editable text.
                      onMouseDown={() => setGripKey(l.key)}
                      onMouseUp={() => setGripKey(null)}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12">
                        <circle cx="6" cy="4" r="1.3" /><circle cx="10" cy="4" r="1.3" />
                        <circle cx="6" cy="8" r="1.3" /><circle cx="10" cy="8" r="1.3" />
                        <circle cx="6" cy="12" r="1.3" /><circle cx="10" cy="12" r="1.3" />
                      </svg>
                    </span>
                    <span className="n">
                      <b>{l.componentName}</b>
                      <em>{l.refKind}</em>
                    </span>
                    <span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={l.quantity}
                        onChange={(e) => patch(l.key, "quantity", e.target.value)}
                        aria-label={`Quantity of ${l.componentName}`}
                      />
                      <i>{l.unit}</i>
                    </span>
                    <span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={l.waste}
                        onChange={(e) => patch(l.key, "waste", e.target.value)}
                        aria-label={`Waste on ${l.componentName}`}
                      />
                    </span>
                    <span className="ro">{money(l.unitPrice)}</span>
                    <span className="ro">{money(lineNet(l))}</span>
                    <button
                      type="button"
                      className="adm-b"
                      onClick={() => drop(l.key)}
                      aria-label={`Remove ${l.componentName}`}
                    >
                      remove
                    </button>
                    </div>
                  </React.Fragment>
                ))}
                {/* The marker for "after the last row" has no row to hang off,
                    so it is rendered on its own rather than as a pseudo-element
                    that could never appear. */}
                {overIndex === lines.length ? <div className="rb-mark" /> : null}
              </div>
            )}

            <div className="rb-sum">
              <div>
                <span>Material</span>
                <b>{money(matNet)}</b>
              </div>
              <div>
                <span>Labour and plant</span>
                <b>{money(labNet)}</b>
              </div>
              <div>
                <span>Net</span>
                <b>{money(net)}</b>
              </div>
              <div>
                <span>
                  Overhead
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={overheadPercent}
                    onChange={(e) => setOverheadPercent(e.target.value)}
                    aria-label="Overhead percent"
                  />
                  %
                </span>
                <b>{money(overhead)}</b>
              </div>
              <div>
                <span>
                  Profit
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={profitPercent}
                    onChange={(e) => setProfitPercent(e.target.value)}
                    aria-label="Profit percent"
                  />
                  %
                </span>
                <b>{money(profit)}</b>
              </div>
              <div className="tot">
                <span>Rate</span>
                <b>
                  {money(total)}
                  <i>per {unit || "unit"}</i>
                </b>
              </div>
            </div>

            <div className="rb-acts">
              <button
                type="button"
                className="ds-btn btn-p"
                disabled={!ready || busy}
                onClick={save}
                title={ready ? undefined : "Name it, give it a unit, and add at least one line"}
              >
                {busy ? "Saving…" : "Add to the library"}
              </button>
            </div>

            {saved ? (
              <p className="adm-foot-note">
                Saved. It is in the published library now, and every RateGen install picks it up on
                its next sync. Editing it from here on happens in Rate Gen.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <p className="adm-foot-note">
        Prices shown are the {ZONES.find(([k]) => k === zone)?.[1]} figures. The same build-up
        priced in another zone is a different rate — the same blockwork is not the same money in
        Lagos and in Kano — so the zone is chosen before building, not after.
      </p>

      {toast}
    </>
  );
}
