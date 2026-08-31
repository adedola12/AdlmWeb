// Commerce — five registers that are the same screen with different columns.
//
// His observation and his structure: "Subscriptions, Entitlements, Quotations,
// Invoices and Coupons all answer the same shape of question: show me these
// objects, let me narrow them, and let me open one. Writing that five times
// would guarantee five slightly different tables, so the page says which one
// it is with data-screen and this decides the columns."
//
// Kept exactly. One component, a `screen` prop where his has a data attribute,
// and five column sets. The table itself is the shared kit.
//
// SUBSCRIPTIONS IS NOT A SECOND COLLECTION
//
// His model has subscriptions and entitlements as separate objects. Ours has
// one: an entitlement carrying a product, seats, a status and an expiry. What
// would make it a subscription is `autoRenew` — the intent to charge again —
// and no entitlement in this database has it set and no account has a saved
// card. So that register is the renewal book, it is empty, and it says so
// rather than relabelling 163 licences as subscriptions.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { toneFor, useAdmToast } from "./adminKit.jsx";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
  archicad: "ArchiCAD",
};
const productName = (k) => PRODUCT[k] || k || "—";

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const Account = ({ r }) => <AdmTwo top={r.who} under={r.org || r.email} />;

/**
 * The five screens. Each names its endpoint, its filters, its columns and the
 * words for an empty list — everything that differs between them, and nothing
 * that does not.
 */
