// "Which one is for me" — answered by the site instead of by a sales call.
//
// WHY THIS EXISTS
//
// The catalogue has eight products and a visitor cannot be expected to know
// that a Revit model means QUIV and a photographed drawing means HERON. He
// already saw this: products.html asks it under "Start from the drawing you
// were given". This page is that question carried to its end: it names the
// products, the plan and the price, and the answer that picked each part.
//
// THE SHAPE: A WALK, NOT A FORM
//
// Asked for as an experience, like entering a world, with one option per page
// width fading in. Every piece of that already exists in his design, so this
// page is assembled from it rather than invented:
//
//   entrance  .hero.hero-tall with .hero-b dots and the breathing .hero-g glow
//   drawings  his pinned product carousel from the home page: .pin, .pin-stage,
//             .ptrack, .pslide (.on centred; .prev/.next blurred, faded, scaled
//             back), .pdots. One drawing per page width, as asked.
//   questions a full-screen scene each, revealed by his .rise
//   answer    the quote page's .qt-panel, and his .bb-bar following you down
//
// There is no new CSS for this page.
//
// WHO OWNS THE CAROUSEL — READ BEFORE EDITING
//
// His scroll driver (initNavAndPin in useDsBehaviours.js) runs the carousel:
// it takes the page's first .pin and every .pslide when the shell mounts, sizes
// the section to about one screen of scrolling per slide, and moves .on / .prev
// / .next as you scroll. Below 1000px his CSS stacks the slides instead.
//
// So React must never change a slide's className. If the "picked" state were
// in the class string, every pick would make React rewrite the attribute and
// wipe the classes his driver set, and the carousel would go blank. Picked
// lives on the slide's button (aria-pressed and its label) and in data-picked.
// The same applies to the .pdots. It is the same trap as id="pick" on the
// picker this page used to have.
//
// THE PRICES ARE REAL
//
// Everything comes from GET /products, the published catalogue the pricing
// page reads. A product that is unpublished stops being recommended rather
// than being recommended at a stale price.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";

// One slide per situation. `copy` is his sentence for that product, from the
// page that sells it; `host`, `art` and `light` are his settings for the same
// product's slide on the home page. `key` is the catalogue key, a legacy
// CAD-host slug: revit is QUIV, planswift is HERON.
const SITUATIONS = [
  {
    id: "model",
    key: "revit",
    art: "/ds/bg-quiv.jpg",
    light: false,
    host: "3D takeoff · Autodesk Revit",
    head: "You were given a model",
    copy:
      "Revit hands you geometry. Measure the elements themselves with QUIV — " +
      "the element ID stays on the bill line, so any query has an answer.",
  },
  {
    id: "flat",
    key: "planswift",
    art: "/ds/bg-heron.jpg",
    light: true,
    host: "2D takeoff · PlanSwift",
    head: "You were given flat drawings",
    copy:
      "PDFs, scans, or a drawing photographed on site. Scale it once and " +
      "measure it with HERON using the ADLM templates.",
  },
  {
    id: "civil",
    key: "civil3d",
    art: "/ds/bg-civiq.jpg",
    light: true,
    host: "Civil & infrastructure · AutoCAD Civil 3D",
    head: "It is roads, drainage or earthworks",
    copy:
      "Roads, drainage and earthworks — measured in Civil 3D, priced from the " +
      "same library.",
  },
  {
    id: "services",
    key: "mep",
    art: "/ds/bg-mep.jpg",
    light: false,
    host: "MEP & HVAC · Autodesk Revit",
    head: "It is building services",
    copy:
      "Ductwork, pipework, electrical and plumbing — from the model, in one " +
      "workspace.",
  },
  {
    id: "rates",
    key: "rategen",
    art: "/ds/bg-rategen.jpg",
    light: false,
    host: "Rate build-ups · Desktop",
    head: "You have quantities, not rates",
    copy:
      "If the measuring is done and the argument is about price, RateGen " +
      "builds the rate from materials and labour you can show.",
  },
  {
    id: "programme",
    key: "qs-takeoff",
    art: "/ds/bg-timepro.jpg",
    light: true,
    host: "Site productivity · Desktop & mobile",
    head: "You need durations, not quantities",
    copy:
      "Log the output, get durations you can defend — then export the " +
      "programme.",
  },
];

