// src/pages/AboutADLM.jsx
import React from "react";
import Seo from "../components/Seo.jsx";
import { Link } from "react-router-dom";
import dolapo from "../assets/team/Dola.jpeg";
import richard from "../assets/team/Richard.jpg";
// This page keeps its own local <Reveal> (a page-local .reveal animation that
// predates the shared one); only the pieces it does not already have are
// pulled in from the shared layer.
import { Stagger, StaggerItem } from "../components/effects.jsx";
import { Eyebrow } from "../components/brand.jsx";
import { IconShield, IconSparkle, IconStar, IconUsers } from "../components/icons.jsx";
// import gladys from "../assets/team/Gladys.JPG";

/* -------------------- tiny animation helpers -------------------- */
function useInView(threshold = 0.12) {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.unobserve(el); // fire once
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, shown };
}

const styles = `
@keyframes fade-up { 
  from { opacity:0; transform: translateY(14px) scale(.98); } 
  to { opacity:1; transform: translateY(0) scale(1); } 
}
@keyframes pop { 0%{transform:scale(1)}50%{transform:scale(1.02)}100%{transform:scale(1)} }
.reveal { opacity:0; transform: translateY(14px) scale(.98); }
.reveal.show { animation: fade-up .7s cubic-bezier(.2,.7,.2,1) forwards; }

/* --- Journey timeline animations --- */
@keyframes line-grow { from { height: 0; } to { height: 100%; } }
@keyframes dot-pop { 0% { transform: translate(-50%,-50%) scale(.4); opacity:0 } 
                     60% { opacity:1 } 
                     100% { transform: translate(-50%,-50%) scale(1); opacity:1 } }
@keyframes slide-left { from { opacity:0; transform: translateX(-18px); } 
                        to   { opacity:1; transform: translateX(0); } }
@keyframes slide-right{ from { opacity:0; transform: translateX(18px); } 
                        to   { opacity:1; transform: translateX(0); } }
`;

/* -------------------- small building blocks -------------------- */
function Reveal({ delay = 0, children, className = "" }) {
  const { ref, shown } = useInView();
  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "show" : ""} ${className}`}
      style={{ animationDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, suffix = "", delay = 0 }) {
  const { ref, shown } = useInView(0.2);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!shown) return;
    let raf;
    const start = performance.now();
    const target = value;
    const dur = 1200;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, value]);
  return (
    <div
      ref={ref}
      className="reveal show"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-3xl md:text-4xl font-bold tracking-tight">
        {n}
        {suffix}
      </div>
      <div className="text-sm text-slate-200/80 mt-1">{label}</div>
    </div>
  );
}

/* robust image with fallback (fixes broken image on some networks) */
function SafeImg({ src, alt = "", className = "" }) {
  const [url, setUrl] = React.useState(src);
  return (
    <img
      loading="lazy"
      src={url}
      alt={alt}
      className={className}
      onError={() =>
        setUrl(
          "https://images.unsplash.com/photo-1523419409543-9e4b7a63e27a?q=80&w=1600&auto=format&fit=crop",
        )
      }
    />
  );
}

function JourneyTimeline() {
  const items = [
    { year: "2019", title: "ADLM Studio was founded" },
    { year: "2020", title: "Started QS software training" },
    { year: "2022", title: "Launched the PlanSwift plugin" },
    { year: "2024", title: "Launched the Revit plugin for quantity takeoff" },
    {
      year: "2025",
      title: "ADLM Rate Generator, and the first BIM + AI course for MEP and HVAC",
    },
    {
      year: "2026",
      title:
        "ADLM Cloud, QUIV for Revit and ArchiCAD, Heron, and the move to firm-wide programmes",
    },
  ];

  return (
    <div>
      <Reveal>
        <div className="text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-adlm-orange bg-adlm-orange/10 ring-1 ring-adlm-orange/20">
            Milestones
          </span>
          <h2 className="mt-4 text-2xl md:text-3xl font-bold tracking-tight">
            Our Journey
          </h2>
          <p className="text-slate-600 dark:text-adlm-dark-muted mt-2">
            Key milestones in our growth story
          </p>
        </div>
      </Reveal>

      <ol className="relative mt-12 max-w-2xl mx-auto">
        {items.map((m, i) => {
          const last = i === items.length - 1;
          return (
            <li key={m.year} className="flex gap-4 sm:gap-5">
              {/* Rail: glowing node + connecting line */}
              <div className="relative flex flex-col items-center">
                <span className="z-10 grid place-items-center w-7 h-7 rounded-full bg-white dark:bg-adlm-dark-bg ring-2 ring-adlm-blue-600 shadow-glow-blue">
                  <span className="w-2.5 h-2.5 rounded-full bg-adlm-orange" />
                </span>
                {!last && (
                  <span
                    aria-hidden="true"
                    className="w-0.5 flex-1 my-1 rounded-full bg-gradient-to-b from-adlm-blue-600/70 to-adlm-blue-700/30"
                  />
                )}
              </div>

              {/* Milestone card */}
              <div className={`flex-1 ${last ? "" : "pb-6"}`}>
                <Reveal delay={70 * i}>
                  <div className="group relative spotlight overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 shadow-depth lift">
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl ${
                        i % 2 ? "bg-adlm-blue-600/15" : "bg-adlm-orange/15"
                      }`}
                    />
                    <div className="relative text-2xl font-extrabold leading-none text-gradient-warm">
                      {m.year}
                    </div>
                    <div className="relative mt-2 font-medium text-slate-800 dark:text-adlm-dark-text">
                      {m.title}
                    </div>
                  </div>
                </Reveal>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------- page -------------------- */