const SCREENS = {
  subscriptions: {
    title: "Subscriptions",
    lede:
      "Licences set to charge again. A subscription here is an entitlement with auto-renew on — " +
      "the intent to take another payment — which is a different thing from a licence that simply " +
      "has time left on it.",
    path: "/admin/commerce/subscriptions",
    empty: [
      "Nothing renews itself",
      "No entitlement has auto-renew switched on and no account has a saved card, so nothing will be charged again automatically. Licences still run to their expiry; they just stop there.",
    ],
    cols: () => [
      { h: "Account", w: "26%", cell: (r) => <Account r={r} /> },
      { h: "Product", cell: (r) => productName(r.product) },
      { h: "Seats", num: true, cell: (r) => r.seats },
      { h: "Runs to", cell: (r) => when(r.expiresAt) || <AdmDim>no expiry</AdmDim> },
      { h: "State", cell: (r) => <AdmChip tone={toneFor(r.state)}>{r.state}</AdmChip> },
    ],
  },

  entitlements: {
    title: "Entitlements",
    lede:
      "Every licence granted, to whom, for how many seats and until when. This is what the desktop " +
      "products check on sign-in, so a row here is the difference between somebody being able to " +
      "work and not.",
    path: "/admin/commerce/entitlements",
    filters: (c) => [
      ["all", "Everything", c.all],
      ["active", "Live", c.active],
      ["expiring", "Expiring", c.expiring],
      ["expired", "Lapsed", c.expired],
    ],
    empty: ["No entitlements", "Nobody holds a licence, which should not be possible."],
    cols: (A) => [
      { h: "Account", w: "26%", cell: (r) => <Account r={r} /> },
      {
        h: "Feature",
        cell: (r) => (
          <AdmTwo
            top={productName(r.product)}
            under={r.licenseType === "organization" ? "organisation licence" : "personal"}
          />
        ),
      },
      { h: "Seats", num: true, cell: (r) => r.seats },
      {
        h: "Machines",
        num: true,
        cell: (r) => (r.devices ? r.devices : <AdmDim>none bound</AdmDim>),
      },
      { h: "Runs to", cell: (r) => when(r.expiresAt) || <AdmDim>no expiry</AdmDim> },
      { h: "State", cell: (r) => <AdmChip tone={toneFor(r.state)}>{r.state}</AdmChip> },
      {
        h: "",
        cell: (r) => {
          const id = `${r.email}|${r.product}`;
          // Revoking takes the software off somebody mid-licence, so the row
          // says whose and what before it will do it. A browser confirm()
          // cannot name either.
          if (A.confirming === id) {
            return (
              <span className="adm-log">
                <button
                  type="button"
                  className="adm-b pri"
                  disabled={A.busy}
                  onClick={() =>
                    A.act("/admin/users/entitlement/delete", {
                      body: { email: r.email, productKey: r.product },
                      done: `${productName(r.product)} revoked from ${r.who}. They are signed out of it on their next check.`,
                    })
                  }
                >
                  revoke {productName(r.product)} from {r.who}
                </button>
                <button type="button" className="adm-b" onClick={() => A.setConfirming(null)}>
                  cancel
                </button>
              </span>
            );
          }
          return (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => A.setConfirming(id)}
            >
              Revoke
            </button>
          );
        },
      },
    ],
  },

  quotations: {
    title: "Quotations",
    lede:
      "What was priced for somebody and never turned into an order. A quotation sitting here is a " +
      "conversation that stopped, which is worth knowing before the price goes stale.",
    path: "/admin/commerce/quotations",
    empty: ["No quotations", "Nothing has been priced up for anybody yet."],
    cols: () => [
      { h: "Reference", cell: (q) => <AdmTwo top={q.ref} under={`built ${when(q.built)}`} /> },
      { h: "Client", w: "24%", cell: (q) => <Account r={q} /> },
      {
        h: "What was priced",
        cell: (q) =>
          q.lines ? (
            <AdmTwo top={`${q.lines} line${q.lines === 1 ? "" : "s"}`} under={q.what} />
          ) : (
            <AdmDim>nothing itemised</AdmDim>
          ),
      },
      { h: "Value", num: true, cell: (q) => money(q.gross, q.currency) },
      { h: "State", cell: (q) => <AdmChip tone={toneFor(q.status)}>{q.status}</AdmChip> },
    ],
  },

  invoices: {
    title: "Invoices",
    lede:
      "What has been billed and what is still owed. An invoice past its due date and not paid is " +
      "the only figure on this register anybody chases, so it is worked out rather than left to be " +
      "read off two columns.",
    path: "/admin/commerce/invoices",
    empty: ["No invoices", "Nothing has been billed yet."],
    // His columns are Reference, Client, Net, VAT, Gross. A discount column is
    // added because without it the row does not add up: the first invoice in
    // this database reads 3,170,000 net plus 213,975 VAT and a gross of
    // 3,066,975 — LESS than the net — because 317,000 was taken off in
    // between. Three numbers that visibly contradict each other cost more
    // trust than a fourth column costs space.
    cols: (A) => [
      { h: "Reference", cell: (i) => <AdmTwo top={i.ref} under={`issued ${when(i.issued)}`} /> },
      { h: "Client", w: "22%", cell: (i) => <Account r={i} /> },
      { h: "Net", num: true, cell: (i) => money(i.net, i.currency) },
      {
        h: "Less",
        num: true,
        cell: (i) => (i.discount ? `−${money(i.discount, i.currency)}` : <AdmDim>—</AdmDim>),
      },
      {
        h: "VAT",
        num: true,
        cell: (i) => (i.tax ? money(i.tax, i.currency) : <AdmDim>none</AdmDim>),
      },
      { h: "Gross", num: true, cell: (i) => money(i.gross, i.currency) },
      {
        h: "State",
        cell: (i) => (
          <>
            <AdmChip tone={toneFor(i.status)}>{i.status}</AdmChip>
            {i.overdueDays ? <AdmChip tone="bad">{i.overdueDays}d overdue</AdmChip> : null}
          </>
        ),
      },
      {
        h: "",
        cell: (i) =>
          i.status === "paid" ? (
            <AdmDim>settled</AdmDim>
          ) : (
            // Sending emails the client their invoice, so it is the one thing
            // on this register worth a click. Editing the lines stays in the
            // composer, which already does it properly.
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={A.busy}
              onClick={() =>
                A.act(`/admin/invoices/${i.id}/send`, {
                  done: `${i.ref} emailed to ${i.email || "the client"}.`,
                })
              }
            >
              {i.status === "sent" ? "Send again" : "Send"}
            </button>
          ),
      },
    ],
    // A new invoice is a form with line items, VAT and dates. One already
    // exists and works; the register links to it rather than growing a second.
    newHref: "/admin/invoices/compose",
    newLabel: "New invoice",
  },

  coupons: {
    title: "Coupons",
    lede:
      "Discount codes, and whether each one still works. A code can be unusable in four different " +
      "ways — switched off, not started, out of uses, or past its date — and they are not the same " +
      "problem, so the state says which.",
    path: "/admin/commerce/coupons",
    filters: (c) => [
      ["all", "Everything", c.all],
      ["active", "Working", c.active],
      ["disabled", "Switched off", c.disabled],
      ["expired", "Past its date", c.expired],
      ["spent", "Out of uses", c.spent],
    ],
    local: true,
    empty: ["No coupons", "No discount code has been created."],
    cols: (A) => [
      { h: "Code", cell: (c) => <AdmTwo top={c.code} under={c.note} /> },
      {
        h: "Takes off",
        cell: (c) =>
          c.kind === "percent" ? `${c.value}%` : money(c.value, c.currency),
      },
      {
        h: "Used",
        num: true,
        cell: (c) => (c.max ? `${c.used} of ${c.max}` : `${c.used}`),
      },
      {
        h: "Runs",
        cell: (c) =>
          c.endsAt ? (
            <AdmTwo top={`to ${when(c.endsAt)}`} under={c.startsAt ? `from ${when(c.startsAt)}` : ""} />
          ) : (
            <AdmDim>no end date</AdmDim>
          ),
      },
      { h: "State", cell: (c) => <AdmChip tone={toneFor(c.state)}>{c.state}</AdmChip> },
      {
        h: "",
        cell: (c) => {
          // Switching a code off is undone by the same click, so it does not
          // ask. There is no delete endpoint and none is invented here: a
          // spent coupon is evidence of what a customer was charged, and the
          // orders that used it still point at it.
          const off = c.state === "disabled";
          return (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={A.busy}
              onClick={() =>
                A.act(`/admin/coupons/${c.id}/${off ? "enable" : "disable"}`, {
                  done: `${c.code} switched ${off ? "on" : "off"}.`,
                })
              }
            >
              {off ? "Switch on" : "Switch off"}
            </button>
          );
        },
      },
    ],
  },
};

