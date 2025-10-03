// src/components/Nav.jsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { api } from "../api.js";
import adlmLogo from "../assets/logo/adlmLogo.png";

function MenuLink({ to, children, onClick, className = "" }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block px-4 py-3 text-base hover:bg-slate-50 rounded-md ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Nav() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // Close drawer on route change
  React.useEffect(() => {
    setOpen(false);
  }, [loc.pathname, loc.search]);

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    const orig = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = orig || "";
    return () => (document.body.style.overflow = orig || "");
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    clear();
    navigate("/login", { replace: true });
    setTimeout(() => window.location.reload(), 0);
  }

  const next = encodeURIComponent(loc.pathname + loc.search);

  return (
    <>
      <nav className="bg-white/90 backdrop-blur border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold text-blue-700"
          >
            <img
              src={adlmLogo}
              alt="ADLM Logo"
              className="w-8 h-8 object-contain"
            />
            <span className="hidden sm:inline">ADLM_Studio</span>
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center gap-5">
            <Link to="/products" className="text-sm">
              Products
            </Link>
            <Link to="/learn" className="text-sm">
              Learn
            </Link>

            {!user ? (
              <div className="flex items-center gap-5">
                <Link to={`/login?next=${next}`} className="text-sm">
                  Sign in
                </Link>
                <Link to={`/signup?next=${next}`} className="text-sm">
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

          {/* Mobile hamburger */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {/* Hamburger icon */}
            <svg
              className="h-6 w-6 text-slate-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Slide-out drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85%] bg-white border-r shadow-lg transition-transform md:hidden
        ${open ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <Link
            to="/"
            className="font-semibold text-blue-700"
            onClick={() => setOpen(false)}
          >
            ADLM
          </Link>
          <button
            className="rounded-md p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            {/* X icon */}
            <svg
              className="h-6 w-6 text-slate-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="py-2">
          <MenuLink to="/products" onClick={() => setOpen(false)}>
            Products
          </MenuLink>
          <MenuLink to="/learn" onClick={() => setOpen(false)}>
            Learn
          </MenuLink>

          {!user ? (
            <>
              <MenuLink
                to={`/login?next=${next}`}
                onClick={() => setOpen(false)}
              >
                Sign in
              </MenuLink>
              <MenuLink
                to={`/signup?next=${next}`}
                onClick={() => setOpen(false)}
              >
                Sign up
              </MenuLink>
            </>
          ) : (
            <>
              <MenuLink to="/purchase" onClick={() => setOpen(false)}>
                Purchase
              </MenuLink>
              <MenuLink to="/dashboard" onClick={() => setOpen(false)}>
                Dashboard
              </MenuLink>
              <MenuLink to="/profile" onClick={() => setOpen(false)}>
                Profile
              </MenuLink>
              {user.role === "admin" && (
                <MenuLink to="/admin" onClick={() => setOpen(false)}>
                  Admin
                </MenuLink>
              )}

              <div className="px-4 pt-2">
                <button onClick={logout} className="btn w-full" disabled={busy}>
                  {busy ? "Logging out…" : "Logout"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Optional footer */}
        <div className="mt-auto px-4 py-3 border-t text-xs text-slate-500">
          © {new Date().getFullYear()} ADLM
        </div>
      </aside>
    </>
  );
}
