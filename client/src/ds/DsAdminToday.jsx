// Today — his admin dashboard, on our queues.
//
// His screen, his markup, his charts. What changed is where the numbers come
// from: his admin-today.js read a fixture file, this reads /admin/today, and
// the endpoint does every piece of arithmetic so this file cannot quietly
// disagree with it. Drawing a bar is the only sum here.
//
// HIS TWO RULES, BOTH KEPT
//
// A dash is not a zero. `n: null` means we do not record the thing at all and
// prints "—"; `n: 0` means we do record it and it is empty. The row for a
// queue that does not exist is dimmed and says "not built" rather than
// borrowing a zero, which would read as calm.
//
// Both charts are horizontal bars, single series, every bar directly labelled.
// His reasoning, which the port does not get to relitigate: four or five
// categories with word labels of unequal length, compared by magnitude — a
// vertical axis would set the labels at an angle, a pie would make five slices
// nobody can rank, and a line would imply a time series that does not exist.
// Nothing rests on colour alone, so the legend explains the one distinction
// colour does carry: blue is waiting, orange is a row that cannot be actioned
// as it stands.
//
// His markup: .adm-banner, .adm-kpis/.adm-kpi, .adm-cols, .adm-panel with
// .adm-panel-h/.adm-panel-b, .adm-jobs/.adm-job with .adm-job-n/.adm-job-t and
// .adm-chip, .adm-bars/.adm-bar-r/.adm-bar-l/.adm-bar-t/.adm-bar-f/.adm-bar-v,
// .adm-hero and .adm-legend.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/* Whole millions on a bar label; the exact figure lives on the queue. His. */
const short = (v) =>
  v >= 1e6 ? `₦${(v / 1e6).toFixed(1)}m` : `₦${Math.round(v / 1000)}k`;

