// src/pages/Products.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.js";

const products = [
  {
    key: "rategen",
    name: "RateGen",
    blurb:
      "Rapid rate build-ups with material & labour libraries. BESMM4R-aligned.",
  },
  {
    key: "planswift",
    name: "PlanSwift Plugin",
    blurb: "2D takeoff automation for QS workflows. Export to BoQ quickly.",
  },
  {
    key: "revit",
    name: "Revit Plugin",
    blurb: "BIM quantity extraction + schedules for architectural models.",
  },
  {
    key: "mep",
    name: "Revit MEP Plugin",
    blurb: "MEP-focused takeoffs and schedules from Revit.",
  },
];

export default function Products() {
  const { user } = useAuth();
  const navigate = useNavigate();

  function handlePurchase(key) {
    // force sign-in before purchase
    if (!user) {
      const next = encodeURIComponent(`/purchase?productKey=${key}`);
      return navigate(`/login?next=${next}`);
    }
    navigate(`/purchase?productKey=${key}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p) => (
          <article key={p.key} className="card flex flex-col">
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-slate-600">{p.blurb}</p>
            </div>
            <div className="mt-4">
              <button
                className="btn w-full"
                onClick={() => handlePurchase(p.key)}
              >
                Purchase
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
