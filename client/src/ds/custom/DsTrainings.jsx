// /trainings — the training and events record, in his design.
//
// THERE IS NO trainings.html. His build has no such page and the manifest has
// no such slug, so this is not a port: it is his design language extended to
// the last public page still on the classic build. Everything here is borrowed
// from his own events section on Learn (ds/pages/DsLearnPage.jsx) — .phero,
// .sec/.shell/.sec-head, his .gal of .gcard tiles, the .evstats strip, the
// .filters pills and the .evlist index with .ev-when/.ev-tag/.ev-title/
// .ev-loc/.ev-att. No new class is invented; the two compositions that are
// mine (the tag pills inside a tile, the filter state) are his classes
// arranged differently.
//
// WHAT IT REPLACES: pages/Trainings.jsx. Same single source — GET /trainings,
// which answers { stats, items } — same server preload for hydration, same
// PageSeo, same link into each event at /trainings/:id. The old page showed
// every event as one photo card; his rhythm is a featured gallery over a
// complete index, so every event is still on the page, twice over for the six
// most recent that carry a photograph.
//
// NO TYPED FIGURES. The five numbers in the strip and the counts on the filter
// pills come from the endpoint, never from markup. The headline says "since
// 2018" and counts nothing, so the page cannot go stale or overstate: the only
// figures his own pages state for this — 30 events, 800+ trained — are a
// subset of what the strip reads live.
//
// HIS FILTER, REACT'S STATE. useDsBehaviours wires #ev-filters to #ev-list by
// snapshotting .evrow at mount, which cannot work for rows that arrive from a
// fetch. So those two ids are deliberately absent here and the filter is state;
// his behaviour sees no bar and leaves the page alone rather than fighting it.

import React from "react";
import { Link } from "react-router-dom";

import { api } from "../../http.js";
import { readPreloaded } from "../../lib/preload.js";
import PageSeo from "../../components/PageSeo.jsx";
import DsPromoLive from "../DsPromoLive.jsx";

// en-GB on both sides of the render. The classic page passed `undefined`,
// which asks Node and the browser for their own default and invites a
// hydration mismatch on a server-rendered route.
const COUNT = new Intl.NumberFormat("en-GB");
const count = (n) => COUNT.format(Number(n) || 0);

