import React, { useState } from "react";
import { Link } from "react-router-dom";
import appleLogo from "../assets/icons/apple-logo.png";
import googlePlayLogo from "../assets/icons/playstore.png";
import ComingSoonModal from "./ComingSoonModal.jsx";

export default function Footer() {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  const closeComingSoonModal = () => {
    setShowComingSoonModal(false);
  };

  return (
    <footer className="bg-blue-950 text-white">
      <ComingSoonModal
        show={showComingSoonModal}
        onClose={closeComingSoonModal}
      />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 grid place-items-center rounded bg-white/20 font-bold">
                AS
              </div>
              <span className="font-semibold">ADLM Studio</span>
            </div>
            <p className="mt-3 text-white/70 text-sm">
              Digital tools and training for modern Quantity Surveyors.
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

          <div>
            <div className="font-semibold">Get the App</div>
            <div className="mt-3 space-y-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setShowComingSoonModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <img
                  src={appleLogo}
                  alt="Apple App Store"
                  className="w-6 h-6"
                />
                <div>
                  <div className="text-xs">Download on the</div>
                  <div className="text-lg font-semibold">App Store</div>
                </div>
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setShowComingSoonModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <img
                  src={googlePlayLogo}
                  alt="Google Play Store"
                  className="w-6 h-6"
                />
                <div>
                  <div className="text-xs">GET IT ON</div>
                  <div className="text-lg font-semibold">Google Play</div>
                </div>
              </a>
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
