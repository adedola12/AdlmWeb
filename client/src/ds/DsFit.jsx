// "Which one is for me" — answered by the site instead of by a sales call.
//
// WHY THIS EXISTS
//
// The catalogue has eight products and a visitor cannot be expected to know
// that a Revit model means QUIV and a photographed drawing means HERON. He
// already saw this: products.html carries an expanding picker under the
// heading "Start from the drawing you were given", and his own comment on
// .pick-c calls it a "grovia-style expanding picker". This page is that idea
// carried to its end — the picker asks four things and names the product, the
// plan, and the price.
//
// WHAT IS HIS AND WHAT IS OURS
//
// Every class here is his: .chk / .qt-build / .qt-panel is the quote page's
// two-column shape, .pick / .pick-c is the products picker, .toggle2 is his
// segmented control, .flowsteps is his checkout progress. There is NO new CSS
// for this page — not one rule. The product copy is lifted from his own
// product pages rather than written in his voice, and the images are the ones
// already ported to /ds.
//
// What is ours is the wiring: the answers, and the arithmetic that turns them
// into a recommendation.
//
// THE PRICES ARE REAL
//
// Everything comes from GET /products, the same published catalogue the
// pricing page reads. Nothing here is hardcoded, so a price changed in the
// admin catalogue changes this page too. A product that is unpublished simply
// stops being recommended rather than being recommended at a stale price.
//
// THE 3D
//
// His, and only where he put it. .pick-c expands and reveals its artwork when
// chosen; .tilt gives the summary card the pointer-follow he wrote in site.js.
// Both are gated in his own CSS and his own JS: the picker stacks flat at
// 900px and the tilt never binds on a coarse pointer. A phone gets the whole
// flow with none of the parallax, which is his decision, not a compromise.

import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config.js";

// ── his picker, one card per situation ─────────────────────────────────────
// `copy` is his sentence for that product, taken from the page that sells it.
// `key` is the catalogue key, which is a legacy CAD-host slug rather than the
// product's name — revit is QUIV, planswift is HERON. Getting this wrong
// recommends the right product at another product's price.
const SITUATIONS = [
  {
    id: "model",
    key: "revit",
    art: "/ds/bg-quiv.jpg",
    head: "You were given a model",
    copy:
      "Revit hands you geometry. Measure the elements themselves with QUIV — " +
      "the element ID stays on the bill line, so any query has an answer.",
  },
  {
    id: "flat",
    key: "planswift",
    art: "/ds/bg-heron.jpg",
    head: "You were given flat drawings",
    copy:
      "PDFs, scans, or a drawing photographed on site. Scale it once and " +
      "measure it with HERON using the ADLM templates.",
  },
  {
    id: "civil",
    key: "civil3d",
    art: "/ds/bg-civiq.jpg",
    head: "It is roads, drainage or earthworks",
    copy:
      "Roads, drainage and earthworks — measured in Civil 3D, priced from the " +
      "same library.",
  },
  {
    id: "services",
    key: "mep",
    art: "/ds/bg-mep.jpg",
    head: "It is building services",
    copy:
      "Ductwork, pipework, electrical and plumbing — from the model, in one " +
      "workspace.",
  },
  {
    id: "rates",
    key: "rategen",
    art: "/ds/bg-rategen.jpg",
    head: "You have quantities, not rates",
    copy:
      "If the measuring is done and the argument is about price, RateGen " +
      "builds the rate from materials and labour you can show.",
  },
  {
    id: "programme",
    key: "qs-takeoff",
    art: "/ds/bg-timepro.jpg",
    head: "You need durations, not quantities",
    copy:
      "Log the output, get durations you can defend — then export the " +
      "programme.",
  },
];

// A beginner is pointed at the course that covers their situation. These are
// the two published course keys; services gets the M&E course, everything else
// gets building works.
const COURSE_FOR = {
  model: "bimbld",
  flat: "bimbld",
  civil: "bimbld",
  services: "BIMMEP",
  rates: null, // RateGen is not a modelling skill — a course would be padding
  programme: null,
};

const EXPERIENCE = [
  { id: "new", label: "New to takeoff" },
  { id: "some", label: "Done some" },
  { id: "pro", label: "Experienced QS" },
];

// Budget bands, per month, in the currency they are being shown. The naira
// bands are set around the real catalogue: HERON is 12,000 and QUIV is 50,000,
// so the boundaries fall between the products rather than through them.
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

// The catalogue stores both currencies; USD is only derived from naira when
// the explicit USD field is unset, which mirrors getEffectivePrices on the
// server. Doing it the same way here is what stops this page quoting a figure
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

