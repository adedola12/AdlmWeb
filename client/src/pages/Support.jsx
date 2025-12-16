// src/pages/Support.jsx
import React from "react";
import { Link } from "react-router-dom";
import {
  FaLinkedin,
  FaXTwitter,
  FaYoutube,
  FaWhatsapp,
  FaInstagram,
  FaArrowRight,
} from "react-icons/fa6";

const WHATSAPP_NUMBER = "2348106503524";

function waLink(text = "Hi ADLM Support, I need help.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

const socials = [
  {
    name: "LinkedIn",
    desc: "Updates, events, and professional community.",
    icon: FaLinkedin,
    href: "https://www.linkedin.com/company/adlm-studio", // <-- change
    badge: "Recommended",
  },
  {
    name: "X (Twitter)",
    desc: "News, product drops, quick updates.",
    icon: FaXTwitter,
    href: "https://x.com/ADLMStudio", // <-- change
  },
  {
    name: "YouTube",
    desc: "Tutorials, walkthroughs, and trainings.",
    icon: FaYoutube,
    href: "https://www.youtube.com/@ADLMStudio", // <-- change
    badge: "Tutorials",
  },
  {
    name: "WhatsApp",
    desc: "Live support and enquiries.",
    icon: FaWhatsapp,
    href: waLink("Hi ADLM Support, I need help."),
    badge: "Fastest",
  },
  {
    name: "Instagram",
    desc: "Behind the scenes, flyers, highlights.",
    icon: FaInstagram,
    href: "https://www.instagram.com/adlmstudio", // <-- change
  },
];

export default function Support() {
  return (
    <div className="w-full">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 text-white p-8 md:p-12 shadow-lg">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative">
          <p className="text-xs tracking-widest uppercase text-white/70">
            ADLM Support
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold leading-tight">
            Need help? Start with the ChatBot for instant answers.
          </h1>
          <p className="mt-3 text-white/80 max-w-2xl">
            Use the Help chat button on the right side of the page for quick
            navigation (products, courses, trainings). If you still need a
            human, reach us on any channel below.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={waLink("Hi ADLM Support, I need help with...")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-white/90 transition"
            >
              WhatsApp Live Support <FaArrowRight />
            </a>

            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15 transition"
            >
              Browse Products <FaArrowRight />
            </Link>

            <Link
              to="/learn"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15 transition"
            >
              Go to Learn <FaArrowRight />
            </Link>
          </div>
        </div>
      </div>

      {/* Social Cards */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {socials.map((s) => {
          const Icon = s.icon;
          return (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-2xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:scale-105 transition">
                      <Icon className="text-xl" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {s.name}
                        </h3>
                        {s.badge && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                            {s.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{s.desc}</p>
                    </div>
                  </div>

                  <div className="text-slate-400 group-hover:text-slate-900 transition">
                    <FaArrowRight />
                  </div>
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  Tap to open in a new tab
                </div>
              </div>

              {/* Accent bar */}
              <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-slate-900 to-emerald-500 opacity-70" />
            </a>
          );
        })}
      </div>

      {/* Tip box */}
      <div className="mt-8 rounded-2xl bg-slate-50 ring-1 ring-black/5 p-5">
        <h3 className="font-semibold text-slate-900">Quick tip</h3>
        <p className="text-sm text-slate-600 mt-1">
          For faster help, tell us exactly what you’re trying to do (example: “I
          can’t checkout”, “I can’t access RateGen”, “Course purchase failed”)
          and include a screenshot.
        </p>
      </div>
    </div>
  );
}
