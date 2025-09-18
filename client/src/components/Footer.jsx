// src/components/Footer.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-600 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          © {new Date().getFullYear()} ADLM Studio • All rights reserved.
        </div>
        <nav className="flex gap-4">
          <Link to="/products" className="hover:text-slate-900">
            Products
          </Link>
          <a
            href="mailto:admin@adlmstudio.net"
            className="hover:text-slate-900"
          >
            Contact
          </a>
          <a href="#" className="hover:text-slate-900">
            Privacy
          </a>
          <a href="#" className="hover:text-slate-900">
            Terms
          </a>
        </nav>
      </div>
    </footer>
  );
}