// A beginner gets the course that covers what they picked. Services gets the
// M&E course, the building situations get building works, and somebody who
// picked both gets both. RateGen and Time Pro are not modelling skills.
const COURSE_FOR = {
  model: "bimbld",
  flat: "bimbld",
  civil: "bimbld",
  services: "BIMMEP",
  rates: null,
  programme: null,
};

const EXPERIENCE = [
  { id: "new", label: "New to takeoff" },
  { id: "some", label: "Done some" },
  { id: "pro", label: "Experienced QS" },
];

// Budget bands, per month, in the currency they are shown in. The naira bands
// fall between the real catalogue's prices rather than through them.
const BANDS = {
  NGN: [
    { id: "low", label: "Under ₦15,000", max: 15000 },
    { id: "mid", label: "₦15,000 – ₦60,000", max: 60000 },
    { id: "high", label: "Over ₦60,000", max: Infinity },
  ],
  USD: [
    { id: "low", label: "Under $15", max: 15 },
    { id: "mid", label: "$15 – $45", max: 45 },
    { id: "high", label: "Over $45", max: Infinity },
  ],
};

const money = (n, cur) =>
  cur === "USD"
    ? `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₦${Math.round(Number(n || 0)).toLocaleString("en-NG")}`;

// USD is only derived from naira when the explicit USD field is unset, which
// mirrors getEffectivePrices on the server, so this page cannot quote a figure
// checkout then disagrees with.
function priceOf(product, cur, period) {
  const p = product?.price || {};
  const fx = Number(product?.fxRateNGNUSD || 0) || 0;
  const pick = (usd, ngn) => {
    if (cur !== "USD") return Math.round(Number(ngn || 0));
    if (usd != null && Number(usd) > 0) return Number(usd);
    return fx > 0 ? Number(ngn || 0) * fx : 0;
  };
  return period === "yearly"
    ? pick(p.yearlyUSD, p.yearlyNGN)
    : pick(p.monthlyUSD, p.monthlyNGN);
}

