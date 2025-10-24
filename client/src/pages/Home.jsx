// src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store.jsx";

export default function Home() {
  const { accessToken, user } = useAuth(); // either is fine to check

  const isAuthed = Boolean(accessToken || (user && user.email));

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="rounded-2xl p-8 md:p-12 bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <h1 className="text-3xl md:text-4xl font-semibold">
          ADLM — The QS ConTech Hub
        </h1>
        <p className="mt-3 max-w-2xl text-blue-100">
          Central platform for Quantity Surveyors and Contractors to discover,
          subscribe, and manage ADLM tools: RateGen, Revit Plugin, and PlanSwift
          Plugin.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            className="btn bg-white text-blue-700 hover:bg-blue-50"
            to="/products"
          >
            Explore Products
          </Link>

          {!isAuthed && (
            <Link
              className="btn bg-blue-900/30 border border-white/30"
              to="/login"
            >
              Sign in
            </Link>
          )}
        </div>
      </section>

      {/* About */}
      <section className="card">
        <h2 className="text-xl font-semibold">About ADLM</h2>
        <p className="mt-2 text-slate-700">
          ADLM builds practical cost-engineering tools for Africa—accelerating
          BoQs, take-offs, and rate build-ups. Our plugins integrate with Revit
          and PlanSwift, while RateGen delivers fast, standards-aligned pricing.
        </p>
      </section>

      {/* Overview */}
      <section className="card">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: "Products",
              desc: "RateGen, Revit Plugin, PlanSwift Plugin—one account, unified licensing.",
            },
            {
              title: "Subscriptions",
              desc: "Monthly, 6-month, and yearly plans. Pay in ₦ or $. Device-bound licenses.",
            },
            {
              title: "Training",
              desc: "QS/BIM/MEP modules, videos, and certifications (MVP scope ready).",
            },
            {
              title: "User Dashboard",
              desc: "Manage subscriptions, invoices, downloads, and training progress.",
            },
            {
              title: "Admin",
              desc: "Approve purchases, manage entitlements, view analytics.",
            },
            {
              title: "Security",
              desc: "JWT auth, TLS, hashed passwords, license server with device-lock.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border bg-white p-5">
              <div className="font-medium">{c.title}</div>
              <div className="mt-1 text-sm text-slate-600">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
