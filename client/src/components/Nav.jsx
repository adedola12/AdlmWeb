import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { api } from "../api.js";
import adlmLogo from "../assets/logo/adlmLogo.png";

function DesktopLink({ to, children }) {
  const { pathname } = useLocation();
  const active =
    (to === "/" && pathname === "/") || (to !== "/" && pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={`px-3 py-1 rounded text-sm transition ${
        active
          ? "bg-white/10 text-white"
          : "text-white/80 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileLink({ to, children, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block w-full text-left px-4 py-3 text-[15px] text-slate-100/90 hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

export default function Nav() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  React.useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : orig || "";
    return () => (document.body.style.overflow = orig || "");
  }, [open]);

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
      {/* DARK TOP BAR */}
      <header className="sticky top-0 z-50 bg-blue-950/95 backdrop-blur border-b border-blue-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={adlmLogo} alt="ADLM Logo" className="w-7 h-7" />
            <span className="hidden sm:inline text-white font-semibold">
              ADLM_Studio
            </span>
          </Link>

          {/* Center links (desktop) */}
          <nav className="hidden md:flex items-center gap-1">
            <DesktopLink to="/">Home</DesktopLink>
            <DesktopLink to="/products">Products</DesktopLink>
            <DesktopLink to="/about">About</DesktopLink>
            <DesktopLink to="/learn">Learn</DesktopLink>
          </nav>

          {/* Right side actions */}
          <div className="hidden md:flex items-center gap-2">
            {!user ? (
              <>
                <Link
                  to={`/login?next=${next}`}
                  className="px-3 py-1 rounded border border-white/30 text-white/90 hover:bg-white/10 text-sm"
                >
                  Login
                </Link>
                <Link
                  to={`/signup?next=${next}`}
                  className="px-3 py-1 rounded bg-white text-blue-800 text-sm font-medium hover:bg-blue-50"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                <DesktopLink to="/purchase">Purchase</DesktopLink>
                <DesktopLink to="/dashboard">Dashboard</DesktopLink>
                <DesktopLink to="/profile">Profile</DesktopLink>
                {user.role === "admin" && (
                  <DesktopLink to="/admin">Admin</DesktopLink>
                )}
                <button
                  onClick={logout}
                  className="ml-1 px-3 py-1 rounded bg-white text-blue-900 text-sm font-medium hover:bg-blue-50"
                  disabled={busy}
                >
                  {busy ? "Logging out…" : "Logout"}
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden inline-flex items-center justify-center p-2 rounded text-white/90 hover:bg-white/10"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity md:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-80 max-w-[85%] bg-blue-950 text-white shadow-lg transition-transform md:hidden
        ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
          <Link to="/" onClick={() => setOpen(false)} className="font-semibold">
            ADLM_Studio
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded hover:bg-white/10"
            aria-label="Close menu"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="py-2">
          <MobileLink to="/" onClick={() => setOpen(false)}>
            Home
          </MobileLink>
          <MobileLink to="/products" onClick={() => setOpen(false)}>
            Products
          </MobileLink>
          <MobileLink to="/about" onClick={() => setOpen(false)}>
            About
          </MobileLink>

          {!user ? (
            <>
              <MobileLink
                to={`/login?next=${next}`}
                onClick={() => setOpen(false)}
              >
                Sign in
              </MobileLink>
              <MobileLink
                to={`/signup?next=${next}`}
                onClick={() => setOpen(false)}
              >
                Sign up
              </MobileLink>
            </>
          ) : (
            <>
              <MobileLink to="/purchase" onClick={() => setOpen(false)}>
                Purchase
              </MobileLink>
              <MobileLink to="/dashboard" onClick={() => setOpen(false)}>
                Dashboard
              </MobileLink>
              <MobileLink to="/profile" onClick={() => setOpen(false)}>
                Profile
              </MobileLink>
              {user.role === "admin" && (
                <MobileLink to="/admin" onClick={() => setOpen(false)}>
                  Admin
                </MobileLink>
              )}
              <div className="px-4 pt-2">
                <button
                  onClick={logout}
                  className="w-full px-4 py-2 rounded bg-white text-blue-900 font-medium hover:bg-blue-50"
                  disabled={busy}
                >
                  {busy ? "Logging out…" : "Logout"}
                </button>
              </div>
            </>
          )}
        </nav>

        <div className="mt-auto px-4 py-3 border-t border-white/10 text-xs text-white/60">
          © {new Date().getFullYear()} ADLM Studio
        </div>
      </aside>
    </>
  );
}
