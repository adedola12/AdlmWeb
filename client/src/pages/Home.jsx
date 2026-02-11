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
export default function Home() {
  const { accessToken, user } = useAuth();
  const isAuthed = Boolean(accessToken || (user && user.email));

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* local keyframes for subtle fades */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* HERO */}
      <section className="relative bg-blue-900 text-white">
        {/* background + overlay */}
        <div
          className="absolute inset-0 bg-[url('/hero-construction.jpg')] bg-cover bg-center opacity-40"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-blue-900/70" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-24 sm:pt-24 sm:pb-28">
          <div
            className="max-w-3xl opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
            style={{ animationDelay: "120ms" }}
          >
            <FeaturedTrainingBanner />
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
              style={{ animationDelay: "220ms" }}
            >
              Digitizing Quantity Surveying for
              <br className="hidden sm:block" />
              Faster, Defensible Cost Management
            </h1>
            <p
              className="mt-4 text-white/90 max-w-2xl opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
              style={{ animationDelay: "320ms" }}
            >
              ADLM Studio provides a comprehensive digital toolkit that helps
              <b> Quantity Surveyors </b>measure, price, and manage projects
              quickly and accurately. From instant rate build-ups to 2D/3D
              take-off and professional training, we bring everything you need
              into one easy-to-use platform—built for the Nigerian market.
            </p>
            <div
              className="mt-6 flex flex-wrap items-center gap-3 opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
              style={{ animationDelay: "420ms" }}
            >
              <Link
                to="/products"
                className="inline-flex items-center gap-2 rounded bg-white text-blue-700 px-4 py-2 font-medium hover:bg-blue-50 transition"
              >
                Explore Products
              </Link>
              <Link
                to="https://drive.google.com/file/d/1dICSLBCbSERq6VwLmCvrisPjSKq_sg8v/view?usp=drive_link"
                className="inline-flex items-center gap-2 rounded bg-white text-blue-700 px-4 py-2 font-medium hover:bg-blue-50 transition"
              >
                Download Mobile App
              </Link>
              {!isAuthed && (
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded border border-white/40 px-4 py-2 font-medium hover:bg-white/10 transition"
                >
                  Sign up
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="relative z-10 bg-white text-blue-900">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200">
              <Stat label="Tools" valueNode={<CountUp to={4} suffix="+" />} />
              <Stat
                label="QS Professionals"
                valueNode={<CountUp to={1000} suffix="+" />}
              />
              <Stat
                label="Countries"
                valueNode={<CountUp to={10} suffix="+" />}
              />
              <Stat
                label="Uptime"
                valueNode={<CountUp to={99.9} decimals={1} suffix="%" />}
              />
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div
          className="text-center opacity-0 motion-safe:animate-[fade-in-up_700ms_ease-out_forwards]"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="text-xl sm:text-2xl font-semibold text-blue-900">
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
      <section className="bg-blue-900 text-white">
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
              className="inline-block bg-white text-blue-700 rounded px-5 py-2 font-medium hover:bg-blue-50 transition"
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
      <div className="text-blue-700">{icon}</div>
      <div className="mt-3 font-medium">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{text}</div>
    </div>
  );
}