export default function AboutADLM() {
  // placeholder images (swap later)
  const ph = {
    hero: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=1600&auto=format&fit=crop",
    site: "https://images.unsplash.com/photo-1504306663385-cd3fee2e5af1?q=80&w=1600&auto=format&fit=crop",
    team1: dolapo,
    team2: richard,
    team3:
      "https://images.unsplash.com/photo-1529070538774-1843cb3265df?q=80&w=1200&auto=format&fit=crop",
    team4:
      "https://images.unsplash.com/photo-1529070538774-1843cb3265df?q=80&w=1200&auto=format&fit=crop",
  };

  const values = [
    {
      title: "Excellence",
      desc: "Raising the bar for QS/BIM software quality, training, and support in Africa.",
      icon: (
        <IconStar className="w-5 h-5" />
      ),
    },
    {
      title: "Customer First",
      desc: "Built with Nigerian QS workflows in mind—BESMM4R, NRM2, local pricing & realities.",
      icon: (
        <IconUsers className="w-5 h-5" />
      ),
    },
    {
      title: "Innovation",
      desc: "From Revit & PlanSwift plugins to RateGen & COBie tools—ship, learn, iterate.",
      icon: (
        <IconSparkle className="w-5 h-5" />
      ),
    },
    {
      title: "Reliability",
      desc: "Transparent pricing, responsive support, and tools you can depend on for delivery.",
      icon: (
        <IconShield className="w-5 h-5" />
      ),
    },
  ];

  const leaders = [
    {
      name: "Adedolapo Quasim",
      role: "Chief Executive Officer",
      img: ph.team1,
      linkedin: "https://www.linkedin.com/in/quasim-adedolapo-446367127/",
    },
    {
      name: "Richard Enoch",
      role: "Lead Designer",
      img: ph.team2,
      linkedin: "https://www.linkedin.com/in/richardenoch/",
    },
    {
      name: "Ebunoluwa Fadeyibii",
      role: "Executive Assistant & Operations",
      img: ph.team3,
      linkedin: "https://www.linkedin.com/in/ebunoluwa-fadeyibii/",
    },
    {
      name: "Etti Taiwo",
      role: "Fullstack Developer",
      img: ph.team4,
      linkedin: "https://www.linkedin.com/in/taiwo-etti/",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Seo
        title="About ADLM Studio"
        description="A Nigerian ConTech studio digitising quantity surveying end to end — takeoff, rates, bills, programmes and dashboards — with the training and process firms need to adopt it. 800+ AEC professionals trained since 2019."
        path="/about"
      />
      <style>{styles}</style>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-adlm-navy-tertiary to-adlm-blue-700 text-white">
        <SafeImg
          src={ph.hero}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-40 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 -right-10 w-80 h-80 rounded-full bg-adlm-orange/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-adlm-blue-600/25 blur-3xl animate-float-slow" />
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-20 relative">
          <Reveal>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              About <span className="text-gradient-warm">ADLM</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 max-w-2xl text-blue-100">
              ADLM is a Nigerian ConTech studio that digitises quantity surveying
              end to end — model-based takeoff, rate build-ups, bills,
              programmes and dashboards — and puts the whole workflow on one
              platform. We do not sell a tool and leave. We bring firms the
              software, the training and the process together, so the change
              actually holds.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl">
              {[
                ["800+", "AEC professionals trained"],
                ["10", "products in the suite"],
                ["2019", "building for Nigerian QS"],
                ["NIQS", "Official Technical Partner"],
              ].map(([stat, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-extrabold text-white">{stat}</dt>
                  <dd className="mt-1 text-xs leading-snug text-blue-100/80">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-6 flex gap-3">
              <Link
                to="/products"
                className="inline-flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 ring-1 ring-white/30"
              >
                Explore Products
              </Link>
              <Link
                to="/trainings"
                className="inline-flex items-center rounded-lg bg-adlm-blue-700 hover:bg-[#0050c8] px-4 py-2"
              >
                Training & Events
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MISSION / VISION */}
      <section className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        <div className="grid md:grid-cols-2 gap-6">
          <Reveal>
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200 shadow-depth">
              <h3 className="text-xl font-semibold">Our Mission</h3>
              <p className="mt-2 text-slate-600">
                To digitise the quantity surveying process for African firms —
                improving <b>accuracy, productivity and workflow</b> from
                model-based takeoff through rate build-up, bills and handover —
                and to make that change stick by pairing every tool with the{" "}
                <b>training and process</b> a firm needs to adopt it.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200 shadow-depth">
              <h3 className="text-xl font-semibold">Our Vision</h3>
              <p className="mt-2 text-slate-600">
                To become the leading ConTech ecosystem for the
                continent—connecting{" "}
                <b>BIM, AI, and local market intelligence</b>
                so every QS can deliver world-class results anywhere in Nigeria
                and beyond.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CORE VALUES */}
      <section className="max-w-6xl mx-auto px-4">
        <Reveal>
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-semibold">
              Our Core Values
            </h2>
            <p className="text-slate-600 mt-1">
              Principles that shape how we build, teach, and support our
              community.
            </p>
          </div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={100 * i}>
              <div className="relative spotlight rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-depth hover:shadow-depth-lg transition hover:-translate-y-0.5">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-adlm-blue-700 flex items-center justify-center ring-1 ring-blue-200">
                  {v.icon}
                </div>
                <div className="mt-3 font-medium">{v.title}</div>
                <div className="text-sm text-slate-600 mt-1">{v.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* STRENGTHS — what actually differentiates ADLM.

          Every claim here is one we can stand behind publicly. Client work is
          described, never named: naming a firm on a public page needs that
          firm's agreement, and several engagements have nothing in writing. */}
      <section className="max-w-6xl mx-auto px-4 pt-14">
        <Reveal>
          <div className="text-center">
            <Eyebrow tone="blue">Why firms choose us</Eyebrow>
            <h2 className="mt-3 text-2xl md:text-3xl font-semibold">
              Built for how Nigerian QS firms actually work
            </h2>
            <p className="text-slate-600 dark:text-adlm-dark-muted mt-2 max-w-2xl mx-auto">
              Most construction software is built elsewhere, priced elsewhere,
              and assumes a workflow that is not yours. Ours is not.
            </p>
          </div>
        </Reveal>

        <Stagger gap={0.08} className="grid md:grid-cols-2 gap-4 md:gap-6 mt-8">
          {[
            {
              title: "The whole workflow, not one tool",
              body: "Takeoff from Revit, ArchiCAD, PlanSwift or a flat drawing; rates built from live material and labour prices; bills, programmes and dashboards off the same data. One login, one entitlement, no re-keying between steps.",
            },
            {
              title: "Rates that reflect this market",
              body: "Rate build-ups run on Nigerian material and labour prices you can edit, not on a foreign cost book converted at a guess. The same engine supports international rates when a project needs them.",
            },
            {
              title: "Tools, training and process together",
              body: "Software alone does not change how a firm estimates. Every programme pairs the tools with structured training and a working process, delivered in person or online, so the team keeps using it after we leave.",
            },
            {
              title: "Trusted by the profession",
              body: "Official Technical Partner to the Nigerian Institute of Quantity Surveyors, resource persons on the NIQS professional readiness programme, and 800+ AEC professionals trained through our cohorts and corporate programmes.",
            },
            {
              title: "Proven on real delivery",
              body: "Beyond software: scan-to-BIM as-built documentation delivered for a Lagos data centre, 4D and 5D BIM programmes running with contractors and QS firms, and MEP and HVAC BIM training delivered on site.",
            },
            {
              title: "AI where it earns its place",
              body: "Cost intelligence, bill checking and rate build-up support are metered into every subscription — used where it saves a quantity surveyor real time, not bolted on as a demo.",
            },
          ].map((s) => (
            <StaggerItem key={s.title}>
              <div className="h-full relative spotlight rounded-xl bg-white dark:bg-adlm-dark-panel p-5 ring-1 ring-slate-200 dark:ring-adlm-dark-border shadow-depth">
                <div className="font-semibold text-slate-900 dark:text-adlm-dark-text">
                  {s.title}
                </div>
                <p className="text-sm text-slate-600 dark:text-adlm-dark-muted mt-2 leading-relaxed">
                  {s.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* JOURNEY / TIMELINE — FIXED */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <JourneyTimeline />
      </section>

      {/* LEADERSHIP */}
      <section className="max-w-6xl mx-auto px-4">
        <Reveal>
          <h2 className="text-center text-2xl md:text-3xl font-semibold">
            Leadership Team
          </h2>
          <p className="text-center text-slate-600 mt-1">
            The builders guiding ADLM’s vision and execution.
          </p>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
          {leaders.map((p, i) => (
            <Reveal key={p.name} delay={90 * i}>
              <div className="relative spotlight overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 shadow-depth hover:shadow-depth-lg transition hover:-translate-y-0.5">
                <div className="aspect-[4/3] overflow-hidden rounded-t-xl">
                  <SafeImg
                    src={p.img}
                    alt={p.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="p-4">
                  {p.linkedin ? (
                    <a
                      href={p.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                      title={`Open ${p.name} on LinkedIn`}
                    >
                      {p.name}
                    </a>
                  ) : (
                    <div className="font-medium">{p.name}</div>
                  )}

                  <div className="text-sm text-slate-600">{p.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* NUMBERS (dark band) */}
      <section className="relative overflow-hidden mt-10 bg-adlm-navy-tertiary text-white">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-40 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-1/4 w-72 h-72 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-16 left-1/4 w-72 h-72 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative max-w-6xl mx-auto px-4 py-10">
          <Reveal>
            <h2 className="text-center text-2xl md:text-3xl font-semibold">
              By the Numbers
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mt-6 text-center">
            <Stat label="Years in Practice" value={7} suffix="+" delay={0} />
            <Stat label="Products & Plugins" value={4} suffix="+" delay={80} />
            <Stat label="Happy Learners" value={5000} suffix="+" delay={160} />
            <Stat
              label="Organizations Trained"
              value={50}
              suffix="+"
              delay={240}
            />
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <Reveal>
          <h2 className="text-center text-2xl md:text-3xl font-semibold">
            Why Choose ADLM
          </h2>
        </Reveal>
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mt-6">
          {[
            "Tools built for Nigerian QS standards (BESMM4R, NRM) and realities.",
            "24/7 responsive support and implementation assistance.",
            "Market-tuned RateGen with location-based pricing and vendor insights.",
            "Revit/PlanSwift automation for faster, consistent take-offs.",
            "COBie/LOD workflows for asset information handover.",
            "Hands-on training, internships, and community growth.",
          ].map((t, i) => (
            <Reveal key={i} delay={80 * i}>
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 shadow-depth flex items-start gap-3">
                <span className="mt-1 inline-flex w-6 h-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  ✓
                </span>
                <p className="text-slate-700">{t}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link
              to="http://wa.me/2348106503524"
              className="rounded-lg bg-adlm-blue-700 text-white px-5 py-2 hover:bg-[#0050c8] active:animate-[pop_200ms_ease-out]"
            >
              Talk to Us
            </Link>
            <Link
              to="/products"
              className="rounded-lg px-5 py-2 ring-1 ring-slate-300 bg-white hover:bg-slate-50"
            >
              See Products
            </Link>
          </div>
        </Reveal>
      </section>

      <div className="h-8" />
    </div>
  );
}