// A full-screen scene for one question. min-height rather than height, so a
// phone with a short screen can still scroll the question into view.
function Scene({ step, title, lede, children }) {
  return (
    <section
      className="sec"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}
    >
      <div className="shell" style={{ width: "100%" }}>
        <div className="sec-head mid rise" style={{ marginBottom: "34px" }}>
          <span className="eyebrow">{step}</span>
          <h2>{title}</h2>
          <p className="ds-lede">{lede}</p>
        </div>
        <div className="rise" style={{ display: "flex", justifyContent: "center" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

export default function DsFit() {
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  const [situations, setSituations] = React.useState([]);
  const [experience, setExperience] = React.useState(null);
  const [place, setPlace] = React.useState(null); // "ng" | "else"
  const [budget, setBudget] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        setCatalogue(Array.isArray(d) ? d : d?.products || d?.items || []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const togglePick = (id) =>
    setSituations((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Currency follows where they work. Until they say, naira: the catalogue is
  // authored in it, and most people reading this page will pay in it. Asked
  // before budget, so the budget bands are already in the right currency.
  const cur = place === "else" ? "USD" : "NGN";
  const bands = BANDS[cur];

  const byKey = React.useMemo(() => {
    const m = new Map();
    for (const p of catalogue || []) m.set(p.key, p);
    return m;
  }, [catalogue]);

  const answered = [situations.length > 0, experience, place, budget].filter(Boolean).length;

  // ── the recommendation ───────────────────────────────────────────────────
  // Explainable on purpose: every part carries the answer that produced it.
  const fit = React.useMemo(() => {
    if (!situations.length || !catalogue) return null;
    const picked = SITUATIONS.filter((s) => situations.includes(s.id));
    const tools = picked
      .map((s) => ({ sit: s, product: byKey.get(s.key) }))
      .filter((t) => t.product); // unpublished: say nothing rather than guess
    if (!tools.length) return null;

    const band = bands.find((b) => b.id === budget) || null;
    const sumMonthly = tools.reduce((a, t) => a + priceOf(t.product, cur, "monthly"), 0);
    const sumYearly = tools.reduce((a, t) => a + priceOf(t.product, cur, "yearly"), 0);

    // Yearly is his recommendation ("yearly costs ten months, so two are
    // free"), offered for the whole set only when every tool has a yearly price
    // and the set's monthly equivalent sits inside what they said they could
    // spend. One plan for the set keeps the answer readable.
    const everyYearly = tools.every((t) => priceOf(t.product, cur, "yearly") > 0);
    const wantsYearly = !!band && everyYearly && sumYearly / 12 <= band.max;
    const period = wantsYearly ? "yearly" : "monthly";

    const lines = tools.map((t) => ({ ...t, price: priceOf(t.product, cur, period) }));
    const toolsTotal = lines.reduce((a, l) => a + l.price, 0);
    const overBudget = !!band && sumMonthly > band.max && !wantsYearly;

    const courseKeys =
      experience === "new"
        ? [...new Set(picked.map((s) => COURSE_FOR[s.id]).filter(Boolean))]
        : [];
    const courses = courseKeys
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .map((product) => ({ product, price: priceOf(product, cur, "yearly") }));
    const coursesTotal = courses.reduce((a, c) => a + c.price, 0);

    const why = [{ q: "What you were given", a: picked.map((s) => s.head).join("; ") }];
    if (experience) {
      why.push({
        q: "How much you have done",
        a: EXPERIENCE.find((e) => e.id === experience)?.label || "",
      });
    }
    if (place) {
      why.push({
        q: "Where you work",
        a: place === "ng" ? "Nigeria — priced in naira" : "Outside Nigeria — priced in dollars",
      });
    }
    if (band) why.push({ q: "What you can spend", a: band.label });

    return { lines, period, courses, total: toolsTotal + coursesTotal, overBudget, why };
  }, [situations, experience, place, budget, catalogue, byKey, cur, bands]);

  // ── his sticky footer bar ────────────────────────────────────────────────
  // Up while the answer is off screen, down once it is on screen, so it never
  // covers what it summarises.
  const panelRef = React.useRef(null);
  const [panelOff, setPanelOff] = React.useState(false);

  React.useEffect(() => {
    const check = () => {
      const r = panelRef.current?.getBoundingClientRect();
      if (!r) return;
      setPanelOff(!(r.top < window.innerHeight - 120 && r.bottom > 120));
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    // Re-measured when the answer changes: a new line changes the panel's
    // height without anybody scrolling.
  }, [fit]);

  const barUp = !!fit && panelOff;

  const scrollToEl = (el) => {
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const showAnswer = () => {
    const el = panelRef.current;
    scrollToEl(el);
    // Focus follows: the bar goes inert once the panel is on screen, and a
    // keyboard user would otherwise be left on a button that has slid away.
    el?.focus({ preventScroll: true });
  };

  const names = fit ? fit.lines.map((l) => l.product.name.split(":")[0]) : [];
  const single = !!fit && fit.lines.length === 1 && fit.courses.length === 0;

  return (
    <>
      {/* ── the entrance ──────────────────────────────────────────────── */}
      <section className="hero hero-tall">
        <div className="hero-b" aria-hidden="true" />
        <div className="hero-g" aria-hidden="true" />
        <div className="shell">
          <span className="eyebrow rise">Not sure which</span>
          <h1 className="rise">
            Start from the drawing <span className="tone">you were given</span>
          </h1>
          <p className="ds-lede rise">
            Four questions. No account, no call. Pick every drawing that lands on your
            desk, and at the end you get the products, the plan and the price — and the
            reason each was picked.
          </p>
          <div className="hero-cta rise">
            <button
              type="button"
              className="ds-btn btn-p"
              onClick={() => scrollToEl(document.getElementById("fit-drawings"))}
            >
              Begin
            </button>
          </div>
          <p className="hero-note rise">
            <b>Scroll</b> to walk through each drawing
          </p>
        </div>
      </section>

      {/* ── 1. the drawings: his pinned carousel ─────────────────────────
          Class strings below are constant on purpose; see "who owns the
          carousel" at the top of this file. */}
      <section className="pin" id="fit-drawings">
        <div className="pin-stage">
          <div className="pin-head">
            <span className="eyebrow">Step 1 of 4</span>
            <h2>What were you given?</h2>
            <p>
              Pick every one that lands on your desk — most firms get more than one.
              {situations.length ? ` ${situations.length} picked.` : ""}
            </p>
          </div>
          <div className="ptrack">
            {SITUATIONS.map((s, i) => {
              const picked = situations.includes(s.id);
              return (
                <article
                  key={s.id}
                  className={`pslide${i === 0 ? " on" : ""}${s.light ? " light-art" : ""}`}
                  data-picked={picked ? "yes" : "no"}
                >
                  <div className="pslide-bg">
                    <img src={s.art} alt="" loading="lazy" />
                  </div>
                  <div className="pslide-in">
                    <span className="host">
                      {String(i + 1).padStart(2, "0")} · {s.host}
                    </span>
                    <h3>{s.head}</h3>
                    <p className="desc">{s.copy}</p>
                    <div>
                      <button
                        type="button"
                        className="ds-btn btn-p"
                        aria-pressed={picked}
                        onClick={() => togglePick(s.id)}
                      >
                        {picked ? "✓ Picked — tap to remove" : "This is me"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="pdots" aria-hidden="true">
            {SITUATIONS.map((s, i) => (
              <i key={s.id} className={i === 0 ? "on" : ""} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 2–4. one question per screen ───────────────────────────────── */}
      <Scene
        step="Step 2 of 4"
        title="How much takeoff have you done?"
        lede="This decides whether a course belongs in the price or would just be padding."
      >
        <div className="toggle2" role="group" aria-label="Experience">
          {EXPERIENCE.map((e) => (
            <button
              key={e.id}
              type="button"
              className={experience === e.id ? "on" : ""}
              onClick={() => setExperience(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </Scene>

      <Scene
        step="Step 3 of 4"
        title="Where do you work?"
        lede="This sets the currency everything after it is shown in."
      >
        <div className="toggle2" role="group" aria-label="Location">
          <button
            type="button"
            className={place === "ng" ? "on" : ""}
            onClick={() => setPlace("ng")}
          >
            Nigeria
          </button>
          <button
            type="button"
            className={place === "else" ? "on" : ""}
            onClick={() => setPlace("else")}
          >
            Somewhere else
          </button>
        </div>
      </Scene>

      <Scene
        step="Step 4 of 4"
        title="What can you spend a month?"
        lede="Yearly costs ten months, so two are free — offered only when a year works out inside what you say here."
      >
        <div className="toggle2" role="group" aria-label="Budget">
          {bands.map((b) => (
            <button
              key={b.id}
              type="button"
              className={budget === b.id ? "on" : ""}
              onClick={() => setBudget(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Scene>

      {/* ── the answer ──────────────────────────────────────────────────── */}
      <section className="sec">
        <div className="shell" style={{ maxWidth: "680px" }}>
          <div
            className="panel rise qt-panel tilt"
            id="fit-answer"
            ref={panelRef}
            // Focusable by script only (see showAnswer), not a tab stop.
            tabIndex={-1}
            // The nav is fixed, so scrollIntoView would park the heading under it.
            style={{ scrollMarginTop: "96px" }}
          >
            <h3>What that comes to</h3>
            <p className="sub">Everything below updates as you pick.</p>

            {failed && (
              <p className="qt-empty">
                The catalogue did not load, so there are no prices to show. Reload and it
                will try again.
              </p>
            )}

            {!failed && !fit && (
              <p className="qt-empty">
                Pick at least one drawing and the rest fills itself in. You have answered{" "}
                {answered} of 4.
              </p>
            )}

            {fit && (
              <>
                {fit.lines.map((l) => (
                  <React.Fragment key={l.product.key}>
                    <div className="qt-hr" />
                    <div className="qt-big">
                      <Link to={`/product/${l.product.key}`}>{l.product.name}</Link>
                      <br />
                      <b>{money(l.price, cur)}</b>{" "}
                      <span className="qt-q">{fit.period === "yearly" ? "a year" : "a month"}</span>
                    </div>
                  </React.Fragment>
                ))}

                {fit.courses.map((c) => (
                  <React.Fragment key={c.product.key}>
                    <div className="qt-hr" />
                    <div className="qt-big">
                      {c.product.name}
                      <br />
                      <b>{money(c.price, cur)}</b> <span className="qt-q">a year, per seat</span>
                    </div>
                  </React.Fragment>
                ))}
                {fit.courses.length > 0 && (
                  <p className="qt-note">
                    Added because you said you are new to takeoff. Drop it and the tools still
                    work — you will just be learning them on a live job.
                  </p>
                )}

                {!single && (
                  <>
                    <div className="qt-hr" />
                    <div className="qt-big">
                      Together <b>{money(fit.total, cur)}</b>
                    </div>
                  </>
                )}

                {fit.overBudget && (
                  <p className="qt-note">
                    <span className="qt-flag">This is over what you said.</span>{" "}
                    {fit.lines.length > 1
                      ? "Each one is the right tool for its drawing, so the honest way to bring it down is to drop the one you use least."
                      : "It is still the right tool for that drawing — nothing cheaper measures it."}
                  </p>
                )}

                <div className="qt-hr" />
                {fit.why.map((w) => (
                  <p key={w.q} className="qt-note" style={{ marginTop: "8px" }}>
                    <span className="qt-q">{w.q} — </span>
                    {w.a}
                  </p>
                ))}

                {single && (
                  <Link
                    className="ds-btn btn-p btn-full"
                    to={`/product/${fit.lines[0].product.key}`}
                    style={{ marginTop: "22px" }}
                  >
                    See {fit.lines[0].product.name} in full
                  </Link>
                )}
                <Link
                  className={`ds-btn ${single ? "btn-o" : "btn-p"} btn-full`}
                  to="/quote"
                  style={{ marginTop: single ? "10px" : "22px" }}
                >
                  Put it in a quotation
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* His .bb-bar. inert while down, so a keyboard user cannot tab onto a
          button that has slid off the bottom of the screen. */}
      <div className={`bb-bar${barUp ? " up" : ""}`} inert={!barUp} aria-live="polite">
        <div className="bb-bar-in">
          <div>
            <b>
              {fit
                ? `${names.join(" + ")}${fit.courses.length ? " + course" : ""} · ${money(fit.total, cur)}${
                    single ? (fit.period === "yearly" ? " a year" : " a month") : ""
                  }`
                : ""}
            </b>
            <span>
              {fit
                ? `Billed ${fit.period}${
                    fit.courses.length
                      ? ` · with ${fit.courses.map((c) => c.product.name).join(" and ")}`
                      : ""
                  }`
                : ""}
            </span>
          </div>
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={showAnswer}>
            See why
          </button>
        </div>
      </div>
    </>
  );
}
