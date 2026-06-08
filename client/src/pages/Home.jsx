// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import FeaturedTrainingBanner from "../components/FeaturedTrainingBanner.jsx";
import { Reveal, TiltCard } from "../components/effects.jsx";

import { useAuth } from "../store.jsx";

/* ---------------------- tiny helpers ---------------------- */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function useInView(ref, rootMargin = "0px") {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { root: null, rootMargin, threshold: 0.2 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

function CountUp({ to = 100, duration = 1200, decimals = 0, suffix = "" }) {
  const [val, setVal] = React.useState(0);
  const started = React.useRef(false);
  const ref = React.useRef(null);
  const inView = useInView(ref, "0px 0px -20% 0px");

  React.useEffect(() => {
    if (started.current || !inView) return;
    started.current = true;

    const start = performance.now();
    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const current = to * eased;
      setVal(current);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [inView, to, duration]);

  const formatted =
    decimals > 0
      ? Math.min(val, to).toFixed(decimals)
      : Math.floor(Math.min(val, to)).toLocaleString();

  return (
    <span ref={ref}>
      {formatted}
      {suffix}
    </span>
  );
}

/**
 * Hero uses a background image at /public/hero-construction.jpg.
 * Swap the URL if you prefer a different image.
 */
const FALLBACK_APP_URL =
  "https://drive.google.com/file/d/1dICSLBCbSERq6VwLmCvrisPjSKq_sg8v/view?usp=drive_link";

/* Feature highlight cards shown on the right of the hero */
const HERO_CARDS = [
  {
    icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    title: "Rate Build-ups",
    desc: "Instant rate generation for accurate cost estimates",
  },
  {
    icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z",
    title: "2D/3D Take-off",
    desc: "Revit & PlanSwift plugins for digital measurement",
  },
  {
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    title: "Pro Training",
    desc: "Physical & online training for your team",
  },
  {
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    title: "99.9% Uptime",
    desc: "Reliable cloud infrastructure you can depend on",
  },
];

export default function Home() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const isAuthed = Boolean(accessToken || (user && user.email));

  const [appUrl, setAppUrl] = React.useState(FALLBACK_APP_URL);
  React.useEffect(() => {
    fetch("/settings/mobile-app-url")
      .then((r) => r.json())
      .then((d) => {
        if (d?.mobileAppUrl) setAppUrl(d.mobileAppUrl);
      })
      .catch(() => {});
  }, []);

  // Pointer parallax for the hero decorative layers. Subtle (~few %), and
  // purely pointer-driven so it doesn't trigger on reduced-motion devices.
  const heroRef = React.useRef(null);
  function onHeroMove(e) {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty(
      "--px",
      ((e.clientX - r.left) / r.width - 0.5).toFixed(3),
    );
    el.style.setProperty(
      "--py",
      ((e.clientY - r.top) / r.height - 0.5).toFixed(3),
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 dark:bg-adlm-dark-bg dark:text-adlm-dark-text">
      {/* local keyframes for the hero entrance fades */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ══════════ HERO — Full-width modern SaaS ══════════ */}
      <section
        ref={heroRef}
        onMouseMove={onHeroMove}
        className="relative w-full min-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Background layers */}
        <div
          className="absolute inset-0 bg-[url('/hero-construction.jpg')] bg-cover bg-center scale-105"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(5,17,31,0.92) 0%, rgba(9,30,57,0.88) 50%, rgba(5,17,31,0.95) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Blueprint grid — on-brand for AEC/QS, faded toward edges */}
        <div
          className="absolute inset-0 grid-overlay mask-radial opacity-60"
          aria-hidden="true"
        />

        {/* Decorative floating shapes — wrappers do pointer parallax,
            inner blobs do the idle float so the two transforms compose. */}
        <div
          className="absolute top-20 right-[10%]"
          aria-hidden="true"
          style={{
            transform:
              "translate3d(calc(var(--px,0)*40px), calc(var(--py,0)*40px), 0)",
          }}
        >
          <div className="w-64 h-64 rounded-full opacity-[0.07] bg-adlm-blue-600 blur-3xl animate-float" />
        </div>
        <div
          className="absolute bottom-32 left-[5%]"
          aria-hidden="true"
          style={{
            transform:
              "translate3d(calc(var(--px,0)*-55px), calc(var(--py,0)*-35px), 0)",
          }}
        >
          <div className="w-56 h-56 rounded-full opacity-[0.09] bg-adlm-orange blur-3xl animate-float-slow" />
        </div>
        <div
          className="absolute top-1/2 right-[28%]"
          aria-hidden="true"
          style={{
            transform:
              "translate3d(calc(var(--px,0)*28px), calc(var(--py,0)*-28px), 0)",
          }}
        >
          <div className="w-32 h-32 rounded-full opacity-[0.05] bg-white blur-2xl animate-float" />
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-16 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left — Text + CTA */}
              <div
                className="opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                style={{ animationDelay: "100ms" }}
              >
                {/* Badge */}
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{
                    animationDelay: "150ms",
                    backgroundColor: "rgba(232,106,39,0.15)",
                    color: "#E86A27",
                    border: "1px solid rgba(232,106,39,0.3)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-adlm-orange animate-pulse" />
                  Trusted by 1,000+ QS Professionals
                </div>

                <h1
                  className="text-3xl sm:text-4xl lg:text-[3.2rem] xl:text-[3.5rem] font-bold leading-[1.12] tracking-tight text-white opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "250ms" }}
                >
                  Digitizing Quantity Surveying for{" "}
                  <span className="text-gradient-warm">Faster</span>, Defensible
                  Cost Management
                </h1>

                <p
                  className="mt-5 text-base sm:text-lg text-white/80 max-w-xl leading-relaxed opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "350ms" }}
                >
                  ADLM STUDIO builds smart digital tools made specifically for
                  <b className="text-white"> Quantity Surveyors</b>. We simplify
                  everyday work like material scheduling, bill preparation,
                  valuation, and quantification so you can get things done
                  faster, easier, and with far less stress. Our goal is simple!
                  We fully digitize the quantity surveying process while
                  improving accuracy, productivity, and overall workflow in the
                  construction industry.
                </p>

                {/* CTA Buttons */}
                <div
                  className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "450ms" }}
                >
                  <Link
                    to={isAuthed ? "/purchase" : "/signup"}
                    className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] shadow-glow-orange"
                    style={{ backgroundColor: "#E86A27" }}
                  >
                    {isAuthed ? "Get Started" : "Get Started Free"}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </Link>

                  <Link
                    to="/quote"
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold border-2 border-white/30 text-white transition-all hover:bg-white/10 hover:border-white/50 hover:-translate-y-0.5"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    Get Quotation
                  </Link>

                  <Link
                    to="/products"
                    className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-medium text-white/80 transition hover:text-white"
                  >
                    Explore Products
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Right — Feature highlight cards with 3D tilt (desktop) */}
              <div
                className="hidden lg:grid grid-cols-2 gap-4 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                style={{ animationDelay: "550ms" }}
              >
                {HERO_CARDS.map((card, idx) => (
                  <TiltCard
                    key={idx}
                    max={10}
                    className="group rounded-xl p-5 glass-dark transition-colors duration-300 hover:bg-white/[0.12]"
                  >
                    <div
                      className="tilt-layer w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                      style={{ backgroundColor: "rgba(232,106,39,0.15)" }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        style={{ color: "#E86A27" }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d={card.icon}
                        />
                      </svg>
                    </div>
                    <div className="font-semibold text-white text-sm">
                      {card.title}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {card.desc}
                    </div>
                  </TiltCard>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats ribbon — floating glass card at the bottom of the hero */}
        <div className="relative z-10 px-5 sm:px-8 lg:px-12 pb-8">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-2xl glass-dark shadow-depth-lg overflow-hidden divide-x divide-white/10 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-white/10 sm:[&>*]:border-t-0">
              {[
                {
                  node: <CountUp to={4} suffix="+" />,
                  label: "Software Tools",
                  icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
                },
                {
                  node: <CountUp to={1000} suffix="+" />,
                  label: "QS Professionals",
                  icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
                },
                {
                  node: <CountUp to={10} suffix="+" />,
                  label: "Countries",
                  icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064",
                },
                {
                  node: <CountUp to={99.9} decimals={1} suffix="%" />,
                  label: "Uptime",
                  icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                },
              ].map((stat, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate("/testimonials")}
                  className="flex items-center gap-3 px-4 sm:px-6 py-5 text-left transition-colors hover:bg-white/[0.06] cursor-pointer"
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(35,156,255,0.15)" }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-adlm-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={stat.icon}
                      />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-lg sm:text-xl font-bold text-white">
                      {stat.node}
                    </span>
                    <span className="block text-[11px] sm:text-xs text-white/60">
                      {stat.label}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FeaturedTrainingBanner />

      {/* WHY CHOOSE — premium bento grid */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <Reveal className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-adlm-orange bg-adlm-orange/10 border border-adlm-orange/20">
            Why Choose Us
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-adlm-navy dark:text-white">
            The Future of Quantity Surveying is{" "}
            <span className="text-gradient-warm">Digital</span>
          </h2>
          <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
            At <b className="text-adlm-navy dark:text-white">ADLM Studio</b>, we’re not just talking
            about the future — we’re building it. Our tools make valuation tracking, construction
            cost management, and payment certificate preparation smoother, faster, and more efficient.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <BentoCard
            delay={0}
            accent="orange"
            title="Smarter Takeoff Tools"
            text="Say goodbye to costly errors and manual stress. With our 2D & 3D takeoff software and powerful plugins, quantity surveyors achieve faster, more accurate quantification and cost estimation — with confidence."
            icon={
              <>
                <path d="M3 21v-6a4 4 0 014-4h10a4 4 0 014 4v6" />
                <circle cx="7.5" cy="7" r="3" />
                <circle cx="16.5" cy="7" r="3" />
              </>
            }
          />
          <BentoCard
            delay={90}
            accent="blue"
            title="BIM-Focused Training"
            text="We don’t just give you tools — we show you how to use them. Through hands-on sessions and BIM-focused learning, ADLM Studio helps QS professionals move into modern digital workflows with ease, confidence, and real-world skill."
            icon={
              <>
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
              </>
            }
          />
          <BentoCard
            delay={180}
            accent="orange"
            title="Valuation & Cost Management"
            text="Track valuations, manage construction costs, and prepare payment certificates in one place — with the history, updates, and audit trails you can defend to clients, auditors, or management."
            icon={
              <>
                <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" />
                <path d="M9 12l2 2 4-4" />
              </>
            }
          />
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-adlm-navy text-white">
        <div
          className="absolute inset-0 grid-overlay mask-radial opacity-50"
          aria-hidden="true"
        />
        <div
          className="absolute -top-24 left-1/3 w-96 h-96 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 right-1/4 w-80 h-80 rounded-full bg-adlm-orange/20 blur-3xl animate-float-slow"
          aria-hidden="true"
        />
        <Reveal className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Ready to ditch the stress? Start building smarter with ADLM STUDIO.
          </h3>
          <p className="mt-3 text-white/80 max-w-2xl mx-auto">
            Join hundreds of QS professionals using ADLM to deliver accurate
            results — every time.
          </p>
          <div className="mt-8">
            <Link
              to="/products"
              className="group inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] shadow-glow-orange"
              style={{ backgroundColor: "#E86A27" }}
            >
              Get Started Today
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/* ----------- presentational helpers ----------- */

function BentoCard({
  icon,
  title,
  text,
  accent = "orange",
  delay = 0,
  className = "",
}) {
  const isBlue = accent === "blue";
  return (
    <Reveal delay={delay} className={`h-full ${className}`}>
      <TiltCard
        max={6}
        className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-depth transition-shadow duration-300 hover:shadow-depth-lg dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
      >
        {/* corner accent glow */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-50 transition-opacity duration-300 group-hover:opacity-80 ${isBlue ? "bg-adlm-blue-600/20" : "bg-adlm-orange/20"}`}
        />
        <div
          className={`tilt-layer relative inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${isBlue ? "bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-600" : "bg-adlm-orange/10 text-adlm-orange"}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        </div>
        <h3 className="relative text-base sm:text-lg font-semibold text-adlm-navy dark:text-white">
          {title}
        </h3>
        <p className="relative mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {text}
        </p>
      </TiltCard>
    </Reveal>
  );
}
