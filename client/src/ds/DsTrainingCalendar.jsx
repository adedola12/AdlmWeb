// /learn/calendar: the physical and live trainings that are scheduled (R21).
//
// Richard's events section from Learn (.sec-head, his .gal of .gcard tiles
// with .host and .gprice), fed by the published training events
// (GET /ptrainings/events) and grouped by month. Past sessions drop off; the
// record of past events stays on Learn. Behind TRAINING_CALENDAR_LIVE.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";

const NGN = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const month = (d) => new Date(d).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const day = (d) =>
  new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function where(ev) {
  const l = ev.location || {};
  return [l.name, l.city || l.state].filter(Boolean).join(" · ") || "Venue to be confirmed";
}

export default function DsTrainingCalendar() {
  const [events, setEvents] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const was = document.title;
    document.title = "Training calendar | ADLM Studio";
    let alive = true;
    fetch(`${API_BASE}/ptrainings/events`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list) => alive && setEvents(Array.isArray(list) ? list : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      document.title = was;
    };
  }, []);

  const now = Date.now();
  const upcoming = (events || [])
    .filter((e) => e.startAt && new Date(e.endAt || e.startAt).getTime() >= now)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const months = [];
  for (const ev of upcoming) {
    const m = month(ev.startAt);
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, list: [] });
    months[months.length - 1].list.push(ev);
  }

  return (
    <section className="sec" id="calendar" style={{ paddingTop: 150 }}>
      <div className="shell">
        <div className="sec-head">
          <span className="eyebrow">Training calendar</span>
          <h2>
            Train with us, <span className="tone">in the room or live online</span>
          </h2>
          <p className="ds-lede">
            Every scheduled ADLM training, by month. Each one opens for registration on its own page.
          </p>
        </div>

        {failed ? (
          <p className="ds-lede">The calendar could not be loaded just now. Please try again shortly.</p>
        ) : !events ? (
          <p className="ds-lede">Loading the calendar…</p>
        ) : !months.length ? (
          <div className="sec-head mid" style={{ marginTop: 20 }}>
            <p className="ds-lede">
              No sessions are scheduled right now. Firms can book an in-office programme at any time.
            </p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              <Link className="ds-btn btn-p" to="/support">
                Book a programme
              </Link>
              <Link className="ds-btn btn-o" to="/learn">
                Browse free lessons
              </Link>
            </div>
          </div>
        ) : (
          months.map(({ m, list }) => (
            <div key={m} style={{ marginTop: 36 }}>
              <h3 style={{ margin: "0 0 18px" }}>{m}</h3>
              <div className="gal">
                {list.map((ev) => {
                  const price = Number(ev.pricing?.normalNGN || ev.priceNGN) || 0;
                  const art = ev.flyerUrl || ev.media?.find?.((x) => x?.type !== "video")?.url || "";
                  return (
                    <Link key={ev._id} className="gcard tilt" to={`/ptrainings/${encodeURIComponent(ev.slug || ev._id)}`}>
                      <div className="gcard-bg">{art ? <img src={art} alt="" loading="lazy" /> : null}</div>
                      <span className="host">
                        {day(ev.startAt)} · {where(ev)}
                      </span>
                      <h3>{ev.title}</h3>
                      {ev.subtitle ? <p>{ev.subtitle}</p> : null}
                      <p className="gprice">
                        {price ? <b>{NGN.format(price)}</b> : <b>Free</b>}
                        {price ? " per seat" : ""}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
