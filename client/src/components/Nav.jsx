import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { api } from "../api.js";

export default function Nav() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" }); // clears cookie server-side
    } catch {} // ignore
    clear(); // drop client state immediately
    navigate("/login", { replace: true }); // go to login
    // ensure no instant silent rehydrate from a still-cached cookie
    setTimeout(() => window.location.reload(), 0);
  }

  return (
    <nav className="bg-white/90 backdrop-blur border-b sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold text-blue-700">
          ADLM
        </Link>

        <div className="flex items-center gap-5">
          {/* <Link to="/" className="text-sm">
            Home
          </Link> */}
          <Link to="/products" className="text-sm">
            Products
          </Link>
          <Link to="/learn" className="text-sm">
            Learn
          </Link>

          {!user ? (
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
          ) : (
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
              <button onClick={logout} className="btn btn-sm" disabled={busy}>
                {busy ? "Logging out…" : "Logout"}
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
