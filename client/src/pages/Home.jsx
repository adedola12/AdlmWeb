// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import FeaturedTrainingBanner from "../components/FeaturedTrainingBanner.jsx";

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

export default function Home() {
  const { accessToken, user } = useAuth();
  const isAuthed = Boolean(accessToken || (user && user.email));

  const [appUrl, setAppUrl] = React.useState(FALLBACK_APP_URL);
  React.useEffect(() => {
    fetch("/settings/mobile-app-url")
      .then((r) => r.json())
      .then((d) => { if (d?.mobileAppUrl) setAppUrl(d.mobileAppUrl); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* local keyframes for subtle fades */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ══════════ HERO — Full-width modern SaaS ══════════ */}
      <section className="relative w-full min-h-[92vh] flex flex-col overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-[url('/hero-construction.jpg')] bg-cover bg-center" aria-hidden="true" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(5,17,31,0.92) 0%, rgba(9,30,57,0.88) 50%, rgba(5,17,31,0.95) 100%)" }} aria-hidden="true" />

        {/* Decorative floating shapes */}
        <div className="absolute top-20 right-[10%] w-64 h-64 rounded-full opacity-[0.04] bg-adlm-blue-600 blur-3xl" aria-hidden="true" />
        <div className="absolute bottom-32 left-[5%] w-48 h-48 rounded-full opacity-[0.05] bg-adlm-orange blur-3xl" aria-hidden="true" />
        <div className="absolute top-1/2 right-[25%] w-32 h-32 rounded-full opacity-[0.03] bg-white blur-2xl" aria-hidden="true" />

        {/* Main content */}
        <div className="relative z-10 flex-1 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-16 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

              {/* Left — Text + CTA */}
              <div className="opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]" style={{ animationDelay: "100ms" }}>
                {/* Badge */}
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "150ms", backgroundColor: "rgba(232,106,39,0.15)", color: "#E86A27", border: "1px solid rgba(232,106,39,0.3)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-adlm-orange animate-pulse" />
                  Trusted by 1,000+ QS Professionals
                </div>

                <h1
                  className="text-3xl sm:text-4xl lg:text-[3.2rem] xl:text-[3.5rem] font-bold leading-[1.12] tracking-tight text-white opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "250ms" }}
                >
                  Digitizing Quantity Surveying for{" "}
                  <span style={{ color: "#E86A27" }}>Faster</span>,{" "}
                  Defensible Cost Management
                </h1>

                <p
                  className="mt-5 text-base sm:text-lg text-white/80 max-w-xl leading-relaxed opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "350ms" }}
                >
                  ADLM Studio provides a comprehensive digital toolkit that helps{" "}
                  <b className="text-white">Quantity Surveyors</b> measure, price,
                  and manage projects quickly and accurately. From instant rate
                  build-ups to 2D/3D take-off and professional training, we bring
                  everything you need into one easy-to-use platform — built for the
                  Nigerian market.
                </p>

                {/* CTA Buttons */}
                <div
                  className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                  style={{ animationDelay: "450ms" }}
                >
                  {isAuthed ? (
                    <Link
                      to="/purchase"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/25"
                      style={{ backgroundColor: "#E86A27" }}
                    >
                      Get Started
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </Link>
                  ) : (
                    <Link
                      to="/signup"
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/25"
                      style={{ backgroundColor: "#E86A27" }}
                    >
                      Get Started Free
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </Link>
                  )}

                  <Link
                    to="/quote"
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold border-2 border-white/30 text-white transition-all hover:bg-white/10 hover:border-white/50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Get Quotation
                  </Link>

                  <Link
                    to="/products"
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-medium text-white/80 transition hover:text-white"
                  >
                    Explore Products
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>

              {/* Right — Feature highlight cards (desktop) */}
              <div
                className="hidden lg:grid grid-cols-2 gap-4 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
                style={{ animationDelay: "550ms" }}
              >
                {[
                  { icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z", title: "Rate Build-ups", desc: "Instant rate generation for accurate cost estimates" },
                  { icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z", title: "2D/3D Take-off", desc: "Revit & PlanSwift plugins for digital measurement" },
                  { icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", title: "Pro Training", desc: "Physical & online training for your team" },
                  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "99.9% Uptime", desc: "Reliable cloud infrastructure you can depend on" },
                ].map((card, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl p-5 backdrop-blur-sm transition-all hover:scale-[1.03] hover:bg-white/[0.12]"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(232,106,39,0.15)" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" style={{ color: "#E86A27" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} /></svg>
                    </div>
                    <div className="font-semibold text-white text-sm">{card.title}</div>
                    <div className="text-xs text-white/60 mt-1">{card.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats ribbon — full width, bottom of hero */}
        <div className="relative z-10 bg-white border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                { node: <CountUp to={4} suffix="+" />, label: "Software Tools", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
                { node: <CountUp to={1000} suffix="+" />, label: "QS Professionals", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
                { node: <CountUp to={10} suffix="+" />, label: "Countries", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" },
                { node: <CountUp to={99.9} decimals={1} suffix="%" />, label: "Uptime", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
              ].map((stat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-4 sm:px-6 py-5 sm:py-6 border-r border-slate-100 last:border-r-0"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(0,91,227,0.08)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-adlm-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} /></svg>
                  </div>
                  <div>
                    <div className="text-lg sm:text-xl font-bold text-adlm-navy">{stat.node}</div>
                    <div className="text-[11px] sm:text-xs text-slate-500">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FeaturedTrainingBanner />

      {/* WHY CHOOSE */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div
          className="text-center opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="text-xl sm:text-2xl font-semibold text-adlm-navy">
            Why QS Professionals Choose ADLM Studio
          </h2>
        </div>
        <p
          className="mt-3 text-slate-600 max-w-2xl mx-auto text-center opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
          style={{ animationDelay: "220ms" }}
        >
          A single platform that unifies rate build-ups, digital take-off,
          learning, certifications and team management—so QS teams deliver
          accurate, defensible numbers, faster.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            delay="140ms"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M3 7h18v10H3z" />
                <path d="M7 7V3h10v4" />
              </svg>
            }
            title="Everything You Need in One Place"
            text="No need to jump between software. Access RateGen, Revit & PlanSwift plugins,
training, certifications, and reporting — all with one login."
          />
          <FeatureCard
            delay="200ms"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            }
            title="Built for Nigerian Reality"
            text="Get accurate material and labour rates tailored to each geopolitical zone. Every
rate comes with history, updates, and audit trails you can defend."
          />
          <FeatureCard
            delay="260ms"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M3 21v-6a4 4 0 014-4h10a4 4 0 014 4v6" />
                <circle cx="7.5" cy="7" r="3" />
                <circle cx="16.5" cy="7" r="3" />
              </svg>
            }
            title="Work Better as a Team"
            text="Manage team roles, learning progress, and project permissions. Keep everything
synced in the cloud so your team stays organized."
          />
          <FeatureCard
            delay="320ms"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
            title="Data You Can Stand On"
            text="Export BoQs, reports, and logs you can proudly present to clients, auditors, or
management."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-adlm-navy text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 text-center">
          <h3 className="text-xl sm:text-2xl font-semibold">
            Ready to work faster and defend your numbers with confidence?
          </h3>
          <p className="mt-2 text-white/90 max-w-2xl mx-auto">
            Join hundreds of QS professionals using ADLM to deliver accurate
            results — every time.
          </p>
          <div className="mt-6">
            <Link
              to="/products"
              className="inline-block bg-white text-adlm-blue-700 rounded px-5 py-2 font-medium hover:bg-blue-50 transition"
            >
              Get Started Today
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------- presentational helpers ----------- */

function Stat({ valueNode, label }) {
  const navigate = useNavigate();

  return (
    <div className="px-4 py-4 text-center">
      <div className="text-xl sm:text-2xl font-semibold">{valueNode}</div>
      <div
        className="text-xs sm:text-sm text-slate-600 cursor-pointer hover:underline"
        onClick={() => navigate("/testimonials")}
        role="button"
      >
        {label}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, text, delay = "0ms" }) {
  return (
    <div
      className="
        rounded-lg border border-slate-200 bg-white p-5 shadow-sm
        transition
        hover:-translate-y-0.5
        hover:shadow-2xl hover:shadow-blue-500/15
        opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]
        cursor-pointer
      "
      style={{ animationDelay: delay }}
    >
      <div className="text-adlm-blue-700">{icon}</div>
      <div className="mt-3 font-medium">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{text}</div>
    </div>
  );
}