export default function DsAdminCommerce({ screen }) {
  const S = SCREENS[screen];
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("all");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [confirming, setConfirming] = React.useState(null);
  const [say, toast] = useAdmToast();

  React.useEffect(() => {
    if (!accessToken || !S) return undefined;
    let alive = true;
    setD(null);
    // A screen that filters in the browser asks once; one that filters on the
    // server asks again per view. Coupons are ten rows and never worth a
    // round trip; entitlements are 163 and the server already knows how to
    // narrow them.
    apiAuthed(S.path, { token: accessToken, params: S.local ? {} : { view } })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, S, view, reload]);

  /**
   * One place every write on these registers goes through.
   *
   * Revoking an entitlement takes somebody's software away mid-licence, so it
   * asks first — and asks on the row rather than in a browser confirm(), which
   * gives no room to say WHAT is about to happen to WHOM. Switching a coupon
   * on or off is reversible with the same click and does not.
   */
  async function act(path, { method = "POST", body, done, refresh = true } = {}) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(path, {
        token: accessToken,
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      setConfirming(null);
      if (refresh) setReload((n) => n + 1);
      say(done || "Done.");
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!S) return <p className="adm-note">No such register.</p>;
  if (failed) {
    return <p className="adm-note">{S.title} could not be loaded just now. Please refresh.</p>;
  }

  const counts = d?.counts || {};
  const all = d?.items || [];
  // Passed into the column definitions so a cell can act without every screen
  // threading five props through itself.
  const A = { act, busy, confirming, setConfirming };
  const items = S.local && view !== "all" ? all.filter((r) => r.state === view) : all;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">{S.title}</h1>
          <p className="adm-lede">{S.lede}</p>
        </div>
        {S.newHref ? (
          <div className="adm-acts">
            <Link className="ds-btn btn-p ds-btn-sm" to={S.newHref}>
              {S.newLabel}
            </Link>
          </div>
        ) : null}
      </div>

      {/* The money on the Subscriptions screen.
          Two figures that answer different questions and must not be added:
          the run rate is what today's prices say it would cost to renew every
          live licence for a year, and what was taken is what customers have
          actually been charged, coupons included. Nothing links a licence to
          the order that bought it, so one cannot be derived from the other and
          the screen says which is which. */}
      {screen === "subscriptions" && d?.value ? (
        <div className="adm-kpis">
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-billing" />
              </svg>
              <span>On the books, a year</span>
            </span>
            <b>{money(d.value.runRate)}</b>
            <span className="sub">
              {d.value.liveLicences} live licence{d.value.liveLicences === 1 ? "" : "s"} at
              today&rsquo;s prices
              {d.value.runRateUnpriced
                ? ` · ${d.value.runRateUnpriced} could not be priced`
                : ""}
            </span>
          </div>

          <div className={`adm-kpi${d.value.atRisk ? " warn" : ""}`}>
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-alert" />
              </svg>
              <span>Lapsing within a month</span>
            </span>
            <b>{money(d.value.atRisk)}</b>
            <span className="sub">
              {d.value.atRiskLicences} licence{d.value.atRiskLicences === 1 ? "" : "s"} — this
              stops unless somebody rings
            </span>
          </div>

          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-card" />
              </svg>
              <span>Taken so far</span>
            </span>
            <b>{money(d.value.taken)}</b>
            <span className="sub">
              across {d.value.paidOrders} approved order
              {d.value.paidOrders === 1 ? "" : "s"} — history, not a forecast
            </span>
          </div>

          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#ai-tag" />
              </svg>
              <span>Given away on coupons</span>
            </span>
            <b>{money(d.value.discountGiven)}</b>
            <span className="sub">
              on {d.value.couponOrders} order{d.value.couponOrders === 1 ? "" : "s"} — already
              deducted from what was taken
            </span>
          </div>
        </div>
      ) : null}

      {screen === "subscriptions" && d?.value?.byProduct?.length ? (
        <section className="adm-panel">
          <div className="adm-panel-h">
            <h2>Where the book sits</h2>
            <span className="note">A year at today&rsquo;s prices, by product</span>
          </div>
          <div className="adm-panel-b">
            <div className="adm-bars">
              {d.value.byProduct.map((r) => (
                <div className="adm-bar-r" key={r.k}>
                  <span className="adm-bar-l">{productName(r.k)}</span>
                  <span className="adm-bar-t">
                    <span
                      className="adm-bar-f"
                      style={{
                        width: `${Math.max(1.5, (r.v / d.value.byProduct[0].v) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="adm-bar-v">{money(r.v)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {S.filters ? (
        <AdmFilters current={view} onPick={setView} options={S.filters(counts)} />
      ) : null}

      {!d ? (
        <p className="adm-note">Reading the register…</p>
      ) : (
        <>
          <AdmTable
            cols={S.cols(A)}
            rows={items}
            rowKey={(r, i) => r.id || `${r.accountId}-${r.product}-${i}`}
            empty={S.empty}
          />

          {/* The renewal book being empty is not the whole story, so the
              screen says what would renew if anybody had it switched on. */}
          {screen === "subscriptions" && d.lapsingSoon?.length ? (
            <>
              <div className="adm-pagehead" style={{ marginTop: 28 }}>
                <div>
                  <h2 className="adm-h" style={{ fontSize: 20 }}>
                    Running out within a month
                  </h2>
                  <p className="adm-lede">
                    Not subscriptions — these stop rather than renew. {d.counts.lapsingSoon} licence
                    {d.counts.lapsingSoon === 1 ? "" : "s"} will simply end unless somebody rings.
                  </p>
                </div>
              </div>
              <AdmTable
                cols={SCREENS.entitlements.cols(A)}
                rows={d.lapsingSoon}
                rowKey={(r, i) => `${r.accountId}-${r.product}-${i}`}
                empty={["Nothing lapsing", "No licence runs out in the next month."]}
              />
            </>
          ) : null}
        </>
      )}

      {toast}
    </>
  );
}