export default function DsFit() {
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  const [situation, setSituation] = React.useState(null);
  const [experience, setExperience] = React.useState(null);
  const [budget, setBudget] = React.useState(null);
  const [place, setPlace] = React.useState(null); // "ng" | "else"

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

  // Currency follows where they work. Until they say, show naira — the
  // catalogue is authored in naira and it is the currency most of the people
  // reading this page will pay in.
  const cur = place === "else" ? "USD" : "NGN";
  const bands = BANDS[cur];

  const byKey = React.useMemo(() => {
    const m = new Map();
    for (const p of catalogue || []) m.set(p.key, p);
    return m;
  }, [catalogue]);

  const answered = [situation, experience, budget, place].filter(Boolean).length;

  // ── the recommendation ───────────────────────────────────────────────────
  // Deliberately explainable: every part of the result carries the answer that
  // produced it, so it reads as a decision rather than an oracle.
  const fit = React.useMemo(() => {
    if (!situation || !catalogue) return null;
    const sit = SITUATIONS.find((s) => s.id === situation);
    const tool = byKey.get(sit.key);
    if (!tool) return null; // unpublished — say nothing rather than guess

    const band = bands.find((b) => b.id === budget) || null;
    const monthly = priceOf(tool, cur, "monthly");
    const yearly = priceOf(tool, cur, "yearly");

    // Yearly is his own recommendation — "yearly costs ten months, so two are
    // free" — but only offer it when the monthly equivalent sits inside what
    // they said they could spend. Recommending a year up front to somebody who
    // told us their ceiling is a tenth of it is how a price page loses trust.
    const perMonthIfYearly = yearly > 0 ? yearly / 12 : Infinity;
    const wantsYearly = !!band && perMonthIfYearly <= band.max && yearly > 0;
    const period = wantsYearly ? "yearly" : "monthly";
    const toolPrice = wantsYearly ? yearly : monthly;

    const overBudget = !!band && monthly > band.max && !wantsYearly;

    const courseKey = experience === "new" ? COURSE_FOR[situation] : null;
    const course = courseKey ? byKey.get(courseKey) : null;
    const coursePrice = course ? priceOf(course, cur, "yearly") : 0;

    const why = [];
    why.push({ q: "What you were given", a: sit.head });
    if (experience) {
      why.push({
        q: "How much you have done",
        a: EXPERIENCE.find((e) => e.id === experience)?.label || "",
      });
    }
    if (band) why.push({ q: "What you can spend", a: band.label });
    if (place) {
      why.push({
        q: "Where you work",
        a: place === "ng" ? "Nigeria — priced in naira" : "Outside Nigeria — priced in dollars",
      });
    }

    return {
      tool,
      period,
      toolPrice,
      course,
      coursePrice,
      total: toolPrice + coursePrice,
      overBudget,
      band,
      why,
      monthly,
    };
  }, [situation, experience, budget, place, catalogue, byKey, cur, bands]);

  // His flowsteps: done / on / neither. Four questions, in the order asked.
  const stepState = (i) => {
    const vals = [situation, experience, budget, place];
    if (vals[i]) return "done";
    const firstOpen = vals.findIndex((v) => !v);
    return i === firstOpen ? "on" : "";
  };

  return (
    <>
      <section className="sec" style={{ paddingTop: "150px" }}>
        <div className="shell">
          <div className="sec-head mid rise" style={{ marginBottom: "38px" }}>
            <span className="eyebrow">Not sure which</span>
            <h2>
              Start from the drawing <span className="tone">you were given</span>
            </h2>
            <p className="lede">
              Four questions. No account, no call. At the end you get the product, the
              plan and the price — and the reason it was picked.
            </p>
          </div>

          <div className="flowsteps">
            {["The drawing", "Your experience", "Your budget", "Where you work"].map(
              (label, i) => (
                <React.Fragment key={label}>
                  {i > 0 && <s />}
                  <div className={stepState(i)}>
                    <i>{stepState(i) === "done" ? "✓" : i + 1}</i>
                    {label}
                  </div>
                </React.Fragment>
              ),
            )}
          </div>

          {/* ── 1. the drawing ─────────────────────────────────────────────
              A band of its own, full width, because that is how he built it:
              his picker is three cards across the page. Squeezed into the
              quote layout's left column, six cards measured 86px each and the
              titles broke a word per line. Two rows of three keeps his exact
              proportions — 2.2 to 1 to 1 when one is open — and his own 900px
              rule still stacks them on a phone.

              No id="pick": that id is what his initPicker binds to, and two
              owners of the same `.on` class would fight each other. */}
          <div className="panel rise" style={{ marginBottom: "34px" }}>
            <h3>What you were given</h3>
            <p className="sub">
              Most people already know which of these describes their week.
            </p>
            {[SITUATIONS.slice(0, 3), SITUATIONS.slice(3)].map((row, r) => (
              <div className="pick" key={r} style={r ? { marginTop: "18px" } : undefined}>
                {row.map((s, j) => {
                  const n = r * 3 + j + 1;
                  const on = situation === s.id;
                  return (
                    <article
                      key={s.id}
                      className={`pick-c${on ? " on" : ""}`}
                      tabIndex={0}
                      role="button"
                      aria-pressed={on}
                      onClick={() => setSituation(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSituation(s.id);
                        }
                      }}
                    >
                      <span className="pick-n">{String(n).padStart(2, "0")}</span>
                      <div className="pick-art">
                        <img src={s.art} alt="" loading="lazy" />
                      </div>
                      <div className="pick-body">
                        <h4>{s.head}</h4>
                        <p>{s.copy}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="chk">
            <div className="qt-build">
              {/* ── 2. experience ─────────────────────────────────────────── */}
              <div className="panel rise">
                <h3>How much takeoff have you done</h3>
                <p className="sub">
                  This decides whether the course belongs in the price or would just
                  be padding.
                </p>
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
              </div>

              {/* ── 3. budget ─────────────────────────────────────────────── */}
              <div className="panel rise">
                <h3>What you can spend a month</h3>
                <p className="sub">
                  Yearly costs ten months, so two are free — but only offered when a
                  year works out inside what you said.
                </p>
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
              </div>

              {/* ── 4. location ───────────────────────────────────────────── */}
              <div className="panel rise">
                <h3>Where do you work</h3>
                <p className="sub">
                  This sets the currency everything above is shown in.
                </p>
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
              </div>
            </div>

            {/* ── the answer ───────────────────────────────────────────────
                .tilt is his pointer-follow; his own loop leaves it alone on a
                coarse pointer, so this is a flat card on a phone. */}
            <div className="panel rise qt-panel tilt">
              <h3>What that comes to</h3>
              <p className="sub">Everything below updates as you pick.</p>

              {failed && (
                <p className="qt-empty">
                  The catalogue did not load, so there are no prices to show. Reload
                  and it will try again.
                </p>
              )}

              {!failed && !fit && (
                <p className="qt-empty">
                  Pick what you were given and the rest fills itself in. You have
                  answered {answered} of 4.
                </p>
              )}

              {fit && (
                <>
                  <div className="qt-hr" />
                  <div className="qt-big">
                    {fit.tool.name}
                    <br />
                    <b>{money(fit.toolPrice, cur)}</b>{" "}
                    <span className="qt-q">
                      {fit.period === "yearly" ? "a year" : "a month"}
                    </span>
                  </div>

                  {fit.course && (
                    <>
                      <div className="qt-hr" />
                      <div className="qt-big">
                        {fit.course.name}
                        <br />
                        <b>{money(fit.coursePrice, cur)}</b>{" "}
                        <span className="qt-q">a year, per seat</span>
                      </div>
                      <p className="qt-note">
                        Added because you said you are new to takeoff. Drop it and the
                        tool still works — you will just be learning it on a live job.
                      </p>
                    </>
                  )}

                  {fit.course && (
                    <>
                      <div className="qt-hr" />
                      <div className="qt-big">
                        Together <b>{money(fit.total, cur)}</b>
                      </div>
                    </>
                  )}

                  {fit.overBudget && (
                    <p className="qt-note">
                      <span className="qt-flag">This is over what you said.</span> It is
                      still the right tool for that drawing — the honest answer is that
                      nothing cheaper measures it. RateGen at{" "}
                      {money(priceOf(byKey.get("rategen"), cur, "monthly"), cur)} a month
                      is the nearest thing if the measuring is already done.
                    </p>
                  )}

                  <div className="qt-hr" />
                  {fit.why.map((w) => (
                    <p key={w.q} className="qt-note" style={{ marginTop: "8px" }}>
                      <span className="qt-q">{w.q} — </span>
                      {w.a}
                    </p>
                  ))}

                  <Link
                    className="btn btn-p btn-full"
                    to={`/product/${fit.tool.key}`}
                    style={{ marginTop: "22px" }}
                  >
                    See {fit.tool.name} in full
                  </Link>
                  <Link
                    className="btn btn-o btn-full"
                    to="/quote"
                    style={{ marginTop: "10px" }}
                  >
                    Put it in a quotation
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
