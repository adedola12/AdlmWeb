// One rate, and what it is made of.
//
// This screen has no equivalent anywhere in the app. /rategen lists rates and
// lets you edit them; nothing has ever shown a rate broken into the materials,
// labour and plant underneath it, with the overhead and profit that turn a net
// cost into a rate. That breakdown is the product's whole argument — "Measure
// it. Price it. Defend it." — and defending a rate means being able to show it.
//
// The data was already there. RateGenRate stores `breakdown`, an array of
// components each carrying refKind (material / labour / plant), a quantity, a
// unit price and what it comes to, plus the date that price was taken. The
// sync route sends it. Nothing needed adding server-side.
//
// His markup: .wk-back / .wk-hd / .wk-panel / .wk-ph / .wk-bt with .wk-bhd,
// .wk-grp per group, .wk-bl per line, and .wk-sub / .wk-tot for the closing
// rows.
//
// EDITING (S18, RG-05). The percentages and quantities are now live, and
// "Save to my library" writes the result to the CUSTOMER's own copy of the
// rate (PUT /rategen-v2/library/user-rates/override/:id). It never touches the
// master rate: master material, labour and rate prices are published from Rate
// Gen desktop and the server refuses a master write from here. What is saved
// is the user's own override, which the desktop picks up on its next sync.
// Projects already priced keep the figure they were priced with — nothing on
// this screen can move money that has already been certified — and the copy on
// the page says exactly that rather than the prototype's "every project using
// this rate has moved with it".
//
// THE REMAINDER IS CARRIED, NEVER DROPPED (S18 review, finding 1)
//
// A master rate's stored net cost is frequently larger than the sum of its
// itemised lines: rounding, legacy rates imported without a full build-up,
// allowances nobody itemised. The screen has always shown that gap as "Not
// itemised". It is now part of the arithmetic as well, so editing a quantity
// rebuilds the net cost from the lines PLUS the remainder and the rate keeps
// its value. It used to be rebuilt from the lines alone, which quietly cut the
// customer's own copy by the remainder and made every bill priced from it
// afterwards cheaper than the library said. The footer also states the rate
// before and after, so nothing about the saved figure is a surprise.
//
// PERCENTAGES ARE SAVED AS TYPED (S18 review, findings 2 and 4)
//
// Overhead and profit used to be clamped to 60% here while the input still
// showed the typed figure, and the custom-rate builder did not clamp at all.
// The clamp is gone — see percentProblem() in rategen/rateMath.js, which both
// screens now share.

import React from "react";
import { Link, useParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useFeedback } from "./feedback/feedbackContext.js";
import { fetchAllRates } from "./rategen/fetchRates.js";
import {
  componentsOf,
  groupComponents,
  groupForKind,
  percentProblem,
  totalsFrom,
  unexplainedNet,
  toNum,
} from "./rategen/rateMath.js";

const DASH = "–"; // en dash: an empty value, never an em dash, never "N/A"

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const qty = (n) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 4 }).format(Number(n) || 0);

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

