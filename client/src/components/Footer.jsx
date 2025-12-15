import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import appleLogo from "../assets/icons/apple-logo.png";
import googlePlayLogo from "../assets/icons/playstore.png";
import ComingSoonModal from "./ComingSoonModal.jsx";

const DRIVE_APP_URL =
  "https://drive.google.com/file/d/1dICSLBCbSERq6VwLmCvrisPjSKq_sg8v/view?usp=drive_link";

export default function Footer() {
  const navigate = useNavigate();

  // ✅ routes that REALLY exist in your router
  const availableRoutes = useMemo(
    () =>
      new Set([
        "/products",
        "/learn",
        "/about",
        "/trainings",
        "/testimonials",
        "/dashboard",
        "/profile",
      ]),
    []
  );

  // ✅ patterns that exist (dynamic)
  const availablePatterns = useMemo(
    () => [
      /^\/product\/[^/]+$/, // /product/:key
      /^\/trainings\/[^/]+$/, // /trainings/:id
      /^\/learn\/course\/[^/]+$/, // /learn/course/:sku
      /^\/learn\/free\/[^/]+$/, // /learn/free/:id
      /^\/projects\/[^/]+$/, // /projects/:tool
    ],
    []
  );

  // Wrapper for internal routes:
  // - If route exists -> navigate
  // - If not -> show modal
  const SmartLink = ({ to, label, className = "", children }) => {
    const raw = String(to);
    const path = raw.split("#")[0]; // allow hashes
    const isAvailable =
      availableRoutes.has(path) ||
      availablePatterns.some((re) => re.test(path));

    return (
      <button
        type="button"
        className={`text-left hover:underline ${className}`}
        onClick={() => {
          if (isAvailable) navigate(raw);
          else openNotAvailable(label);
        }}
      >
        {children}
      </button>
    );
  };

  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [modalInfo, setModalInfo] = useState({
    title: "Page not available",
    message:
      "Sorry, this page isn’t available yet. Please explore our products while we finish this section.",
  });

  const closeComingSoonModal = () => setShowComingSoonModal(false);

  const openNotAvailable = (label = "This page") => {
    setModalInfo({
      title: "Sorry — page not available",
      message: `${label} isn’t available yet. Please explore our products while we finish this section.`,
    });
    setShowComingSoonModal(true);
  };

  return (
    <footer className="bg-blue-950 text-white">
      {/* ComingSoonModal remains your existing modal component */}
      <ComingSoonModal
        show={showComingSoonModal}
        onClose={closeComingSoonModal}
        title={modalInfo.title}
        message={modalInfo.message}
      >
        {/* If your ComingSoonModal doesn't support children, skip this block and
            update ComingSoonModal to accept children. If it already supports it, great. */}
        <div className="space-y-3">
          <div className="text-lg font-semibold">{modalInfo.title}</div>
          <p className="text-white/80 text-sm">{modalInfo.message}</p>

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/products"
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-white text-blue-950 font-semibold hover:bg-white/90"
              onClick={() => setShowComingSoonModal(false)}
            >
              Explore Products
            </Link>

            <a
              href={DRIVE_APP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-emerald-500 text-white font-semibold hover:bg-emerald-600"
            >
              Download Mobile App now
            </a>
          </div>
        </div>
      </ComingSoonModal>

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
                <SmartLink to="/product/rategen" label="RateGen">
                  RateGen
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/product/revit" label="Revit Plugin">
                  Revit Plugin
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/product/planswift" label="PlanSwift Plugin">
                  PlanSwift Plugin
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/learn" label="Training & Certifications">
                  Training & Certifications
                </SmartLink>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Company</div>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <SmartLink to="/about" label="About Us">
                  About Us
                </SmartLink>
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
                <SmartLink to="/careers" label="Careers">
                  Careers
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/press" label="Press">
                  Press
                </SmartLink>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Legal</div>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <SmartLink to="/privacy" label="Privacy Policy">
                  Privacy Policy
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/terms" label="Terms of Service">
                  Terms of Service
                </SmartLink>
              </li>
              <li>
                <SmartLink to="/licensing" label="Licensing">
                  Licensing
                </SmartLink>
              </li>
            </ul>
            <div className="mt-4 text-sm text-white/80">
              Lagos, Nigeria · Mon–Fri · 9am–6pm (WAT)
            </div>
          </div>

          <div>
            <div className="font-semibold">Get the App</div>
            <div className="mt-3 space-y-2">
              {/* Apple = not ready yet -> show modal */}
              <button
                type="button"
                onClick={() => openNotAvailable("App Store download")}
                className="w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <img
                  src={appleLogo}
                  alt="Apple App Store"
                  className="w-6 h-6"
                />
                <div className="text-left">
                  <div className="text-xs">Download on the</div>
                  <div className="text-lg font-semibold">App Store</div>
                </div>
              </button>

              {/* Google Play = your Drive build for now */}
              <a
                href={DRIVE_APP_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <img
                  src={googlePlayLogo}
                  alt="Google Play Store"
                  className="w-6 h-6"
                />
                <div>
                  <div className="text-xs">DOWNLOAD</div>
                  <div className="text-lg font-semibold">Mobile App Now</div>
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