const Icon = ({ id }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

/**
 * One horizontal bar chart. `max` is passed in rather than derived per row so
 * a bar's length always means the same thing on the same axis — his note.
 *
 * A null row gets no bar at all rather than a zero-width one, which would read
 * as "we measured this and it was nothing".
 */
function Bars({ rows, max, fmt }) {
  return (
    <div className="adm-bars">
      {rows.map((r) => (
        <div
          key={r.k}
          className={`adm-bar-r${r.hot ? " hot" : ""}${
            r.v == null ? " none" : r.v ? "" : " zero"
          }`}
        >
          <span className="adm-bar-l">{r.k}</span>
          <span className="adm-bar-t">
            <span
              className="adm-bar-f"
              style={{ width: r.v == null ? 0 : `${Math.max(1.5, (r.v / max) * 100)}%` }}
            />
          </span>
          <span className="adm-bar-v">{r.v == null ? "—" : fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

/** One queue row. An <a> when there is a screen behind it, a <div> when not. */
function Job({ q }) {
  const inner = (
    <>
      <span className={`adm-job-n${q.n ? "" : " zero"}`}>{q.n == null ? "—" : q.n}</span>
      <span className="adm-job-t">
        <b>{q.title}</b>
        <span>{q.note}</span>
      </span>
      {q.flag ? (
        <span className="adm-chip due">{q.flagText || q.flag}</span>
      ) : q.n == null ? (
        <span className="adm-chip calm">not recorded</span>
      ) : q.href ? (
        <span className="adm-chip go">Open</span>
      ) : null}
    </>
  );

  return (
    <li>
      {q.href ? (
        <Link className="adm-job" to={q.href}>
          {inner}
        </Link>
      ) : (
        <div className="adm-job">{inner}</div>
      )}
    </li>
  );
}

export default function DsAdminToday() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/today", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (failed) {
    return <p className="adm-note">Today could not be loaded just now. Please refresh.</p>;
  }
  if (!d) return <p className="adm-note">Reading the queues…</p>;

  const k = d.kpis;

  // His four tiles. The last two are warnings by nature: an old transfer and a
  // row nobody can action are both the screen telling you something is stuck.
  const KPIS = [
    {
      k: "Waiting on you",
      ic: "hi-alert",
      v: String(k.openWork),
      // The composition, not just the number of queues. A headline of 66 over
      // a visible queue of 33 reads as a mistake until it can be taken apart,
      // and the largest contributor is often not the one on screen.
      sub: (k.composition || []).length
        ? (k.composition || [])
            .slice(0, 3)
            // The queue names are plural; one of a thing is not.
            .map((c) => {
              const label = c.label.toLowerCase();
              return `${c.n} ${c.n === 1 && label.endsWith("s") ? label.slice(0, -1) : label}`;
            })
            .join(" · ") +
          (k.composition.length > 3 ? ` · and ${k.composition.length - 3} more` : "")
        : `across ${k.liveQueues} queue${k.liveQueues === 1 ? "" : "s"} that have rows in them`,
    },
    {
      k: "Money to verify",
      ic: "hi-billing",
      v: money(k.money, k.currency),
      sub: `${k.orders} order${k.orders === 1 ? "" : "s"} awaiting a decision`,
    },
    {
      k: "Oldest order",
      ic: "hi-calendar",
      v: String(k.oldest),
      u: "days",
      sub: "since it was placed",
      warn: k.oldest >= 3,
    },
    {
      k: "Cannot be actioned",
      ic: "hi-shield",
      v: String(k.blocked),
      sub: `${k.orphanInstalls} orphaned installation${k.orphanInstalls === 1 ? "" : "s"}, ${k.orphanOrders} order${k.orphanOrders === 1 ? "" : "s"} with no account`,
      warn: k.blocked > 0,
    },
  ];

  const qMax = Math.max(1, ...d.bySource.map((r) => r.v || 0));
  const mMax = d.byFirm.length ? d.byFirm[0].v : 1;
  const open = k.openWork;

  return (
    <>
      <div className="adm-banner">
        <span className="ic">
          <Icon id="hi-info" />
        </span>
        <span>
          <b>Every figure here is computed, none of it is typed.</b>
          <p>
            Each number is a query against the live database, and a dash means the thing is not
            recorded at all — which is not the same as a zero. Dimmed rows are queues nothing
            writes to yet, kept visible so the gap is arguable rather than invisible.
          </p>
        </span>
      </div>

      <div className="adm-kpis">
        {KPIS.map((s) => (
          <div key={s.k} className={`adm-kpi${s.warn ? " warn" : ""}`}>
            <span className="k">
              <Icon id={s.ic} />
              <span>{s.k}</span>
            </span>
            <b>
              {s.v}
              {s.u ? <span className="u">{s.u}</span> : null}
            </b>
            <span className="sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="adm-cols">
        <div>
          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Waiting on you</h2>
              <span className="note">
                {open} thing{open === 1 ? "" : "s"} to clear
              </span>
            </div>
            <div className="adm-panel-b">
              <ul className="adm-jobs">
                {d.work.map((q) => (
                  <Job key={q.id} q={q} />
                ))}
              </ul>
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Watching</h2>
              <span className="note">Nothing to do yet, but it will need doing</span>
            </div>
            <div className="adm-panel-b">
              <ul className="adm-jobs">
                {d.watch.map((q) => (
                  <Job key={q.id} q={q} />
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div>
          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Where the work is sitting</h2>
              <span className="note">Open items per queue</span>
            </div>
            <div className="adm-panel-b">
              <Bars rows={d.bySource} max={qMax} fmt={String} />
              <div className="adm-legend">
                <span>
                  <i />
                  Waiting
                </span>
                <span>
                  <i className="hot" />
                  Rows that cannot be actioned as they stand
                </span>
              </div>
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Money awaiting a decision</h2>
              <span className="note">Unapproved orders</span>
            </div>
            <div className="adm-panel-b">
              <div className="adm-hero">
                <b>{money(k.money, k.currency)}</b>
                <span>
                  Across {k.orders} order{k.orders === 1 ? "" : "s"} from {k.firms} account
                  {k.firms === 1 ? "" : "s"}. Approving one grants what it paid for.
                </span>
              </div>
              {d.byFirm.length ? (
                <Bars rows={d.byFirm} max={mMax} fmt={short} />
              ) : (
                <p className="adm-note">Nothing is waiting on a decision.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