const when = (value) => {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// The model's three modes (server/models/Training.js), his three .ev-tag
// palettes, and the labels he uses for them on Learn.
const MODES = [
  { key: "online", label: "Online", plural: "Online" },
  { key: "office", label: "In-office", plural: "In-office" },
  { key: "conference", label: "Conference", plural: "Conferences" },
];
const MODE = Object.fromEntries(MODES.map((m) => [m.key, m]));

const coverOf = (t) => t.imageUrl || (Array.isArray(t.imageUrls) ? t.imageUrls[0] : "") || "";
const placeOf = (t) => [t.city, t.country].filter(Boolean).join(", ");
const whereOf = (t) => [placeOf(t), t.venue].filter(Boolean).join(" · ");

/** A figure from the endpoint, or the one counted here if it did not send it. */
const figure = (given, counted) => (Number.isFinite(Number(given)) ? Number(given) : counted);

function Tile({ training }) {
  const mode = MODE[training.mode];
  const cover = coverOf(training);
  const place = placeOf(training) || training.venue;
  const tags = Array.isArray(training.tags) ? training.tags.filter(Boolean) : [];

  return (
    <Link className="gcard tilt rise" to={`/trainings/${encodeURIComponent(training._id)}`}>
      <div className="gcard-bg">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <span className="host">{[mode?.label, place].filter(Boolean).join(" · ")}</span>
      <h3>{training.title}</h3>
      {training.description ? <p>{training.description}</p> : null}
      {training.attendees ? (
        <p className="gprice">
          <b>{count(training.attendees)}</b> attended
        </p>
      ) : null}
      {tags.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {tags.map((tag) => (
            <span key={tag} className="pill pill-b">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function Row({ training }) {
  const mode = MODE[training.mode];
  const place = whereOf(training);

  return (
    <li className="evrow">
      <span className="ev-when">{when(training.date)}</span>
      <span className={mode ? `ev-tag ev-${mode.key}` : "ev-tag"}>{mode?.label || "Session"}</span>
      <Link className="ev-title" to={`/trainings/${encodeURIComponent(training._id)}`}>
        {training.title}
      </Link>
      <span className="ev-loc">{place || "–"}</span>
      <span className="ev-att">{training.attendees ? count(training.attendees) : "–"}</span>
    </li>
  );
}

export default function DsTrainings() {
  // Seeded by entry-server.jsx for /trainings, so the titles and dates ship
  // inside the HTML and the first browser render matches what was sent.
  const preloaded = readPreloaded("trainings:list");

  const [stats, setStats] = React.useState(preloaded?.stats ?? null);
  const [items, setItems] = React.useState(preloaded?.items ?? []);
  const [loading, setLoading] = React.useState(!preloaded);
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setFailed(false);
        const data = await api("/trainings");
        if (!alive) return;
        setStats(data?.stats ?? null);
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // A stable array even if the preload payload ever arrives in another shape,
  // so the three memos below are not re-run on every render.
  const all = React.useMemo(() => (Array.isArray(items) ? items : []), [items]);

  // Counted here as the fallback, so the strip and the pills still read true
  // if the endpoint ever stops sending `stats`.
  const totals = React.useMemo(() => {
    const own = { events: all.length, online: 0, office: 0, conference: 0, attendees: 0 };
    for (const t of all) {
      own.attendees += Number(t.attendees) || 0;
      // Only the three modes the schema allows, so an unexpected value cannot
      // land on `events` or `attendees` and corrupt the strip.
      if (MODE[t.mode]) own[t.mode] += 1;
    }
    return {
      events: figure(stats?.totalEvents, own.events),
      online: figure(stats?.onlineSessions, own.online),
      office: figure(stats?.officeTrainings, own.office),
      conference: figure(stats?.conferences, own.conference),
      attendees: figure(stats?.totalAttendees, own.attendees),
    };
  }, [all, stats]);

  // His gallery is the featured six and sits above the filters, which belong
  // to the index underneath — so picking a kind does not empty the tiles.
  const featured = React.useMemo(() => all.filter(coverOf).slice(0, 6), [all]);
  const listed = React.useMemo(
    () => (filter === "all" ? all : all.filter((t) => t.mode === filter)),
    [all, filter],
  );

  const pills = [
    { key: "all", label: "All", n: totals.events },
    ...MODES.map((m) => ({ key: m.key, label: m.plural, n: totals[m.key] })),
  ];

  return (
    <>
      <PageSeo path="/trainings" crumb="Training and events" />

      <header className="phero phero-sm">
        <div className="phero-bg">
          <img src="/ds/ev2.jpg" alt="" />
        </div>
        <div className="phero-in">
          <span className="host">Training &amp; events</span>
          <h1>
            <span className="w" style={{ "--i": "0" }}>
              Every
            </span>{" "}
            <span className="w" style={{ "--i": "1" }}>
              room
            </span>{" "}
            <span className="w" style={{ "--i": "2" }}>
              we
            </span>{" "}
            <span className="w" style={{ "--i": "3" }}>
              have
            </span>{" "}
            <span className="w grad" style={{ "--i": "4" }}>
              trained
            </span>{" "}
            <span className="w grad" style={{ "--i": "5" }}>
              in.
            </span>
          </h1>
          <p className="ds-lede">
            Conferences, chapter workshops, university sessions and in-office programmes, delivered
            across Nigeria since 2018.
          </p>
          <div className="hero-cta">
            <a href="#events" className="ds-btn btn-p">
              See every session{" "}
              <svg viewBox="0 0 24 24">
                <use href="#i-arrow" />
              </svg>
            </a>
            <Link to="/contact" className="ds-btn btn-o">
              Book a programme
            </Link>
          </div>
        </div>
      </header>

      <section className="sec" id="events">
        <div className="shell">
          <div className="sec-head rise">
            <span className="eyebrow">The record</span>
            <h2>
              Every session we have run, <span className="tone">since 2018</span>
            </h2>
            <p className="ds-lede">
              The tiles feature the most recent sessions that carry a photograph. Every event is
              listed underneath, and each one opens on its own page.
            </p>
          </div>

          {failed && !all.length ? (
            <p className="ds-lede">
              The events could not be loaded just now. Please try again shortly.
            </p>
          ) : loading && !all.length ? (
            <p className="ds-lede">Loading the events…</p>
          ) : !all.length ? (
            <div className="sec-head mid" style={{ marginTop: "20px" }}>
              <p className="ds-lede">
                No events have been published yet. Firms, chapters and institutions can book an
                in-office programme at any time.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "9px",
                  justifyContent: "center",
                  marginTop: "20px",
                  flexWrap: "wrap",
                }}
              >
                <Link className="ds-btn btn-p" to="/contact">
                  Book a programme
                </Link>
                <Link className="ds-btn btn-o" to="/learn">
                  Browse free lessons
                </Link>
              </div>
            </div>
          ) : (
            <>
              {featured.length ? (
                <div className="gal">
                  {featured.map((t) => (
                    <Tile key={t._id} training={t} />
                  ))}
                </div>
              ) : null}

              <div className="evstats rise">
                <div className="evstat">
                  <b>{count(totals.events)}</b>
                  <span>Events delivered</span>
                </div>
                <div className="evstat">
                  <b>{count(totals.online)}</b>
                  <span>Online sessions</span>
                </div>
                <div className="evstat">
                  <b>{count(totals.office)}</b>
                  <span>In-office trainings</span>
                </div>
                <div className="evstat">
                  <b>{count(totals.conference)}</b>
                  <span>Conferences &amp; workshops</span>
                </div>
                <div className="evstat">
                  <b>{count(totals.attendees)}</b>
                  <span>People in the room</span>
                </div>
              </div>

              <div className="filters rise">
                {pills.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={filter === p.key ? "on" : undefined}
                    aria-pressed={filter === p.key}
                    onClick={() => setFilter(p.key)}
                  >
                    {p.label} {count(p.n)}
                  </button>
                ))}
              </div>

              <ul className="evlist rise">
                <li className="evhead">
                  <span>Date</span>
                  <span>Kind</span>
                  <span>Session</span>
                  <span>Where</span>
                  <span>Attended</span>
                </li>
                {listed.map((t) => (
                  <Row key={t._id} training={t} />
                ))}
              </ul>

              {!listed.length ? (
                <p className="ds-lede" style={{ marginTop: "22px" }}>
                  No events of that kind yet.
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <DsPromoLive />

      <section className="cta">
        <div className="cta-bp" />
        <div className="cta-dots" />
        <div className="cta-g" />
        <h2>
          Bring us to <span className="grad">your room</span>
        </h2>
        <p className="ds-lede">
          An instructor comes to your office, chapter or department and works through your own
          projects, not a demo file.
        </p>
        <div className="hero-cta">
          <Link to="/contact" className="ds-btn btn-p">
            Request a programme
          </Link>
          <Link to="/learn" className="ds-btn btn-o">
            Browse courses
          </Link>
        </div>
      </section>
    </>
  );
}
