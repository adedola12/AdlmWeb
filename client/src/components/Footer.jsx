import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-blue-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 grid place-items-center rounded bg-white/20 font-bold">
                AS
              </div>
              <span className="font-semibold">ADLM Studio</span>
            </div>
            <p className="mt-3 text-white/70 text-sm">
              We provide a complete digital toolkit for Quantity Surveyors—Rate
              build-ups, 2D/3D take-off, training and certifications.
            </p>
          </div>

          <div>
            <div className="font-semibold">Products</div>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <Link to="/products#rategen" className="hover:underline">
                  RateGen
                </Link>
              </li>
              <li>
                <Link to="/products#revit" className="hover:underline">
                  Revit Plugin
                </Link>
              </li>
              <li>
                <Link to="/products#planswift" className="hover:underline">
                  PlanSwift Plugin
                </Link>
              </li>
              <li>
                <Link to="/learn" className="hover:underline">
                  Training & Certifications
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Company</div>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <Link to="/about" className="hover:underline">
                  About Us
                </Link>
              </li>
              <li>
                <a
                  href="mailto:admin@adlmstudio.net"
                  className="hover:underline"
                >
                  Contact
                </a>
              </li>
              <li>
                <Link to="/careers" className="hover:underline">
                  Careers
                </Link>
              </li>
              <li>
                <Link to="/press" className="hover:underline">
                  Press
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Legal</div>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <Link to="/privacy" className="hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/licensing" className="hover:underline">
                  Licensing
                </Link>
              </li>
            </ul>
            <div className="mt-4 text-sm text-white/80">
              Lagos, Nigeria · Mon–Fri · 9am–6pm (WAT)
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} ADLM Studio. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