export default function DsWorkRate() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const fb = useFeedback();
  const [rates, setRates] = React.useState(null);
  const [ratesTruncated, setRatesTruncated] = React.useState(false);
  const [mine, setMine] = React.useState(null); // { overrides, customs, version }
  const [failed, setFailed] = React.useState(false);

  // The edit buffer. Empty means "as published" — an untouched screen writes
  // nothing and claims nothing.
  const [edit, setEdit] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return Promise.all([
      // Every page of the library, because the rate being opened may sit past
      // the first one. One page made a real rate read as "not in this library".
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
          version: d?.meta?.ratesVersion ?? 1,
          customRatesVersion: d?.meta?.customRatesVersion ?? 1,
        }))
        // A user with no library of their own is not an error.
        .catch(() => ({ overrides: [], customs: [], version: 1, customRatesVersion: 1 })),
    ]).then(([paged, own]) => {
      setRates(paged.items);
      setRatesTruncated(paged.truncated);
      setMine(own);
    });
  }, [accessToken]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    load().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, load]);

  // A custom rate is addressed as /work/rate/custom:<id> so it cannot collide
  // with a master rate's ObjectId.
  const customId = String(id || "").startsWith("custom:")
    ? String(id).slice("custom:".length)
    : null;

  // What is shown: the user's own copy of the rate when they have one, the
  // published rate otherwise. The two are never blended.
  const { rate, isOwn, isCustom, published } = React.useMemo(() => {
    if (!rates || !mine) return { rate: null, isOwn: false, isCustom: false, published: null };
    if (customId) {
      const c = mine.customs.find((x) => String(x.customRateId || x.id) === customId) || null;
      return { rate: c, isOwn: true, isCustom: true, published: null };
    }
    const master = rates.find((r) => String(r.id) === String(id)) || null;
    const ov = mine.overrides.find(
      (o) => String(o.rateId || o.id) === String(id),
    );
    return {
      rate: ov || master,
      isOwn: Boolean(ov),
      isCustom: false,
      published: master,
    };
  }, [rates, mine, id, customId]);

  // The lines actually on screen: the edit buffer if the user has touched
  // anything, otherwise the rate as it stands.
  const baseComponents = React.useMemo(() => componentsOf(rate || {}), [rate]);
  const components = edit ? edit.components : baseComponents;
  const overheadPercent = edit ? edit.overheadPercent : toNum(rate?.overheadPercent);
  const profitPercent = edit ? edit.profitPercent : toNum(rate?.profitPercent);

  // The part of the stored net cost that no line explains. Read once off the
  // rate as it was published, and then carried through every edit, so the
  // customer's own copy is worth what the library said it was worth.
  const baseCarried = React.useMemo(
    () => unexplainedNet(toNum(rate?.netCost), baseComponents),
    [rate, baseComponents],
  );

  const freshEdit = React.useCallback(
    () => ({
      components: baseComponents.map((c) => ({ ...c })),
      overheadPercent: toNum(rate?.overheadPercent),
      profitPercent: toNum(rate?.profitPercent),
      carried: baseCarried,
    }),
    [baseComponents, rate, baseCarried],
  );

  const startEdit = React.useCallback(() => {
    setEdit((cur) => cur || freshEdit());
  }, [freshEdit]);

  // What the user typed is kept exactly as typed, and only READ as a number.
  // Coercing on every keystroke makes "1.5" impossible to type: the "." is
  // stripped the moment it is entered and the caret never gets to the "5".
  const setQuantity = (index, value) => {
    startEdit();
    setEdit((cur) => {
      const base = cur || freshEdit();
      const next = base.components.map((c, i) =>
        i === index
          ? { ...c, quantity: value, amount: Math.max(0, toNum(value)) * toNum(c.unitPrice) }
          : c,
      );
      return { ...base, components: next };
    });
  };

  const setPercent = (which, value) => {
    startEdit();
    setEdit((cur) => ({ ...(cur || freshEdit()), [which]: value }));
  };

  // Indexes are stable because `components` and `grouped` come from the same
  // array in the same order.
  const grouped = React.useMemo(() => {
    const withIndex = components.map((c, i) => ({ ...c, index: i }));
    return groupComponents(withIndex);
  }, [components]);

  // Read as typed, and saved as read. Nothing is clamped: a figure that cannot
  // be a percentage is refused out loud at save, and a figure that can is the
  // one that goes to the server.
  const ohPc = toNum(overheadPercent);
  const prPc = toNum(profitPercent);
  const carried = edit ? edit.carried : baseCarried;

  const totals = React.useMemo(
    () => totalsFrom(components, ohPc, prPc, carried),
    [components, ohPc, prPc, carried],
  );

  // An untouched rate shows what the server stored, so the page and the
  // library agree to the kobo. Only once the user edits does the screen start
  // showing its own arithmetic.
  const net = edit ? totals.netCost : toNum(rate?.netCost);
  const overhead = edit ? totals.overheadValue : toNum(rate?.overheadValue);
  const profit = edit ? totals.profitValue : toNum(rate?.profitValue);
  const total = edit ? totals.totalCost : toNum(rate?.totalCost);

  const plantGroup = grouped.find((g) => g.id === "plant");

  async function save() {
    if (!edit || saving || !rate) return;

    // The figure on screen is the figure that gets stored, so a figure that
    // cannot be stored is refused here rather than quietly turned into another
    // one. Same rule, same words, in the custom-rate builder.
    const problem =
      percentProblem("Overhead", overheadPercent) ||
      percentProblem("Profit", profitPercent);
    if (problem) {
      fb.toast({
        tone: "error",
        title: problem,
        msg: "Nothing was saved. Put a percentage the rate can carry in the box and save again.",
      });
      return;
    }

    setSaving(true);
    try {
      const breakdown = edit.components.map((c) => ({
        componentName: c.name,
        quantity: Math.max(0, toNum(c.quantity)),
        unit: c.unit,
        unitPrice: c.unitPrice,
        lineTotal: c.amount,
        refKind: c.kind || "",
        refSn: c.refSn ?? null,
        refName: c.refName || c.name,
        priceAsOf: c.priceAsOf ?? null,
      }));

      if (isCustom) {
        // A custom rate carries materials[] and labour[] as well as the
        // breakdown, because that pair is what the desktop and the plugins
        // read for its composition. They are rebuilt from the edited lines
        // rather than sent empty, which would quietly strip a saved rate of
        // its composition everywhere outside this screen.
        // The category a line was filed under lives on materials[]/labour[],
        // not on the breakdown this screen reads, so re-saving from here used
        // to blank it on every line. Carried across by the same name-and-unit
        // key the catalogue is identified by.
        // (priceAsOf is not carried because it is not stored: neither
        // BreakdownLineSchema nor UserCustomRateLineSchema in
        // server/models/RateGenLibrary.js has the field, so a user rate has
        // never held one.)
        const filedUnder = new Map();
        for (const l of [...(rate.materials || []), ...(rate.labour || [])]) {
          const k = `${String(l.description || "").trim().toLowerCase()}|${String(
            l.unit || "",
          )
            .trim()
            .toLowerCase()}`;
          if (l.category) filedUnder.set(k, l.category);
        }

        const asLine = (c) => ({
          description: c.name,
          quantity: Math.max(0, toNum(c.quantity)),
          unit: c.unit || "",
          unitPrice: c.unitPrice,
          totalCost: c.amount,
          category:
            filedUnder.get(
              `${String(c.name || "").trim().toLowerCase()}|${String(c.unit || "")
                .trim()
                .toLowerCase()}`,
            ) || "",
          refSn: c.refSn ?? null,
          refName: c.refName || c.name,
        });
        await apiAuthed(`/rategen-v2/library/custom-rates/${encodeURIComponent(customId)}`, {
          method: "PUT",
          token: accessToken,
          body: {
            customRateId: customId,
            sectionKey: rate.sectionKey || "",
            sectionLabel: rate.sectionLabel || "",
            title: rate.title || rate.description || "",
            description: rate.description || "",
            unit: rate.unit || "",
            materials: edit.components
              .filter((c) => groupForKind(c.kind) === "material")
              .map((c) => ({ ...asLine(c), rateType: "material" })),
            labour: edit.components
              .filter((c) => groupForKind(c.kind) === "labour")
              .map((c) => ({ ...asLine(c), rateType: "labour" })),
            breakdown,
            customRatesBaseVersion: mine?.customRatesVersion ?? 1,
            netCost: totals.netCost,
            overheadPercent: ohPc,
            profitPercent: prPc,
          },
        });
      } else {
        await apiAuthed(
          `/rategen-v2/library/user-rates/override/${encodeURIComponent(String(id))}`,
          {
            method: "PUT",
            token: accessToken,
            body: {
              rateId: String(id),
              sectionKey: rate.sectionKey || "",
              sectionLabel: rate.sectionLabel || "",
              itemNo: rate.itemNo ?? null,
              code: rate.code || "",
              description: rate.description || "",
              unit: rate.unit || "",
              netCost: totals.netCost,
              overheadPercent: ohPc,
              profitPercent: prPc,
              breakdown,
              sourceUpdatedAt: published?.updatedAt || rate.updatedAt || null,
              ratesBaseVersion: mine?.version ?? 1,
            },
          },
        );
      }

      setEdit(null);
      await load();
      fb.toast({
        title: "Saved to your library",
        msg:
          "This is your own copy of the rate. Rate Gen, QUIV and HERON pick it up on their next sync. Projects already priced keep the figure they were priced with.",
        ms: 5200,
      });
    } catch (e) {
      const conflict = String(e?.message || "").toLowerCase().includes("conflict");
      fb.toast({
        tone: "error",
        title: conflict ? "Someone else changed your library" : "That did not save",
        msg: conflict
          ? "Refresh the page to pick up the newer version, then make the change again."
          : "Nothing was written. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetToPublished() {
    if (!isOwn || isCustom || saving) return;
    const answer = await fb.card({
      tone: "warning",
      title: "Go back to the published rate",
      msg:
        "Your own copy of this rate is removed and the published figure comes back. Projects already priced are not touched.",
      secondary: "Keep mine",
      primary: { label: "Remove my copy", danger: true },
    });
    if (answer !== "primary") return;
    setSaving(true);
    try {
      await apiAuthed(
        `/rategen-v2/library/user-rates/override/${encodeURIComponent(String(id))}`,
        { method: "DELETE", token: accessToken, params: { ratesBaseVersion: mine?.version ?? 1 } },
      );
      setEdit(null);
      await load();
      fb.toast({ title: "Back to the published rate" });
    } catch {
      fb.toast({ tone: "error", title: "That did not reset", msg: "Nothing was changed." });
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">That rate could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!rates || !mine) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading the rate…</p>
      </div>
    );
  }
  if (!rate) {
    return (
      <div className="dsh-in">
        <p className="wk-back">
          <Link to="/work/library">← RateGen</Link>
        </p>
        <p className="ds-sub">
          {ratesTruncated
            ? "That rate was not in the part of the library this screen could load, and the library is larger than it holds. Open Rate Gen to reach it."
            : "That rate is not in this library. It may have been removed, or it belongs to another account."}
        </p>
      </div>
    );
  }

  // Shown whether or not the screen is being edited, because it is part of the
  // net cost in both states.
  const unexplained = carried;
  const storedTotal = toNum(rate.totalCost);

  // What the PUBLISHED rate is made of, used only to say why a customer's own
  // copy with no build-up of its own is showing no lines.
  const publishedComponents = componentsOf(published || {});
  const publishedNet = toNum(published?.netCost);

  return (
    <div className="dsh-in">
      <p className="wk-back">
        <Link to="/work/library">← RateGen</Link>
      </p>

      <div className="wk-head">
        <div>
          <h1>{rate.description || rate.title || rate.itemNo || "Rate"}</h1>
          <p className="wk-ref">
            {[
              rate.itemNo,
              rate.sectionLabel,
              rate.unit ? `per ${rate.unit}` : null,
              isCustom ? "your own rate" : isOwn ? "your own copy" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="wk-acts">
          {isOwn && !isCustom ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={resetToPublished}
              disabled={saving}
            >
              Reset to published
            </button>
          ) : null}
        </div>
      </div>

      <div className="wk-two">
        <div>
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>The build-up</h2>
              <span className="wk-locnote">
                {rate.zone || rate.state
                  ? `Priced for ${rate.zone || rate.state}`
                  : "Priced from the master library"}
              </span>
            </div>

            {grouped.length ? (
              <div className="wk-bt">
                <div className="wk-bhd">
                  <span>Component</span>
                  <span>Quantity</span>
                  <span>Unit price</span>
                  <span>Amount</span>
                </div>

                {grouped.map((g) => (
                  <React.Fragment key={g.id}>
                    <div className="wk-grp">{g.label}</div>
                    {g.items.map((c) => (
                      <div className="wk-bl" key={`${g.id}-${c.index}`}>
                        <span className="nm">
                          {c.name || "Component"}
                          {c.priceAsOf ? <em>priced {longDate(c.priceAsOf)}</em> : null}
                        </span>
                        <span className="qt">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={c.quantity}
                            onChange={(e) => setQuantity(c.index, e.target.value)}
                            aria-label={`Quantity of ${c.name || "component"}`}
                          />
                          <i>{c.unit || DASH}</i>
                        </span>
                        <span className="pr">{money(c.unitPrice)}</span>
                        <span className="am">{money(c.amount)}</span>
                      </div>
                    ))}
                  </React.Fragment>
                ))}

                {unexplained !== 0 && (
                  <div className="wk-bl">
                    <span className="nm">
                      Not itemised
                      <em>
                        in the net cost with no component behind it — your copy keeps it
                      </em>
                    </span>
                    <span className="qt" />
                    <span className="pr" />
                    <span className="am">{money(unexplained)}</span>
                  </div>
                )}

                <div className="wk-bl wk-sub">
                  <span className="nm">Net cost</span>
                  <span className="qt" />
                  <span className="pr" />
                  <span className="am">{money(net)}</span>
                </div>

                <div className="wk-bl wk-calc">
                  <span className="nm">
                    Overhead
                    <em>this rate</em>
                  </span>
                  <span className="qt">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={overheadPercent}
                      onChange={(e) => setPercent("overheadPercent", e.target.value)}
                      aria-label="Overhead percentage"
                    />
                    <i>%</i>
                  </span>
                  <span className="pr">on {money(net)}</span>
                  <span className="am">{money(overhead)}</span>
                </div>

                <div className="wk-bl wk-calc">
                  <span className="nm">
                    Profit
                    <em>this rate</em>
                  </span>
                  <span className="qt">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={profitPercent}
                      onChange={(e) => setPercent("profitPercent", e.target.value)}
                      aria-label="Profit percentage"
                    />
                    <i>%</i>
                  </span>
                  <span className="pr">on {money(net)}</span>
                  <span className="am">{money(profit)}</span>
                </div>

                <div className="wk-bl wk-tot">
                  <span className="nm">Rate</span>
                  <span className="qt" />
                  <span className="pr">per {rate.unit || "unit"}</span>
                  <span className="am">{money(total)}</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px 20px" }}>
                <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
                  This rate has no components stored against it, so there is nothing to break
                  down. It carries {money(total)} per {rate.unit || "unit"} as a flat figure.
                </p>
                {/* The published rate's lines are the published rate's. They add
                    up to ITS net cost, so showing them here would read as an
                    itemisation of a figure they do not explain. Said instead. */}
                {isOwn && !isCustom && publishedComponents.length ? (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-3)" }}>
                    The published rate is built up from {publishedComponents.length}{" "}
                    component{publishedComponents.length === 1 ? "" : "s"} adding to{" "}
                    {money(publishedNet)}. Those lines belong to the published rate, not to
                    your copy, so they are not listed against your figure. Reset to published
                    to go back to them.
                  </p>
                ) : null}
              </div>
            )}

            {grouped.length ? (
              <div className="wk-pf">
                {edit ? (
                  <>
                    <span className="wk-dirty">
                      {total === storedTotal
                        ? "Edited — not saved"
                        : `Edited — not saved · ${money(storedTotal)} → ${money(total)} per ${
                            rate.unit || "unit"
                          }`}
                    </span>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      onClick={() => setEdit(null)}
                      disabled={saving}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save to my library"}
                    </button>
                  </>
                ) : (
                  <span className="wk-clean">
                    Every figure above is live. Change one and the rate recalculates, then save
                    it as your own copy.
                  </span>
                )}
              </div>
            ) : null}
          </section>
        </div>

        <div>
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>What this rate is</h2>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div className="dsh-kv">
                <div>
                  <span>Item number</span>
                  <b>{rate.itemNo || DASH}</b>
                </div>
                <div>
                  <span>Section</span>
                  <b>{rate.sectionLabel || DASH}</b>
                </div>
                <div>
                  <span>Unit</span>
                  <b>{rate.unit || DASH}</b>
                </div>
                <div>
                  <span>Priced for</span>
                  <b>{rate.zone || rate.state || "Master library"}</b>
                </div>
                <div>
                  <span>Components</span>
                  <b>{components.length || DASH}</b>
                </div>
                {plantGroup ? (
                  <div>
                    <span>Plant</span>
                    <b>{money(plantGroup.total)}</b>
                  </div>
                ) : null}
                {ohPc ? (
                  <div>
                    <span>Overhead · {qty(ohPc)}%</span>
                    <b>{money(overhead)}</b>
                  </div>
                ) : null}
                {prPc ? (
                  <div>
                    <span>Profit · {qty(prPc)}%</span>
                    <b>{money(profit)}</b>
                  </div>
                ) : null}
                <div>
                  <span>Last changed</span>
                  <b>{longDate(rate.updatedAt) || DASH}</b>
                </div>
              </div>
            </div>
          </section>

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>Changing it</h2>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.65,
                }}
              >
                What you save here is your own copy of the rate, held against this account. The
                published rate is not touched: master material, labour and rate prices are
                corrected in Rate Gen and published from there. Rate Gen, QUIV and HERON pick
                your copy up on their next sync, and projects already priced keep the figure
                they were priced with.
              </p>
              <Link className="ds-btn btn-o ds-btn-sm" to="/rategen" style={{ marginTop: 16 }}>
                Open RateGen
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
