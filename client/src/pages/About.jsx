// src/pages/AboutADLM.jsx
import React from "react";
import { Link } from "react-router-dom";
import dolapo from "../assets/team/Dola.jpeg";
import richard from "../assets/team/Richard.jpg";
import gladys from "../assets/team/Gladys.JPG";

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
      { threshold }
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
          "https://images.unsplash.com/photo-1523419409543-9e4b7a63e27a?q=80&w=1600&auto=format&fit=crop"
        )
      }
    />
  );
}

function JourneyTimeline() {
  const items = [
    { year: "2019", title: "ADLM Studio was founded" },
    { year: "2020", title: "Started QS Software Teaining" },
    { year: "2022", title: "Launched PlanSwift plugin" },
    { year: "2024", title: "Launched Revit Plugin for Quantity Takeoff" },
    { year: "2025", title: "Launched ADLM Rate Gen" },
  ];

  // Reveal hook for the whole block (drives the line draw)
  const { ref, shown } = useInView(0.2);

  return (
    <section className="max-w-6xl mx-auto px-4 py-14">
      <Reveal>
        <h2 className="text-center text-2xl md:text-3xl font-semibold">
          Our Journey
        </h2>
        <p className="text-center text-slate-600 mt-1">
          Key milestones in our growth story
        </p>
      </Reveal>

      <div ref={ref} className="relative mt-10">
        {/* Center spine */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 w-1 rounded-full bg-gradient-to-b from-blue-600 to-blue-800"
          style={{
            height: shown ? "100%" : 0,
            animation: shown
              ? "line-grow 900ms cubic-bezier(.2,.7,.2,1) forwards"
              : "none",
          }}
          aria-hidden="true"
        />

        {/* Items */}
        <ol className="space-y-12">
          {items.map((m, i) => {
            const left = i % 2 === 0;
            const delay = 120 * i;
            return (
              <li key={m.year} className="relative">
                {/* dot */}
                <span
                  className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-700"
                  style={{
                    boxShadow: "0 0 0 6px rgba(59,130,246,.25)",
                    animation: shown
                      ? `dot-pop 480ms ${200 + delay}ms ease-out both`
                      : "none",
                  }}
                  aria-hidden="true"
                />

                {/* left/right card */}
                <div
                  className={`relative w-full md:w-[calc(50%-2rem)] 
                    ${
                      left
                        ? "md:pr-10 md:ml-0 md:mr-auto"
                        : "md:pl-10 md:ml-auto md:mr-0"
                    }`}
                  style={{
                    animation: shown
                      ? `${left ? "slide-left" : "slide-right"} 560ms ${
                          120 + delay
                        }ms cubic-bezier(.2,.7,.2,1) both`
                      : "none",
                  }}
                >
                  <div
                    className={`hidden md:block absolute top-1/2 -translate-y-1/2 ${
                      left ? "right-0" : "left-0"
                    } w-10 h-px bg-blue-200`}
                  />
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm px-5 py-4">
                    <div className="text-blue-700 font-semibold">{m.year}</div>
                    <div className="text-slate-700">{m.title}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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
    // team3: gladys,
    team4:
      "https://images.unsplash.com/photo-1529070538774-1843cb3265df?q=80&w=1200&auto=format&fit=crop",
  };

  const values = [
    {
      title: "Excellence",
      desc: "Raising the bar for QS/BIM software quality, training, and support in Africa.",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeWidth="2"
            d="M12 3l3.09 6.26L22 10l-5 4.9L18.18 22 12 18.77 5.82 22 7 14.9 2 10l6.91-0.74L12 3z"
          />
        </svg>
      ),
    },
    {
      title: "Customer First",
      desc: "Built with Nigerian QS workflows in mind—BESMM4R, NRM2, local pricing & realities.",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeWidth="2"
            d="M12 12c2.8 0 5-2.2 5-5S14.8 2 12 2 7 4.2 7 7s2.2 5 5 5z"
          />
          <path strokeWidth="2" d="M3 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      ),
    },
    {
      title: "Innovation",
      desc: "From Revit & PlanSwift plugins to RateGen & COBie tools—ship, learn, iterate.",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeWidth="2"
            d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
          />
        </svg>
      ),
    },
    {
      title: "Reliability",
      desc: "Transparent pricing, responsive support, and tools you can depend on for delivery.",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeWidth="2"
            d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          />
        </svg>
      ),
    },
  ];

  const leaders = [
    {
      name: "Adedolapo Quasim",
      role: "Founder & Team Lead",
      img: ph.team1,
      linkedin: "https://www.linkedin.com/in/quasim-adedolapo-446367127/",
    },
    {
      name: "Richard Enoch",
      role: "Product Designer",
      img: ph.team2,
      linkedin: "https://www.linkedin.com/in/richardenoch/",
    },
    // {
    //   name: "Gladys Terungwa",
    //   role: "Product Manager",
    //   img: ph.team3,
    //   linkedin: "https://www.linkedin.com/in/gladys-terungwa-9697b6313/",
    // },
    {
      name: "Etti Taiwo",
      role: "Fullstack Developer",
      img: ph.team4,
      linkedin: "https://www.linkedin.com/in/taiwo-etti/",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{styles}</style>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-800 to-blue-700 text-white">
        <SafeImg
          src={ph.hero}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-20 relative">
          <Reveal>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              About <span className="text-blue-200">ADLM</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 max-w-2xl text-blue-100">
              ADLM is a Nigerian ConTech studio building practical tools for
              Quantity Surveyors and AEC teams—BIM plugins, cost automation,
              rate build-ups, training, and cloud workflows tailored for the
              African market.
            </p>
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
                className="inline-flex items-center rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2"
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
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold">Our Mission</h3>
              <p className="mt-2 text-slate-600">
                To empower Quantity Surveyors and construction teams with{" "}
                <b>Africa-first</b> digital tools that improve{" "}
                <b>speed, accuracy, and profitability</b>—from model-based
                takeoff to rate build-ups and asset handover.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
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
              <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-sm hover:shadow-lg transition hover:-translate-y-0.5">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center ring-1 ring-blue-200">
                  {v.icon}
                </div>
                <div className="mt-3 font-medium">{v.title}</div>
                <div className="text-sm text-slate-600 mt-1">{v.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
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
              <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-lg transition hover:-translate-y-0.5">
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
      <section className="mt-10 bg-blue-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
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
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 shadow-sm flex items-start gap-3">
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
              className="rounded-lg bg-blue-600 text-white px-5 py-2 hover:bg-blue-700 active:animate-[pop_200ms_ease-out]"
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
