// src/pages/Home.jsx
import React from "react";
import PageSeo from "../components/PageSeo.jsx";
import { organizationSchema, websiteSchema } from "../lib/schema.js";
import { Link, useNavigate } from "react-router-dom";
import FeaturedTrainingBanner from "../components/FeaturedTrainingBanner.jsx";
import { Reveal, Stagger, StaggerItem, TiltCard } from "../components/effects.jsx";
import { Eyebrow, GlowTile } from "../components/brand.jsx";

import { useAuth } from "../store.jsx";
import {
  IconArrowRight,
  IconBook,
  IconCalculator,
  IconChevronRight,
  IconCube,
  IconGlobe,
  IconGraduation,
  IconLayout,
  IconShieldCheck,
  IconUsers,
} from "../components/icons.jsx";

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
    icon: IconCalculator,
    title: "Rate Build-ups",
    desc: "Instant rate generation for accurate cost estimates",
  },
  {
    icon: IconLayout,
    title: "2D/3D Take-off",
    desc: "Revit & PlanSwift plugins for digital measurement",
  },
  {
    icon: IconBook,
    title: "Pro Training",
    desc: "Physical & online training for your team",
  },
  {
    icon: IconShieldCheck,
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
      {/* No breadcrumb: this is the root, and a trail of one describes nothing.
          Organization carries RC 7440343, Lagos, and the LinkedIn and YouTube
          profiles, which is how a search engine ties this site to the company. */}
      <PageSeo path="/" jsonLd={[organizationSchema(), websiteSchema()]} />
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
              {/* Left — Text + CTA.

                  Entrances run through <Stagger>, not the old
                  `opacity-0 motion-safe:animate-[…]` pairing. That pairing was
                  a live bug: `.opacity-0` applies unconditionally while the
                  animation sits inside @media(prefers-reduced-motion:
                  no-preference), so a visitor with reduce-motion on never got
                  the animation that was supposed to reveal the text — the whole
                  hero rendered at zero opacity, permanently. */}
              <Stagger gap={0.09}>
                {/* Eyebrow rather than the old orange pill. Orange is the
                    interrupt in this system and there is already one on the
                    page — the primary CTA below. Two orange elements at
                    different sizes is the thing the collateral never does. */}
                <StaggerItem>
                  <div className="mb-6 inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-adlm-blue-500" />
                    <Eyebrow tone="onDark">Trusted by 1,000+ QS Professionals</Eyebrow>
                  </div>
                </StaggerItem>

                <StaggerItem>
                  <h1 className="text-3xl sm:text-4xl lg:text-[3.2rem] xl:text-[3.5rem] font-bold leading-[1.12] tracking-tight text-white">
                    Digitizing Quantity Surveying for{" "}
                    <span className="text-adlm-blue-500">Faster</span>, Defensible
                    Cost Management
                  </h1>
                </StaggerItem>

                <StaggerItem>
                  <p className="mt-5 text-base sm:text-lg text-white/80 max-w-xl leading-relaxed">
                    ADLM STUDIO builds smart digital tools made specifically for
                    <b className="text-white"> Quantity Surveyors</b>. We simplify
                    everyday work like material scheduling, bill preparation,
                    valuation, and quantification so you can get things done
                    faster, easier, and with far less stress. Our goal is simple!
                    We fully digitize the quantity surveying process while
                    improving accuracy, productivity, and overall workflow in the
                    construction industry.
                  </p>
                </StaggerItem>

                {/* CTA Buttons */}
                <StaggerItem>
                  <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
                  <Link
                    to={isAuthed ? "/purchase" : "/signup"}
                    className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] shadow-glow-orange"
                    style={{ backgroundColor: "#E86A27" }}
                  >
                    {isAuthed ? "Get Started" : "Get Started Free"}
                    <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <Link
                    to="/quote"
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold border-2 border-white/30 text-white transition-all hover:bg-white/10 hover:border-white/50 hover:-translate-y-0.5"
                  >
                    <IconCalculator className="h-4 w-4" />
                    Get Quotation
                  </Link>

                  <Link
                    to="/products"
                    className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-medium text-white/80 transition hover:text-white"
                  >
                    Explore Products
                    <IconChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  </div>
                </StaggerItem>
              </Stagger>

              {/* Right — the hero's subject.

                  Product mode portrays one lit object floating over a podium.
                  The four cards stay (they carry real information) but now read
                  as a single cluster hanging in light rather than four separate
                  panes: one shared podium glow, one slow float, tilt on each.
                  No hexagon field here — hexagons are the corporate-mode
                  texture, and this composition is product mode. */}
              <Reveal delay={420} className="hidden lg:block">
                <GlowTile className="w-full" glow="#005be3">
                  <div className="grid grid-cols-2 gap-4">
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
                      <card.icon className="h-5 w-5" />
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
                </GlowTile>
              </Reveal>
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
                  icon: IconCube,
                },
                {
                  node: <CountUp to={1000} suffix="+" />,
                  label: "QS Professionals",
                  icon: IconUsers,
                },
                {
                  node: <CountUp to={10} suffix="+" />,
                  label: "Countries",
                  icon: IconGlobe,
                },
                {
                  node: <CountUp to={99.9} decimals={1} suffix="%" />,
                  label: "Uptime",
                  icon: IconShieldCheck,
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
                    <stat.icon className="h-4 w-4 text-adlm-blue-600" />
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
            icon={IconUsers}
          />
          <BentoCard
            delay={90}
            accent="blue"
            title="BIM-Focused Training"
            text="We don’t just give you tools — we show you how to use them. Through hands-on sessions and BIM-focused learning, ADLM Studio helps QS professionals move into modern digital workflows with ease, confidence, and real-world skill."
            icon={IconGraduation}
          />
          <BentoCard
            delay={180}
            accent="orange"
            title="Valuation & Cost Management"
            text="Track valuations, manage construction costs, and prepare payment certificates in one place — with the history, updates, and audit trails you can defend to clients, auditors, or management."
            icon={IconShieldCheck}
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
              <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/* ----------- presentational helpers ----------- */

function BentoCard({
  icon: Icon,
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
          {Icon ? <Icon className="w-6 h-6" /> : null}
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
