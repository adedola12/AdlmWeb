// src/components/Nav.jsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { api } from "../api.js";

export default function Nav() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    clear();
    navigate("/login");
  }

  return (
    <nav className="bg-white/90 backdrop-blur border-b sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold text-blue-700">
          ADLM
        </Link>

        <div className="flex items-center gap-5">
          <Link to="/" className="text-sm">
            Home
          </Link>
          <Link to="/products" className="text-sm">
            Products
          </Link>

          {!user && (
            <div className="flex items-center gap-5">
              <Link
                to={`/login?next=${encodeURIComponent(
                  loc.pathname + loc.search
                )}`}
                className="text-sm"
              >
                Sign in
              </Link>

              <Link
                to={`/signup?next=${encodeURIComponent(
                  loc.pathname + loc.search
                )}`}
                className="text-sm"
              >
                Sign up
              </Link>
            </div>
          )}

          {user && (
            <>
              <Link to="/purchase" className="text-sm">
                Purchase
              </Link>
              <Link to="/dashboard" className="text-sm">
                Dashboard
              </Link>
              <Link to="/profile" className="text-sm">
                Profile
              </Link>
              {user.role === "admin" && (
                <Link to="/admin" className="text-sm">
                  Admin
                </Link>
              )}
              <Link to="/change-password" className="text-sm">
                Change password
              </Link>
              <button onClick={logout} className="btn btn-sm">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
