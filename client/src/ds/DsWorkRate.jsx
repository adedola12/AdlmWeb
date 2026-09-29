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
import { fetchAllRates } from "./rategen/fetchRates.js";
import {
  componentsOf,
  groupComponents,
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
  const [rates, setRates] = React.useState(null);
  const [ratesTruncated, setRatesTruncated] = React.useState(false);
  const [mine, setMine] = React.useState(null); // { overrides, customs, version }
  const [failed, setFailed] = React.useState(false);


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

  // The rate as published. There is no edit buffer any more: this screen reads,
  // and Rate Gen is where a build-up is changed.
  const baseComponents = React.useMemo(() => componentsOf(rate || {}), [rate]);
  const components = baseComponents;
  const overheadPercent = toNum(rate?.overheadPercent);
  const profitPercent = toNum(rate?.profitPercent);

  // The part of the stored net cost that no line explains. Read once off the
  // rate as it was published, and then carried through every edit, so the
  // customer's own copy is worth what the library said it was worth.
  const baseCarried = React.useMemo(
    () => unexplainedNet(toNum(rate?.netCost), baseComponents),
    [rate, baseComponents],
  );



  // What the user typed is kept exactly as typed, and only READ as a number.
  // Coercing on every keystroke makes "1.5" impossible to type: the "." is
  // stripped the moment it is entered and the caret never gets to the "5".


  // Indexes are stable because `components` and `grouped` come from the same
  // array in the same order.
  const grouped = React.useMemo(() => {
    const withIndex = components.map((c, i) => ({ ...c, index: i }));
    return groupComponents(withIndex);
  }, [components]);

  // Read as typed, and saved as read. Nothing is clamped: a figure that cannot
  const ohPc = toNum(overheadPercent);
  const prPc = toNum(profitPercent);
  const carried = baseCarried;

  // What the server stored, so the page and the library agree to the kobo.
  // Nothing is recomputed here: the build-up rows carry their own amounts, and
  // with the editor gone there is no second arithmetic to reconcile.
  const net = toNum(rate?.netCost);
  const overhead = toNum(rate?.overheadValue);
  const profit = toNum(rate?.profitValue);
  const total = toNum(rate?.totalCost);

  const plantGroup = grouped.find((g) => g.id === "plant");



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
                          <b>{c.quantity}</b>
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
                    <b>{overheadPercent}</b>
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
                    <b>{profitPercent}</b>
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
                    your copy, so they are not listed against your figure. Rate Gen is where a
                    copy is put back to the published build-up.
                  </p>
                ) : null}
              </div>
            )}

            {grouped.length ? (
              <div className="wk-pf">
                <span className="wk-clean">
                  Every figure above is the rate as published. Quantities, overhead and profit
                  are changed in Rate Gen and published from there — this page reads them.
                </span>
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
                This page reads the rate; it does not change it. Quantities, overhead, profit
                and the master material and labour prices are all edited in Rate Gen and
                published from there. QUIV and HERON pick the change up on their next sync,
                and projects already priced keep the figure they were priced with.
              </p>
              {/* Hands the rate to the desktop application rather than growing a
                  second build-up editor in a browser — which is the reasoning in
                  RateGen's own Helpers/DeepLink.cs, and the shape it parses:
                  adlm-rategen://rate/<id>?name=<description>&section=<key>.
                  Its installer registers the scheme (Installer.iss).

                  A real anchor, and one that stays mounted: a click on an <a>
                  that leaves the DOM mid-navigation is cancelled by the browser,
                  so the shell never sees it. That was proved once by pointing the
                  scheme at a logging wrapper (see DsAdminCatalogue) and it is why
                  this is not a button with a handler that re-renders.

                  Whether the application actually opened is not knowable here —
                  no browser reports it — so the page does not claim it did. */}
              <a
                className="ds-btn btn-o ds-btn-sm"
                style={{ marginTop: 16 }}
                href={`adlm-rategen://rate/${encodeURIComponent(id)}?name=${encodeURIComponent(
                  rate.description || rate.title || "",
                )}&section=${encodeURIComponent(rate.sectionKey || "")}`}
              >
                Open in Rate Gen
              </a>
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
                Rate Gen has to be installed on this machine. Nothing happens here if it is
                not — the Installer Hub is where to get it.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
